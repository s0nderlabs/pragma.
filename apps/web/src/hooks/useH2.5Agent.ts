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

import { createBrowserAgent, validateBrowserEnvironment } from '@/lib/h2.5/createBrowserAgent';
import { createDirectWeb3AuthBridge } from '@/lib/h2.5/directWeb3AuthBridge';
import { streamBrowserAgent } from '@/lib/h2.5/browserAgentRunner';
import { streamSummarize } from '@/lib/h2.5/streamSummarize';
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

      switch (toolName) {
        case 'getSwapQuote':
        case 'executeSwap': {
          // Payload format: "FROM-TO" (e.g., "MON-DAK")
          const parts = payload.split('-');
          if (parts.length === 2) {
            const [from, to] = parts;
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
      console.error('[H2.5Agent] Initialization failed:', errorMessage);
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
    console.warn('[H2.5Agent] No stored smartAccount found, recreating (may cause AA34 on funding)');

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
        console.error('[H2.5Agent] Failed to create smartAccount/bundlerClient:', error);
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
  const sendMessage = useCallback(
    async (content: string) => {
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

      // Add user message to chat
      addMessage({
        role: 'user',
        content,
      });

      // Build message history for agent
      // Filter out tool messages - they're UI-only, not part of conversation history
      const messageHistory: MessageTuple[] = [
        ...messages
          .filter((msg) => msg.role !== "tool")
          .map((msg) => [msg.role, (msg as { content: string }).content] as MessageTuple),
        ['user', content],
      ];

      // Set streaming state
      setIsStreaming(true);

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
        const sessionWallet = createWalletClient({
          account: privateKeyToAccount(
            sessionData.sessionKeyPrivateKey as Hex,
            { nonceManager }  // Enable atomic nonce management for parallel operations
          ),
          chain: monadDevnet,
          transport: authenticatedTransport,  // Authenticated RPC proxy
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
          },

          onToolEnd: (toolName, output, signature) => {
            // Use signature to match the correct tool in parallel execution
            const toolKey = signature || toolName;
            completeTool(toolName, toolKey, output);
            hideProgress();

            // Set flag so next token gets automatic spacing if needed
            justCompletedToolRef.current = true;

            // Capture raw tool output if it contains rich content markers
            // LLM rewrites tool output, losing markers like __nft_gallery__
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

            // Check for rich content markers
            if (outputStr && outputStr.includes('__nft_gallery__')) {
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
            ];
            if (transactionTools.includes(toolName)) {
              // Trigger balance refresh immediately after transaction completes
              useH2ChatStore.getState().triggerBalanceRefresh();
            }
          },

          onToolError: (toolName, error, signature) => {
            // Use signature to match the correct tool in parallel execution
            const toolKey = signature || toolName;
            errorTool(toolName, toolKey, error);
            hideProgress();
          },

          onComplete: () => {
            // Stop flush interval and flush any remaining buffers
            clearInterval(flushInterval);
            flushReasoningBuffer();
            flushTokenBuffer();

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
          },

          onError: (error) => {
            // Stop flush interval and flush any remaining buffers
            clearInterval(flushInterval);
            flushReasoningBuffer();
            flushTokenBuffer();

            console.error('[H2.5Agent] Execution error:', error);
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
        await streamBrowserAgent(
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
          callbacks
        );
      } catch (error) {
        console.error('[H2.5Agent] Message send failed:', error);
        setIsStreaming(false);
        hideProgress();

        addMessage({
          role: 'system',
          content: `Failed to send message: ${
            error instanceof Error ? error.message : 'Unknown error'
          }. Please try again.`,
        });
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
    ]
  );

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

    // Utility
    isReady: isInitialized && !initError && !!wallet && !!sessionData,
  };
}
