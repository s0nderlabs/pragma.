/**
 * useH2.5Agent Hook
 *
 * React hook for client-side LangChain agent execution.
 * This is the H2.5 equivalent of useH2Agent, but runs entirely in the browser.
 *
 * Key Differences from useH2Agent:
 * - No SSE connection - direct agent invocation
 * - No signature coordinator - direct wallet access
 * - No network overhead - all execution local
 * - Simpler state management - no connection states
 *
 * Usage:
 * ```typescript
 * const { sendMessage, messages, isExecuting } = useH2.5Agent();
 *
 * await sendMessage('swap 1 MON to USDC');
 * ```
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useH2ChatStore } from '@/stores/useH2ChatStore';
import { useIdentity } from './useIdentity';
import { createPublicClient, createWalletClient, custom, type Hex } from 'viem';
import { privateKeyToAccount, nonceManager } from 'viem/accounts';
import { monadDevnet } from '@/lib/chains';
import { authenticatedFetch } from '@/lib/api/authenticatedFetch';
import { createSyncTransport, createLogger } from '@pragma/core';

const logger = createLogger('[H2.5Agent]');

/** Max auto-retry attempts for hallucination detection */
const MAX_HALLUCINATION_RETRIES = 2;

import { createBrowserAgent, validateBrowserEnvironment } from '@/lib/h2.5/createBrowserAgent';
import { createDirectWeb3AuthBridge } from '@/lib/h2.5/directWeb3AuthBridge';
import { streamBrowserAgent } from '@/lib/h2.5/browserAgentRunner';
import { streamSummarize } from '@/lib/h2.5/streamSummarize';
import { detectHallucination, getRetryPrompt, getMatchedPattern } from '@/lib/h2.5/hallucinationDetector';
import type { MessageTuple, BrowserAgentCallbacks } from '@/lib/h2.5/browserAgentRunner';
import { createHybridDelegatorHandle } from '@/lib/onboarding/hybridDelegator';
import { useNotificationStore } from '@/stores/useNotificationStore';
// Note: sponsorUserOperation import removed - session key funding is now self-paid
import type { HybridDelegatorHandle } from '@/lib/onboarding/hybridDelegator';

/**
 * H2.5 Agent Hook
 *
 * Manages client-side LangChain agent execution with streaming updates.
 * Uses same store and UI patterns as H2, but with browser-based execution.
 */
export function useH2_5Agent() {
  const agentRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // State for smartAccount and bundlerClient (needed for session key funding)
  const [smartAccount, setSmartAccount] = useState<HybridDelegatorHandle['smartAccount'] | null>(null);
  const [bundlerClient, setBundlerClient] = useState<HybridDelegatorHandle['bundlerClient'] | null>(null);

  // Get wallet from identity (needed for direct bridge)
  const { wallet } = useIdentity();

  // Store selectors (same as H2)
  const messages = useH2ChatStore((state) => state.messages);
  const quickMode = useH2ChatStore((state) => state.quickMode);
  const sessionData = useH2ChatStore((state) => state.sessionData);
  const allowedTokens = useH2ChatStore((state) => state.allowedTokens);
  const allTokens = useH2ChatStore((state) => state.allTokens); // User's balance data for unverified token resolution
  const isStreaming = useH2ChatStore((state) => state.isStreaming);

  // Store actions (same as H2)
  const addMessage = useH2ChatStore((state) => state.addMessage);
  const updateMessageContent = useH2ChatStore((state) => state.updateMessageContent);
  const setMessageRawToolOutput = useH2ChatStore((state) => state.setMessageRawToolOutput);
  const updateMessageReasoning = useH2ChatStore((state) => state.updateMessageReasoning);
  const addReasoningSegment = useH2ChatStore((state) => state.addReasoningSegment);
  const updateReasoningSegmentSummary = useH2ChatStore((state) => state.updateReasoningSegmentSummary);
  const appendReasoningSegmentSummary = useH2ChatStore((state) => state.appendReasoningSegmentSummary);
  const setSegmentSummarizing = useH2ChatStore((state) => state.setSegmentSummarizing);
  const setStreamingMessage = useH2ChatStore((state) => state.setStreamingMessage);
  const hideProgress = useH2ChatStore((state) => state.hideProgress);
  const startTool = useH2ChatStore((state) => state.startTool);
  const addToolStep = useH2ChatStore((state) => state.addToolStep);
  const completeTool = useH2ChatStore((state) => state.completeTool);
  const errorTool = useH2ChatStore((state) => state.errorTool);
  const updateToolDescription = useH2ChatStore((state) => state.updateToolDescription);
  const setIsStreaming = useH2ChatStore((state) => state.setIsStreaming);
  const completeAllRunningTools = useH2ChatStore((state) => state.completeAllRunningTools);

  // Defensive UX actions
  const markMessageAsStopped = useH2ChatStore((state) => state.markMessageAsStopped);
  const setLastUserMessageContent = useH2ChatStore((state) => state.setLastUserMessageContent);
  const setIsAutoRetrying = useH2ChatStore((state) => state.setIsAutoRetrying);
  const setExhaustedRetryMessageId = useH2ChatStore((state) => state.setExhaustedRetryMessageId);
  const resetRetryState = useH2ChatStore((state) => state.resetRetryState);

  /**
   * Create authenticated RPC transport
   * Uses authenticatedFetch to proxy RPC calls through /api/rpc with JWT + signature
   */
  const createAuthenticatedRpcTransport = () => custom({
    async request({ method, params }) {
      const response = await authenticatedFetch('/api/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        }),
      });

      if (!response.ok) {
        throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message || 'RPC error');
      }

      return data.result;
    },
  });

  /**
   * Format tool name to human-readable text (Title Case)
   */
  const formatToolName = (name: string): string => {
    // Convert camelCase and snake_case to spaced words with Title Case
    return name
      .replace(/_/g, ' ')                           // snake_case → spaced
      .replace(/([A-Z])/g, ' $1')                   // camelCase → spaced
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  /**
   * Generate human-readable description from tool name and signature
   * Uses signature to provide specific details (e.g., "getSwapQuote:MON-DAK" → "Swap MON → DAK")
   */
  const generateToolDescription = (toolName: string, signature?: string): string => {
    // If we have a signature, use it to generate specific description
    if (signature) {
      // Strip toolName prefix if present (e.g., "getSwapQuote:MON-DAK" → "MON-DAK")
      let payload = signature;
      if (signature.includes(':')) {
        payload = signature.split(':')[1];
      }

      // Helper to format token identifiers (truncate addresses for readability)
      const formatToken = (token: string): string => {
        // If it looks like an address (starts with 0X after uppercase), truncate it
        // Full symbol resolution will come from progress update
        if (token.startsWith('0X') && token.length > 10) {
          return `${token.slice(0, 6)}...`;
        }
        return token;
      };

      switch (toolName) {
        case 'getSwapQuote':
        case 'executeSwap': {
          // Payload format: "FROM-TO" (e.g., "MON-DAK" or "0X97401D...-MON")
          const parts = payload.split('-');
          if (parts.length === 2) {
            const from = formatToken(parts[0]);
            const to = formatToken(parts[1]);
            return toolName === 'getSwapQuote'
              ? `Swap ${from} → ${to}`
              : `Executing ${from} → ${to}`;
          }
          break;
        }
        case 'getBalance': {
          // Payload is token symbol
          return `Checking ${payload} balance`;
        }
        case 'transfer': {
          // Payload format: "TOKEN-ADDR" (e.g., "USDC-0x1234...")
          const parts = payload.split('-');
          if (parts.length === 2) {
            return `Transferring ${parts[0]}`;
          }
          break;
        }
        case 'stake':
        case 'unstakeRequest': {
          // Payload is amount
          return toolName === 'stake'
            ? `Staking ${payload} MON`
            : `Unstaking ${payload} aprMON`;
        }
        case 'wrap':
        case 'unwrap': {
          // Payload is amount
          return toolName === 'wrap'
            ? `Wrapping ${payload} MON`
            : `Unwrapping ${payload} WMON`;
        }
      }
    }

    // Fallback to generic descriptions (Title Case)
    switch (toolName) {
      // Swap operations
      case 'getSwapQuote':
        return 'Getting Swap Quote';
      case 'executeSwap':
        return 'Executing Swap';

      // Staking operations
      case 'stake':
        return 'Staking MON';
      case 'unstakeRequest':
        return 'Requesting Unstake';
      case 'unstakeClaim':
        return 'Claiming Unstaked MON';
      case 'checkUnstakeStatus':
        return 'Checking Unstake Status';

      // Token operations
      case 'transfer':
        return 'Transferring Tokens';
      case 'wrap':
        return 'Wrapping MON';
      case 'unwrap':
        return 'Unwrapping WMON';
      case 'getTokenInfo':
        return 'Getting Token Info';

      // Balance operations
      case 'getBalance':
        return 'Checking Balance';
      case 'getAllBalances':
        return 'Fetching All Balances';
      case 'getAccountInfo':
        return 'Getting Account Info';
      case 'listVerifiedTokens':
        return 'Listing Verified Tokens';
      case 'resolveName':
        return 'Looking Up Address';

      // Session key operations
      case 'checkSessionKeyBalance':
        return 'Checking Session Key Balance';
      case 'fundSessionKey':
        return 'Funding Session Key';
      case 'getSessionKeyBalance':
        return 'Getting Session Key Balance';
      case 'getSessionKeyPrivateKey':
        return 'Getting Session Key';
      case 'withdrawSessionKeyBalance':
        return 'Withdrawing Session Key Balance';

      // Search operations
      case 'web_search':
        return 'Searching the Web';
      case 'searchProtocolDocs':
      case 'search_protocol_docs':
        return 'Searching Protocol Docs';
      case 'searchToolDocs':
      case 'search_tool_docs':
        return 'Searching Tool Docs';

      // NFT operations
      case 'getMyNFTs':
        return 'Fetching Your NFTs';
      case 'browseCollection':
        return 'Browsing Collection';
      case 'getCollectionInfo':
        return 'Getting Collection Info';
      case 'getNFTDetails':
        return 'Getting NFT Details';
      case 'getNFTActivity':
        return 'Getting NFT Activity';
      case 'getTopCollections':
        return 'Getting Collections';
      case 'getNFTBuyQuote':
        return 'Getting NFT Quote';
      case 'executeNFTBuy':
        return 'Buying NFT';
      case 'transferNFT':
        return 'Transferring NFT';
      case 'listNFT':
        return 'Listing NFT';

      default:
        return formatToolName(toolName);
    }
  };

  /**
   * Initialize agent on mount
   * Validates environment and creates agent instance
   */
  useEffect(() => {
    try {
      // Validate browser environment (Zone.js, AsyncLocalStorage, etc)
      validateBrowserEnvironment();

      // Create agent (routes OpenAI calls through /api/h2/chat proxy)
      // API key is stored server-side and never exposed to browser
      agentRef.current = createBrowserAgent({
        apiKey: 'proxy', // Not used - proxy handles authentication
        model: 'gpt-5-mini',
        streaming: true,
      });

      setIsInitialized(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
      logger.error('Initialization failed:', errorMessage);
      setInitError(errorMessage);
    }
  }, []);

  /**
   * Initialize smartAccount and bundlerClient for session key funding
   *
   * CRITICAL: Must use the SAME smartAccount instance from onboarding, NOT recreate it.
   * Recreating smartAccount causes AA34 signature errors because:
   * - DTK's toMetaMaskSmartAccount() caches signer state internally
   * - Web3Auth provider state may change between calls
   * - New instance produces different signatures → AA34
   *
   * Flow:
   * 1. Check Zustand store for smartAccount saved during onboarding
   * 2. Use stored instance if available (prevents AA34)
   * 3. Only recreate as fallback (rarely needed, shows warning)
   */
  useEffect(() => {
    if (!wallet || !sessionData?.delegator) {
      // Reset state if wallet or session not available
      setSmartAccount(null);
      setBundlerClient(null);
      return;
    }

    // CRITICAL FIX: Get smartAccount from store (saved during onboarding)
    // This preserves the SAME instance used for deployment, preventing AA34
    const store = useH2ChatStore.getState();
    const storedSmartAccount = store.smartAccount;
    const storedBundlerClient = store.bundlerClient;

    if (storedSmartAccount && storedBundlerClient) {
      setSmartAccount(storedSmartAccount);
      setBundlerClient(storedBundlerClient);
      return;
    }

    // Fallback: Recreate if not in store (should rarely happen)
    // This handles edge cases like page refresh without full re-onboarding
    logger.warn('No stored smartAccount found, recreating (may cause AA34 on funding)');

    (async () => {
      try {
        // Create hybrid delegator handle (includes smartAccount + bundlerClient)
        const handle = await createHybridDelegatorHandle(
          wallet.walletClient,
          wallet.address
        );

        setSmartAccount(handle.smartAccount);
        setBundlerClient(handle.bundlerClient);

        // Save to store for consistency (in case this path is taken)
        store.setSmartAccount(handle.smartAccount);
        store.setBundlerClient(handle.bundlerClient);
      } catch (error) {
        logger.error('Failed to create smartAccount/bundlerClient:', error);
        // Don't fail the whole app - session key funding will fall back to delegation pattern
        setSmartAccount(null);
        setBundlerClient(null);
      }
    })();
  }, [wallet, sessionData?.delegator]);

  /**
   * Send message to agent
   * Runs agent in browser with direct wallet access
   *
   * Note: Progress events are handled via browserAgentRunner which subscribes
   * to the global emitter and bridges to callbacks.onProgress
   */
  /**
   * Send message options
   */
  interface SendMessageOptions {
    /** Current retry count for hallucination auto-retry (internal use) */
    retryCount?: number;
    /** Skip adding user message (for internal retries) */
    skipAddMessage?: boolean;
    /** Manual retry from MessageActions - inject instruction without showing in chat */
    isRetry?: boolean;
  }

  const sendMessage = useCallback(
    async (content: string, options?: SendMessageOptions) => {
      const retryCount = options?.retryCount ?? 0;
      const skipAddMessage = options?.skipAddMessage ?? false;
      const isRetry = options?.isRetry ?? false;

      // Check initialization
      if (!isInitialized || !agentRef.current) {
        useNotificationStore.getState().showErrorNotification(
          initError || 'Agent not initialized. Please refresh the page.'
        );
        return;
      }

      // Check wallet connection
      if (!wallet) {
        useNotificationStore.getState().showErrorNotification(
          'Wallet not connected'
        );
        return;
      }

      // Check session data
      const userAddress = sessionData?.delegator;
      if (!userAddress || !sessionData) {
        useNotificationStore.getState().showErrorNotification(
          'No session data. Please complete onboarding first.'
        );
        return;
      }

      // Clear any previous early stop indicator when user sends a new message
      useH2ChatStore.getState().setEarlyStopUserMessageId(null);

      // Add user message to chat (skip for internal retries)
      if (!skipAddMessage) {
        addMessage({
          role: 'user',
          content,
        });
      }

      // Store last user message for retry functionality (original, not modified)
      if (retryCount === 0) {
        setLastUserMessageContent(content);
      }

      // Build message history for agent
      // Filter out tool messages - they're UI-only, not part of conversation history
      const messageHistory: MessageTuple[] = [
        ...messages
          .filter((msg) => msg.role !== "tool")
          .map((msg) => [msg.role, (msg as { content: string }).content] as MessageTuple),
        ['user', content],
      ];

      // BUG FIX: For manual retry, inject instruction into message history (not visible in chat)
      // This keeps the retry prompt hidden from the user while guiding the agent
      if (isRetry) {
        const lastEntry = messageHistory[messageHistory.length - 1];
        if (lastEntry) {
          lastEntry[1] = `${lastEntry[1]}\n\n[IMPORTANT: Use proper tool calling, not text descriptions of tools]`;
        }
      }

      // FEATURE: Inject negative feedback context if user clicked thumbs down
      // This helps the agent understand the previous response was unhelpful
      const negativeFeedbackContext = useH2ChatStore.getState().negativeFeedbackContext;
      if (negativeFeedbackContext) {
        const lastEntry = messageHistory[messageHistory.length - 1];
        if (lastEntry) {
          lastEntry[1] = `${lastEntry[1]}\n\n${negativeFeedbackContext}`;
        }
        // Clear the context after use (one-time injection)
        useH2ChatStore.getState().setNegativeFeedbackContext(null);
      }

      // Set streaming state and create AbortController
      setIsStreaming(true);
      resetRetryState();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        // Create authenticated transport (shared by both clients)
        // This transport proxies all RPC calls through /api/rpc with JWT + signature
        const authenticatedTransport = createAuthenticatedRpcTransport();

        // Create public client for blockchain reads (with authenticated transport)
        const publicClient = createPublicClient({
          chain: monadDevnet,
          transport: authenticatedTransport,  // Authenticated RPC proxy
        });

        // Create session wallet with correct RPC URL and nonceManager
        // nonceManager enables atomic nonce coordination for parallel transactions
        // This prevents tools (like executeSwap) from creating their own wallet
        // with hardcoded testnet.monad.xyz from @pragma/core/h2/config.ts
        //
        // CRITICAL: Wrap with createSyncTransport for EIP-7966 optimization
        // This enables eth_sendRawTransactionSync for ~50% faster tx confirmations
        const sessionWallet = createWalletClient({
          account: privateKeyToAccount(
            sessionData.sessionKeyPrivateKey as Hex,
            { nonceManager }  // Enable atomic nonce management for parallel operations
          ),
          chain: monadDevnet,
          transport: createSyncTransport(authenticatedTransport),  // EIP-7966 + Authenticated RPC
        });

        // Create direct Web3Auth bridge (no network transport!)
        const web3authBridge = createDirectWeb3AuthBridge({
          walletClient: wallet.walletClient,
          ownerAddress: wallet.address as `0x${string}`,
        });

        // Token buffering with useRef to prevent race conditions
        // Using ref instead of closure variable ensures atomic updates
        // Flush every 50ms for snappy UI updates (reduced from 100ms)
        const tokenBufferRef = { current: '' };

        // Reasoning token buffering (for DeepSeek chain-of-thought)
        const reasoningBufferRef = { current: '' };        // Current unflushed tokens
        const currentSegmentRef = { current: '' };         // Current segment being built
        const reasoningStartTimeRef = { current: 0 };

        // Tool completion tracking for automatic spacing
        // When a tool completes, the next token should start with \n\n
        const justCompletedToolRef = { current: false };

        // Raw tool output tracking for rich content markers (NFT gallery, etc.)
        // LLM rewrites tool output, so we capture raw output in onToolEnd
        // and attach it to the final message for UI component detection
        const pendingRawOutputRef = { current: '' };

        // Hallucination detection tracking
        // Tracks accumulated content for pattern matching
        const accumulatedContentRef = { current: '' };
        const lastHallucinationCheckRef = { current: 0 }; // Last check position
        const hallucinationRetryTriggeredRef = { current: false }; // Prevent multiple triggers

        // Soft abort flags for hallucination handling
        // Instead of calling abort() from within onToken callback (which triggers zone.js errors and HMR),
        // we set these flags and let browserAgentRunner check them at the start of each iteration
        const hallucinationAbortRequestedRef = { current: false };
        const exhaustedAbortRequestedRef = { current: false };

        // Flag for onComplete hallucination detection (post-stream retry)
        // When onComplete detects hallucination, it sets this flag and returns early
        // The result handler will check this and schedule the retry
        const onCompleteHallucinationRef = { current: false };

        const flushTokenBuffer = () => {
          // Atomic read-and-clear operation to prevent race conditions
          const contentToFlush = tokenBufferRef.current;
          if (contentToFlush.length === 0) return;

          tokenBufferRef.current = '';

          const streamingId = useH2ChatStore.getState().streamingMessageId;
          if (streamingId) {
            // Use functional update to avoid race conditions
            // This ensures we're always appending to the latest state
            const currentMessages = useH2ChatStore.getState().messages;
            const currentMessage = currentMessages.find((msg) => msg.id === streamingId);
            if (currentMessage && 'content' in currentMessage) {
              updateMessageContent(streamingId, currentMessage.content + contentToFlush);
            }
          } else {
            // Create new assistant message
            addMessage({
              role: 'assistant',
              content: contentToFlush,
              isStreaming: true,
            });

            const newMessage = useH2ChatStore.getState().messages.at(-1);
            if (newMessage) {
              setStreamingMessage(newMessage.id);
            }
          }
        };

        // Flush reasoning buffer to current message (for live streaming display)
        const flushReasoningBuffer = () => {
          const reasoningToFlush = reasoningBufferRef.current;
          if (reasoningToFlush.length === 0) return;

          // Add to current segment
          currentSegmentRef.current += reasoningToFlush;
          reasoningBufferRef.current = '';

          const streamingId = useH2ChatStore.getState().streamingMessageId;
          if (streamingId) {
            // Update existing message with current segment for live display
            // This shows the current thinking while streaming
            updateMessageReasoning(streamingId, currentSegmentRef.current);
          } else {
            // Create new assistant message with just reasoning (content comes later)
            addMessage({
              role: 'assistant',
              content: '',
              isStreaming: true,
              reasoningContent: currentSegmentRef.current,
            });

            const newMessage = useH2ChatStore.getState().messages.at(-1);
            if (newMessage) {
              setStreamingMessage(newMessage.id);
            }
          }
        };

        // Finalize current reasoning segment (save to array, reset for next segment)
        const finalizeReasoningSegment = (duration?: number) => {
          // Flush any remaining buffered reasoning
          if (reasoningBufferRef.current.length > 0) {
            currentSegmentRef.current += reasoningBufferRef.current;
            reasoningBufferRef.current = '';
          }

          // Only save if there's content
          if (currentSegmentRef.current.length === 0) return;

          const cleanContent = currentSegmentRef.current.trim();
          const streamingId = useH2ChatStore.getState().streamingMessageId;

          if (streamingId) {
            // Add segment immediately and capture its ID for streaming summary
            const segmentId = addReasoningSegment(streamingId, cleanContent, duration, undefined);
            // Clear live reasoningContent since we moved it to segments
            updateMessageReasoning(streamingId, '');

            // Start streaming summary (no char limit - summarize ALL reasoning)
            setSegmentSummarizing(segmentId, true);
            streamSummarize(
              cleanContent,
              (token) => {
                // Append each token as it streams in
                appendReasoningSegmentSummary(segmentId, token);
              },
              (summary) => {
                // Complete - set final summary and clear summarizing flag
                updateReasoningSegmentSummary(segmentId, summary);
                setSegmentSummarizing(segmentId, false);
              },
              () => {
                // Error - just clear summarizing flag (silent fail)
                setSegmentSummarizing(segmentId, false);
              }
            );
          }

          // Reset for next segment
          currentSegmentRef.current = '';
          reasoningStartTimeRef.current = 0;
        };

        // Auto-flush interval for smooth streaming (50ms for snappy updates)
        const flushInterval = setInterval(() => {
          flushReasoningBuffer();
          flushTokenBuffer();
        }, 50);

        // Streaming callbacks for UI updates
        const callbacks: BrowserAgentCallbacks = {
          // Soft abort check for hallucination handling
          // browserAgentRunner checks this at the start of each event loop iteration
          // Returns 'hallucination' for retry, 'exhausted' when retries depleted
          shouldAbort: () => {
            if (exhaustedAbortRequestedRef.current) return 'exhausted';
            if (hallucinationAbortRequestedRef.current) return 'hallucination';
            return false;
          },

          // DeepSeek reasoning token callback (chain-of-thought)
          onReasoningToken: (token) => {
            // Start timing on first reasoning token
            if (reasoningStartTimeRef.current === 0) {
              reasoningStartTimeRef.current = Date.now();
            }

            // Accumulate reasoning in buffer (will be flushed by interval)
            reasoningBufferRef.current += token;
          },

          onToken: (token) => {
            // First content token = reasoning phase complete
            // Finalize current segment with duration
            if (reasoningStartTimeRef.current > 0 && tokenBufferRef.current.length === 0) {
              const reasoningDuration = Date.now() - reasoningStartTimeRef.current;
              // Finalize saves segment and resets for next one
              finalizeReasoningSegment(reasoningDuration);
            }

            // Safety net: Add spacing after tool completion if LLM didn't
            if (justCompletedToolRef.current) {
              const bufferEndsWithNewlines = tokenBufferRef.current.endsWith('\n\n');
              const tokenStartsWithNewline = token.startsWith('\n');

              if (!bufferEndsWithNewlines && !tokenStartsWithNewline) {
                tokenBufferRef.current += '\n\n';
              }

              justCompletedToolRef.current = false;
            }

            tokenBufferRef.current += token;

            // Accumulate content for hallucination detection
            accumulatedContentRef.current += token;

            // Check for hallucinations every 50 chars after 100 char threshold
            const contentLength = accumulatedContentRef.current.length;
            const shouldCheck =
              contentLength > 100 &&
              contentLength - lastHallucinationCheckRef.current >= 50 &&
              !hallucinationRetryTriggeredRef.current;

            if (shouldCheck) {
              lastHallucinationCheckRef.current = contentLength;

              if (detectHallucination(accumulatedContentRef.current)) {
                const matchedPattern = getMatchedPattern(accumulatedContentRef.current);

                // Check if we've exhausted retries
                if (retryCount >= MAX_HALLUCINATION_RETRIES) {
                  logger.warn(`Hallucination detected but retries exhausted: ${matchedPattern}`);
                  hallucinationRetryTriggeredRef.current = true;
                  // Track specific message that exhausted retries (not global)
                  const streamingId = useH2ChatStore.getState().streamingMessageId;
                  if (streamingId) {
                    setExhaustedRetryMessageId(streamingId);
                  }
                  // SOFT ABORT: Set flag instead of calling abort() directly
                  // browserAgentRunner will check this flag and return with abortReason: 'exhausted'
                  // This avoids throwing errors which can trigger HMR in dev mode
                  exhaustedAbortRequestedRef.current = true;
                  return;
                }

                logger.warn(`Hallucination detected (attempt ${retryCount + 1}/${MAX_HALLUCINATION_RETRIES}): ${matchedPattern}`);

                // Mark as triggered to prevent multiple retries
                hallucinationRetryTriggeredRef.current = true;

                // SOFT ABORT: Set flag instead of calling abort() directly
                // browserAgentRunner will check this flag on next event loop iteration
                // This avoids LangChain's zone.js error path which triggers HMR in dev mode
                hallucinationAbortRequestedRef.current = true;

                // Show retrying indicator
                setIsAutoRetrying(true);

                // Note: Retry is triggered in result.abortReason handler below
                // browserAgentRunner returns { abortReason: 'hallucination' } when flag is set
                // This avoids throwing errors which can trigger HMR in dev mode
              }
            }
          },

          onProgress: (message, toolName, signature, description) => {
            // Add progress as nested step in tool tree
            // Use signature for matching in parallel execution
            if (message) {
              let toolKey = signature || toolName;

              // Find currently running tool if not specified
              if (!toolKey) {
                const activeTools = useH2ChatStore.getState().activeTools;
                activeTools.forEach((tool, name) => {
                  if (tool.status === "running") {
                    toolKey = name;
                  }
                });
              }

              if (toolKey) {
                const displayToolName = toolName || toolKey;
                // Pass description to addToolStep so it gets buffered if tool not started yet
                addToolStep(displayToolName, toolKey, message, description);

                // Also try to update tool description directly (for tools already started)
                // This handles the case where tool starts before progress arrives
                if (description) {
                  updateToolDescription(toolKey, description);
                }
              }
            }
          },

          onToolStart: (toolName, _input, signature) => {
            // Finalize any pending reasoning segment before tool execution
            // This ensures reasoning from before tool call is saved as separate segment
            if (reasoningStartTimeRef.current > 0 || currentSegmentRef.current.length > 0) {
              const reasoningDuration = reasoningStartTimeRef.current > 0
                ? Date.now() - reasoningStartTimeRef.current
                : undefined;
              finalizeReasoningSegment(reasoningDuration);
            }

            // Generate description using signature for specifics (e.g., "Swap MON → DAK")
            const description = generateToolDescription(toolName, signature);
            // Use signature as unique key for parallel tool matching
            startTool(toolName, signature, description);

            // FEATURE: Track in-flight transactions for stop button disclaimer
            const transactionTools = [
              'executeSwap', 'transfer', 'stake', 'unstakeRequest', 'unstakeClaim',
              'wrap', 'unwrap', 'executeNFTBuy', 'transferNFT', 'listNFT',
              'fundSessionKey', 'withdrawSessionKeyBalance', // Session key funding/withdrawal
            ];
            if (transactionTools.includes(toolName)) {
              useH2ChatStore.getState().setHasInFlightTransaction(true);
            }
          },

          onToolEnd: (toolName, output, signature) => {
            // Use signature to match the correct tool in parallel execution
            const toolKey = signature || toolName;
            completeTool(toolName, toolKey, output);
            hideProgress();

            // Set flag so next token gets automatic spacing if needed
            justCompletedToolRef.current = true;

            // Capture raw tool output if it contains rich content markers
            // LLM may rewrite tool output, and markdown strips __underscores__ as bold formatting
            // We preserve the raw output for UI component detection in AIMessage

            // Extract string output - handle both string and object formats
            let outputStr = '';
            if (typeof output === 'string') {
              outputStr = output;
            } else if (output && typeof output === 'object') {
              // LangChain may wrap output in object with content/text property
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const outputObj = output as any;
              outputStr = outputObj.content || outputObj.text || outputObj.output || JSON.stringify(output);
            }

            // Check for rich content markers (HTML comments to avoid markdown stripping)
            if (outputStr && (outputStr.includes('<!--NFT_GALLERY-->') || outputStr.includes('<!--ACTIVITY_TABLE-->'))) {
              pendingRawOutputRef.current = outputStr;
            }

            // Trigger immediate balance refresh for transaction-based tools
            const transactionTools = [
              'executeSwap',
              'executeTransfer',
              'executeWrap',
              'executeUnwrap',
              'stake',
              'unstakeRequest',
              'unstakeClaim',
              'transfer',
              'wrap',
              'unwrap',
              'executeNFTBuy',
              'transferNFT',
              'listNFT',
            ];
            if (transactionTools.includes(toolName)) {
              // Trigger balance refresh immediately after transaction completes
              useH2ChatStore.getState().triggerBalanceRefresh();
              // Clear in-flight transaction flag
              useH2ChatStore.getState().setHasInFlightTransaction(false);
            }
          },

          onToolError: (toolName, error, signature) => {
            // Use signature to match the correct tool in parallel execution
            const toolKey = signature || toolName;
            errorTool(toolName, toolKey, error);
            hideProgress();

            // Clear in-flight transaction flag on error too
            const transactionTools = [
              'executeSwap', 'transfer', 'stake', 'unstakeRequest', 'unstakeClaim',
              'wrap', 'unwrap', 'executeNFTBuy', 'transferNFT', 'listNFT',
            ];
            if (transactionTools.includes(toolName)) {
              useH2ChatStore.getState().setHasInFlightTransaction(false);
            }
          },

          onComplete: () => {
            // Stop flush interval and flush any remaining buffers
            clearInterval(flushInterval);
            flushReasoningBuffer();
            flushTokenBuffer();

            // FINAL HALLUCINATION CHECK: Catch patterns at end of response
            // Periodic checks run every 50 chars and may miss hallucinations
            // appearing in the final <50 chars of a response
            if (!hallucinationRetryTriggeredRef.current &&
                accumulatedContentRef.current.length > 100) {

              if (detectHallucination(accumulatedContentRef.current)) {
                const matchedPattern = getMatchedPattern(accumulatedContentRef.current);

                if (retryCount >= MAX_HALLUCINATION_RETRIES) {
                  logger.warn(`[onComplete] Hallucination detected but retries exhausted: ${matchedPattern}`);
                  // Track specific message that exhausted retries
                  // Note: streamingId may be null here, find last assistant message
                  const messages = useH2ChatStore.getState().messages;
                  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
                  if (lastAssistant) {
                    setExhaustedRetryMessageId(lastAssistant.id);
                  }
                } else {
                  logger.warn(`[onComplete] Hallucination detected (attempt ${retryCount + 1}/${MAX_HALLUCINATION_RETRIES}): ${matchedPattern}`);
                  hallucinationRetryTriggeredRef.current = true;

                  // Set flag for post-stream retry (handled after streamBrowserAgent returns)
                  // This avoids scheduling retry from within callback which may trigger HMR
                  onCompleteHallucinationRef.current = true;

                  // Show retrying indicator and cleanup state
                  setIsAutoRetrying(true);
                  setStreamingMessage(null);
                  setIsStreaming(false);
                  hideProgress();
                  useH2ChatStore.getState().setHasInFlightTransaction(false);

                  return; // Don't proceed with normal completion - retry handled after stream returns
                }
              }
            }

            // Attach raw tool output to the LAST assistant message
            // NOTE: Can't use streamingMessageId - it's cleared when tools start (line 368 in store)
            // Instead, find the last assistant message which is the one we just finalized
            if (pendingRawOutputRef.current) {
              const messages = useH2ChatStore.getState().messages;
              // Find the last assistant message
              const lastAssistantMsg = [...messages].reverse().find(
                msg => msg.role === 'assistant'
              );

              if (lastAssistantMsg) {
                setMessageRawToolOutput(lastAssistantMsg.id, pendingRawOutputRef.current);
              }
              pendingRawOutputRef.current = '';
            }

            // Mark all running tools as completed to prevent cross-message pollution
            completeAllRunningTools();

            setStreamingMessage(null);
            setIsStreaming(false);
            hideProgress();

            // Clear in-flight transaction flag on completion
            useH2ChatStore.getState().setHasInFlightTransaction(false);
          },

          onError: (error) => {
            // Check if this is an abort error (user stop) - don't show error message
            const isAbortError = error instanceof Error && (
              error.name === 'AbortError' ||
              error.message?.toLowerCase().includes('abort') ||
              error.message === 'User stopped'
            );

            // Stop flush interval and flush any remaining buffers
            clearInterval(flushInterval);
            flushReasoningBuffer();
            flushTokenBuffer();

            // If user stopped, silently clean up without error message
            if (isAbortError) {
              setStreamingMessage(null);
              setIsStreaming(false);
              hideProgress();
              return;
            }

            // Handle actual execution errors (network, tool failures, etc)
            logger.error('Execution error:', error);
            setStreamingMessage(null);
            setIsStreaming(false);
            hideProgress();

            addMessage({
              role: 'system',
              content: `Error: ${error.message}. Please try again.`,
            });
          },
        };

        // Run agent in browser with streaming callbacks
        const result = await streamBrowserAgent(
          agentRef.current,
          messageHistory,
          {
            userAddress,
            sessionData: {
              sessionKeyAddress: sessionData.sessionKeyAddress!,
              sessionKeyPrivateKey: sessionData.sessionKeyPrivateKey!,
              ownerAddress: sessionData.ownerAddress!,
              chainId: sessionData.chainId!,
            },
            publicClient,
            web3authBridge,
            sessionWallet,
            transport: authenticatedTransport, // Pass authenticated transport to tools
            quickMode,
            allowedTokens,
            userBalances: allTokens, // User's balance data for unverified token symbol resolution
            // CRITICAL: Pass authenticated fetch for API proxy calls
            // Tools use this to make authenticated requests to /api/* routes
            fetch: authenticatedFetch,
            origin: typeof window !== 'undefined' ? window.location.origin : '',
            // CRITICAL FIX: Read directly from Zustand store, not local state
            // This avoids React state timing race where local state hasn't updated yet
            // after onboarding stores the smartAccount. Using getState() is synchronous.
            smartAccount: useH2ChatStore.getState().smartAccount || undefined,
            bundlerClient: useH2ChatStore.getState().bundlerClient || undefined,
            // Note: sponsorUserOperationFn removed - session key funding is now self-paid
          },
          callbacks,
          { signal: abortController.signal } // Pass abort signal for stop functionality
        );

        // Handle abort reasons from result (no errors thrown to avoid HMR)
        if (result.abortReason) {
          const store = useH2ChatStore.getState();

          if (result.abortReason === 'hallucination') {
            logger.info('Stream soft-aborted for hallucination retry');
            // Reset soft abort flag
            hallucinationAbortRequestedRef.current = false;

            // Schedule retry after brief delay
            setTimeout(async () => {
              setIsAutoRetrying(false);

              // Delete ALL messages after last user (assistant + tool messages)
              useH2ChatStore.getState().deleteMessagesAfterLastUser();

              // Get the original user message
              const originalMessage = useH2ChatStore.getState().lastUserMessageContent;
              if (originalMessage) {
                // Retry with modified prompt
                const retryPrompt = getRetryPrompt(originalMessage, retryCount);
                await sendMessage(retryPrompt, {
                  retryCount: retryCount + 1,
                  skipAddMessage: true, // Don't add duplicate user message
                });
              }
            }, 300);

            setStreamingMessage(null);
            setIsStreaming(false);
            hideProgress();
            store.setHasInFlightTransaction(false);
            return;
          }

          if (result.abortReason === 'user') {
            logger.info('Stream aborted by user');
            const messages = store.messages;

            // Find the last user message (start of current turn)
            let lastUserIndex = -1;
            let lastUserMsgId: string | null = null;
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i].role === 'user') {
                lastUserIndex = i;
                lastUserMsgId = messages[i].id;
                break;
              }
            }

            // Find assistant message in CURRENT turn only
            let currentTurnAssistantId: string | null = null;
            if (lastUserIndex >= 0) {
              for (let i = lastUserIndex + 1; i < messages.length; i++) {
                if (messages[i].role === 'assistant') {
                  currentTurnAssistantId = messages[i].id;
                  break;
                }
              }
            }

            if (currentTurnAssistantId) {
              markMessageAsStopped(currentTurnAssistantId);
              if (store.hasInFlightTransaction) {
                store.markMessageAsStoppedWithInFlightTx(currentTurnAssistantId);
              }
              store.setEarlyStopUserMessageId(null);
            } else if (lastUserMsgId) {
              store.setEarlyStopUserMessageId(lastUserMsgId);
            }

            completeAllRunningTools();
            setStreamingMessage(null);
            setIsStreaming(false);
            hideProgress();
            store.setHasInFlightTransaction(false);
            abortControllerRef.current = null;
            return;
          }

          if (result.abortReason === 'exhausted') {
            logger.info('Stream aborted - hallucination retries exhausted');
            // Delete the faulty assistant message that triggered exhaustion
            store.deleteMessagesAfterLastUser();
            setStreamingMessage(null);
            setIsStreaming(false);
            hideProgress();
            store.setHasInFlightTransaction(false);
            return;
          }
        }

        // Handle onComplete hallucination detection (post-stream retry)
        // This is set when onComplete detects hallucination but stream already completed
        if (onCompleteHallucinationRef.current) {
          logger.info('Post-stream hallucination detected, scheduling retry');
          onCompleteHallucinationRef.current = false;

          // Schedule retry with delay (outside of any callback context)
          setTimeout(async () => {
            setIsAutoRetrying(false);
            useH2ChatStore.getState().deleteMessagesAfterLastUser();

            const originalMessage = useH2ChatStore.getState().lastUserMessageContent;
            if (originalMessage) {
              const retryPrompt = getRetryPrompt(originalMessage, retryCount);
              await sendMessage(retryPrompt, {
                retryCount: retryCount + 1,
                skipAddMessage: true,
              });
            }
          }, 500);

          return;
        }
      } catch (error) {
        // Handle abort gracefully (user clicked stop)
        // Check for AbortError name OR abort-related messages (case-insensitive)
        const isAbortError = error instanceof Error && (
          error.name === 'AbortError' ||
          error.message?.toLowerCase().includes('abort') ||
          error.message === 'User stopped'
        );

        if (isAbortError) {
          logger.info('Stream aborted by user');
          const store = useH2ChatStore.getState();

          // BUG FIX: Find the last assistant message to mark as stopped
          // streamingMessageId is null during tool execution
          const messages = store.messages;
          // BUG FIX: Use same logic as onError handler - find assistant in CURRENT TURN only
          // Previous code found ANY assistant message, which broke early stop for Turn 2+
          let lastUserIndex = -1;
          let lastUserMsgId: string | null = null;

          // First, find the last user message (start of current turn)
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
              lastUserIndex = i;
              lastUserMsgId = messages[i].id;
              break;
            }
          }

          // Then, find assistant message in CURRENT turn only (after last user message)
          // This prevents finding assistant from previous turn
          let currentTurnAssistantId: string | null = null;
          if (lastUserIndex >= 0) {
            for (let i = lastUserIndex + 1; i < messages.length; i++) {
              if (messages[i].role === 'assistant') {
                currentTurnAssistantId = messages[i].id;
                break; // Found first assistant in current turn
              }
            }
          }

          if (currentTurnAssistantId) {
            // Agent responded in this turn - mark as stopped
            markMessageAsStopped(currentTurnAssistantId);
            if (store.hasInFlightTransaction) {
              store.markMessageAsStoppedWithInFlightTx(currentTurnAssistantId);
            }
            // Clear any early stop state since we have an assistant message in THIS turn
            store.setEarlyStopUserMessageId(null);
          } else if (lastUserMsgId) {
            // No assistant message in current turn - early stop
            store.setEarlyStopUserMessageId(lastUserMsgId);
          }

          completeAllRunningTools(); // Mark tools as done so spinners stop
          setStreamingMessage(null);
          setIsStreaming(false);
          hideProgress();
          useH2ChatStore.getState().setHasInFlightTransaction(false);
          abortControllerRef.current = null;
          return;
        }

        logger.error('Message send failed:', error);
        setIsStreaming(false);
        hideProgress();

        addMessage({
          role: 'system',
          content: `Failed to send message: ${
            error instanceof Error ? error.message : 'Unknown error'
          }. Please try again.`,
        });
      } finally {
        // Clean up abort controller
        abortControllerRef.current = null;
      }
    },
    [
      isInitialized,
      initError,
      wallet,
      sessionData,
      messages,
      quickMode,
      allowedTokens,
      allTokens, // User's balance data for unverified token resolution
      // Note: smartAccount and bundlerClient removed - now read directly from store
      addMessage,
      updateMessageContent,
      setMessageRawToolOutput,
      updateMessageReasoning,
      addReasoningSegment,
      setStreamingMessage,
      hideProgress,
      startTool,
      addToolStep,
      completeTool,
      errorTool,
      updateToolDescription,
      setIsStreaming,
      completeAllRunningTools,
      markMessageAsStopped,
      setLastUserMessageContent,
      resetRetryState,
    ]
  );

  /**
   * Stop the current message generation
   * Aborts the stream and marks the message as stopped
   */
  const stopMessage = useCallback(() => {
    if (abortControllerRef.current) {
      // Use DOMException with 'AbortError' name - this is the standard abort pattern
      // and won't trigger error overlays in Next.js dev mode
      abortControllerRef.current.abort(new DOMException('User stopped', 'AbortError'));
    }
  }, []);

  return {
    // State
    messages,
    isStreaming, // Match useH2Agent interface
    isExecuting: isStreaming, // Alias for clarity
    isInitialized,
    initError,
    quickMode,

    // Actions
    sendMessage,
    stopMessage,

    // Utility
    isReady: isInitialized && !initError && !!wallet && !!sessionData,
  };
}
