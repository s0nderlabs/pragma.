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
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount, nonceManager } from 'viem/accounts';
import { monadDevnet } from '@/lib/chains';

import { createBrowserAgent, validateBrowserEnvironment } from '@/lib/h2.5/createBrowserAgent';
import { createDirectWeb3AuthBridge } from '@/lib/h2.5/directWeb3AuthBridge';
import { streamBrowserAgent } from '@/lib/h2.5/browserAgentRunner';
import type { MessageTuple, BrowserAgentCallbacks } from '@/lib/h2.5/browserAgentRunner';
import { createHybridDelegatorHandle } from '@/lib/onboarding/hybridDelegator';
import type { HybridDelegatorHandle } from '@/lib/onboarding/hybridDelegator';
import { onProgress, offProgress } from '@pragma/core/h2/progress/emitter';

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
  const isStreaming = useH2ChatStore((state) => state.isStreaming);

  // Store actions (same as H2)
  const addMessage = useH2ChatStore((state) => state.addMessage);
  const updateMessageContent = useH2ChatStore((state) => state.updateMessageContent);
  const setStreamingMessage = useH2ChatStore((state) => state.setStreamingMessage);
  const hideProgress = useH2ChatStore((state) => state.hideProgress);
  const startTool = useH2ChatStore((state) => state.startTool);
  const addToolStep = useH2ChatStore((state) => state.addToolStep);
  const completeTool = useH2ChatStore((state) => state.completeTool);
  const errorTool = useH2ChatStore((state) => state.errorTool);
  const setIsStreaming = useH2ChatStore((state) => state.setIsStreaming);

  /**
   * Format tool name to human-readable text
   */
  const formatToolName = (name: string): string => {
    // Convert camelCase to spaced words and capitalize first letter
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  /**
   * Generate human-readable description from tool name
   * Note: LangChain streamEvents doesn't provide input in on_tool_start
   * Detailed values come through progress emitter as nested steps
   */
  const generateToolDescription = (toolName: string): string => {
    switch (toolName) {
      // Swap operations
      case 'getSwapQuote':
        return 'Getting swap quote';
      case 'executeSwap':
        return 'Executing swap';

      // Staking operations
      case 'stake':
        return 'Staking MON';
      case 'unstakeRequest':
        return 'Requesting unstake';
      case 'unstakeClaim':
        return 'Claiming unstaked MON';
      case 'checkUnstakeStatus':
        return 'Checking unstake status';

      // Token operations
      case 'transfer':
        return 'Transferring tokens';
      case 'wrap':
        return 'Wrapping MON';
      case 'unwrap':
        return 'Unwrapping WMON';

      // Balance operations
      case 'getBalance':
        return 'Checking balance';
      case 'getAllBalances':
        return 'Fetching all balances';
      case 'getAccountInfo':
        return 'Getting account info';
      case 'listVerifiedTokens':
        return 'Listing verified tokens';

      // Session key operations
      case 'checkSessionKeyBalance':
        return 'Checking session key balance';
      case 'fundSessionKey':
        return 'Funding session key';
      case 'getSessionKeyBalance':
        return 'Getting session key balance';
      case 'getSessionKeyPrivateKey':
        return 'Getting session key';
      case 'withdrawSessionKeyBalance':
        return 'Withdrawing session key balance';

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

      // Get OpenAI API key
      // TODO: In production, use proxy endpoint instead of direct key
      const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          'NEXT_PUBLIC_OPENAI_API_KEY not set. ' +
          'For production, use proxy endpoint at /api/h2.5/proxy instead.'
        );
      }

      // Create agent (reuse same instance for all messages)
      agentRef.current = createBrowserAgent({
        apiKey,
        model: 'gpt-5-mini',
        streaming: true,
      });

      setIsInitialized(true);
      console.log('[H2.5Agent] Initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
      console.error('[H2.5Agent] Initialization failed:', errorMessage);
      setInitError(errorMessage);
    }
  }, []);

  /**
   * Initialize smartAccount and bundlerClient for session key funding
   * These are needed for UserOp-based funding when session key has 0 balance
   */
  useEffect(() => {
    if (!wallet || !sessionData?.delegator) {
      // Reset state if wallet or session not available
      setSmartAccount(null);
      setBundlerClient(null);
      return;
    }

    console.log('[H2.5Agent] Creating smartAccount and bundlerClient for session key funding');

    (async () => {
      try {
        // Create hybrid delegator handle (includes smartAccount + bundlerClient)
        const handle = await createHybridDelegatorHandle(
          wallet.walletClient,
          wallet.address
        );

        setSmartAccount(handle.smartAccount);
        setBundlerClient(handle.bundlerClient);

        console.log('[H2.5Agent] SmartAccount and bundlerClient ready');
      } catch (error) {
        console.error('[H2.5Agent] Failed to create smartAccount/bundlerClient:', error);
        // Don't fail the whole app - session key funding will fall back to delegation pattern
        setSmartAccount(null);
        setBundlerClient(null);
      }
    })();
  }, [wallet, sessionData?.delegator]);

  /**
   * Subscribe to global progress emitter
   * Tools emit progress updates via emitProgress() - we listen and add as tree steps
   */
  useEffect(() => {
    const progressHandler = (event: { message: string; toolName?: string }) => {
      if (event.message) {
        let runningToolName = event.toolName;

        // Find currently running tool if not specified
        // Most tools emit progress without toolName
        if (!runningToolName) {
          const activeTools = useH2ChatStore.getState().activeTools;
          activeTools.forEach((tool, name) => {
            if (tool.status === "running") {
              runningToolName = name;
            }
          });
        }

        // Add as tree step if we have a running tool
        if (runningToolName) {
          addToolStep(runningToolName, event.message);
        }
      }
    };

    // Subscribe to progress events
    onProgress(progressHandler);

    // Cleanup on unmount
    return () => {
      offProgress(progressHandler);
    };
  }, [addToolStep]);

  /**
   * Send message to agent
   * Runs agent in browser with direct wallet access
   */
  const sendMessage = useCallback(
    async (content: string) => {
      // Check initialization
      if (!isInitialized || !agentRef.current) {
        addMessage({
          role: 'system',
          content: initError || 'Agent not initialized. Please refresh the page.',
        });
        return;
      }

      // Check wallet connection
      if (!wallet) {
        addMessage({
          role: 'system',
          content: 'Please connect your wallet to use H2.5.',
        });
        return;
      }

      // Check session data
      const userAddress = sessionData?.delegator;
      if (!userAddress || !sessionData) {
        addMessage({
          role: 'system',
          content: 'No session data. Please complete onboarding first.',
        });
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

      console.log('[H2.5Agent] Sending message:', {
        userMessage: content,
        allowedTokensCount: allowedTokens.length,
        quickMode,
      });

      // Set streaming state
      setIsStreaming(true);

      try {
        // Create public client for blockchain reads
        const publicClient = createPublicClient({
          chain: monadDevnet,
          transport: http(process.env.NEXT_PUBLIC_MONAD_RPC_URL),
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
          transport: http(process.env.NEXT_PUBLIC_MONAD_RPC_URL),
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

        // Tool completion tracking for automatic spacing
        // When a tool completes, the next token should start with \n\n
        const justCompletedToolRef = { current: false };

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
            if (currentMessage) {
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

        // Auto-flush interval for smooth streaming (50ms for snappy updates)
        const flushInterval = setInterval(flushTokenBuffer, 50);

        // Streaming callbacks for UI updates
        const callbacks: BrowserAgentCallbacks = {
          onToken: (token) => {
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

          onProgress: (message, toolName) => {
            // Add progress as nested step in tool tree
            if (message) {
              let runningToolName = toolName;

              // Find currently running tool if not specified
              if (!runningToolName) {
                const activeTools = useH2ChatStore.getState().activeTools;
                activeTools.forEach((tool, name) => {
                  if (tool.status === "running") {
                    runningToolName = name;
                  }
                });
              }

              if (runningToolName) {
                addToolStep(runningToolName, message);
              }
            }
          },

          onToolStart: (toolName) => {
            const description = generateToolDescription(toolName);
            startTool(toolName, description);
          },

          onToolEnd: (toolName, output) => {
            completeTool(toolName, output);
            hideProgress();

            // Set flag so next token gets automatic spacing if needed
            justCompletedToolRef.current = true;
          },

          onToolError: (toolName, error) => {
            errorTool(toolName, error);
            hideProgress();
          },

          onComplete: () => {
            // Stop flush interval and flush any remaining tokens
            clearInterval(flushInterval);
            flushTokenBuffer();

            setStreamingMessage(null);
            setIsStreaming(false);
            hideProgress();
          },

          onError: (error) => {
            // Stop flush interval and flush any remaining tokens
            clearInterval(flushInterval);
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
              sessionKeyAddress: sessionData.sessionKeyAddress,
              sessionKeyPrivateKey: sessionData.sessionKeyPrivateKey,
              ownerAddress: sessionData.ownerAddress,
              chainId: sessionData.chainId,
            },
            publicClient,
            web3authBridge,
            sessionWallet,
            quickMode,
            allowedTokens,
            smartAccount: smartAccount || undefined,
            bundlerClient: bundlerClient || undefined,
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
      smartAccount,
      bundlerClient,
      addMessage,
      updateMessageContent,
      setStreamingMessage,
      hideProgress,
      startTool,
      addToolStep,
      completeTool,
      errorTool,
      setIsStreaming,
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
