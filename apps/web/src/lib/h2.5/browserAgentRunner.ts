/**
 * Browser Agent Runner
 *
 * Handles LangChain agent invocation in the browser with streaming callbacks.
 * Replaces SSE streaming from H2 with direct callback-based updates.
 *
 * Architecture Comparison:
 *
 * H2 (Server-Side):
 *   streamEvents() → SSE events → Client listens → Updates UI
 *
 * H2.5 (Client-Side):
 *   invoke() with callbacks → Direct state updates → UI updates immediately
 *
 * Benefits:
 * - No SSE connection overhead
 * - No network latency for streaming
 * - Simpler error handling (no connection drops)
 * - Direct access to agent state
 */

import type { BaseMessage } from '@langchain/core/messages';
import { PRAGMA_H2_SYSTEM_PROMPT } from '@pragma/core';

/**
 * Message tuple format used by LangChain
 * [role, content]
 */
export type MessageTuple = ['user' | 'assistant' | 'system', string];

/**
 * Browser agent execution callbacks
 *
 * These callbacks provide real-time updates during agent execution.
 * Similar to SSE events in H2, but synchronous and in-process.
 */
export interface BrowserAgentCallbacks {
  /**
   * Token streaming callback (for AI messages)
   * Called as LLM streams tokens
   */
  onToken?: (token: string) => void;

  /**
   * Progress update callback
   * Called when agent provides status updates
   */
  onProgress?: (message: string, toolName?: string) => void;

  /**
   * Tool execution started
   * Called when agent begins executing a tool
   */
  onToolStart?: (toolName: string, input: unknown) => void;

  /**
   * Tool execution completed
   * Called when tool finishes successfully
   */
  onToolEnd?: (toolName: string, output: string) => void;

  /**
   * Tool execution error
   * Called when tool execution fails
   */
  onToolError?: (toolName: string, error: string) => void;

  /**
   * Agent execution completed
   * Called when full agent loop finishes
   */
  onComplete?: () => void;

  /**
   * Agent execution error
   * Called when agent loop fails
   */
  onError?: (error: Error) => void;
}

/**
 * Browser agent execution context
 *
 * Provides all context needed for tool execution in the browser.
 * Matches server-side context structure from H2.
 */
export interface BrowserAgentContext {
  /** User's smart account address */
  userAddress: string;

  /** Session data (session key, owner, chain) */
  sessionData: {
    sessionKeyAddress: string;
    sessionKeyPrivateKey: string;
    ownerAddress: string;
    chainId: number;
  };

  /** Viem public client for blockchain reads */
  publicClient: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  /** Direct Web3Auth bridge (no network transport) */
  web3authBridge: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  /** Smart account instance (optional, for account abstraction) */
  smartAccount?: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  /** Bundler client (optional, for ERC-4337) */
  bundlerClient?: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  /** Shared session wallet (optional, for nonce management) */
  sessionWallet?: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  /** Quick mode enabled (skip confirmations) */
  quickMode?: boolean;

  /** Allowed tokens for swaps */
  allowedTokens?: string[];
}

/**
 * Run agent in browser with streaming callbacks
 *
 * This is the main entry point for executing the LangChain agent in the browser.
 * It handles message formatting, context injection, and callback coordination.
 *
 * @param agent - LangChain agent created by createBrowserAgent()
 * @param messages - Conversation history in tuple format
 * @param context - Execution context (wallet, session, clients)
 * @param callbacks - Streaming callbacks for UI updates
 * @returns Promise<string> - Final AI response
 *
 * @example
 * ```typescript
 * const response = await runBrowserAgent(
 *   agent,
 *   [
 *     ['user', 'swap 1 MON to USDC'],
 *   ],
 *   {
 *     userAddress: wallet.address,
 *     sessionData: session,
 *     publicClient,
 *     web3authBridge: directBridge,
 *     quickMode: false,
 *   },
 *   {
 *     onToken: (token) => appendToMessage(token),
 *     onToolStart: (name) => showProgress(name),
 *     onToolEnd: (name, output) => hideProgress(),
 *     onError: (error) => showError(error),
 *   }
 * );
 * ```
 */
export async function runBrowserAgent(
  agent: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  messages: MessageTuple[],
  context: BrowserAgentContext,
  callbacks: BrowserAgentCallbacks = {}
): Promise<string> {
  try {
    console.log('[BrowserAgent] Starting execution...', {
      messageCount: messages.length,
      userAddress: context.userAddress,
      quickMode: context.quickMode,
    });

    // Format messages for LangChain (convert tuples to message objects)
    const formattedMessages = messages.map(([role, content]) => ({
      role,
      content,
    }));

    // Track current assistant message for streaming
    let currentResponse = '';

    // Invoke agent with context and streaming
    const result = await agent.invoke(
      {
        messages: formattedMessages,
      },
      {
        // Inject execution context for tools
        configurable: {
          userAddress: context.userAddress,
          sessionData: context.sessionData,
          publicClient: context.publicClient,
          web3authBridge: context.web3authBridge,
          smartAccount: context.smartAccount,
          bundlerClient: context.bundlerClient,
          sessionWallet: context.sessionWallet,
          quickMode: context.quickMode,
          allowedTokens: context.allowedTokens,
        },

        // Streaming callbacks
        callbacks: [
          {
            // Handle token streaming from LLM
            handleLLMNewToken(token: string) {
              currentResponse += token;
              callbacks.onToken?.(token);
            },

            // Handle tool execution start
            handleToolStart(tool: any, input: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
              console.log('[BrowserAgent] Tool start:', tool.name);
              callbacks.onToolStart?.(tool.name, input);
            },

            // Handle tool execution end
            handleToolEnd(output: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
              console.log('[BrowserAgent] Tool end');
              callbacks.onToolEnd?.(output.tool, output.output);
            },

            // Handle tool errors
            handleToolError(error: Error, runnable: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
              console.error('[BrowserAgent] Tool error:', error);
              callbacks.onToolError?.(runnable.name, error.message);
            },

            // Handle agent errors
            handleChainError(error: Error) {
              console.error('[BrowserAgent] Chain error:', error);
              callbacks.onError?.(error);
            },
          },
        ],
      }
    );

    console.log('[BrowserAgent] Execution complete');
    callbacks.onComplete?.();

    // Extract final response from result
    const finalMessages = result.messages as BaseMessage[];
    const lastMessage = finalMessages[finalMessages.length - 1];

    if (!lastMessage) {
      throw new Error('No response from agent');
    }

    // Return content from last AI message
    return typeof lastMessage.content === 'string'
      ? lastMessage.content
      : currentResponse;

  } catch (error) {
    console.error('[BrowserAgent] Execution failed:', error);
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/**
 * Stream agent execution with event-based updates
 *
 * Alternative to runBrowserAgent that uses streamEvents() for more granular control.
 * Provides event-by-event streaming similar to H2's SSE approach.
 *
 * @param agent - LangChain agent instance
 * @param messages - Conversation history
 * @param context - Execution context
 * @param callbacks - Event callbacks
 * @returns Promise<string> - Final AI response
 *
 * Note: This uses LangChain's streamEvents() which is similar to server-side
 * streaming but runs locally in the browser without network transport.
 */
export async function streamBrowserAgent(
  agent: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  messages: MessageTuple[],
  context: BrowserAgentContext,
  callbacks: BrowserAgentCallbacks = {}
): Promise<string> {
  try {
    console.log('[BrowserAgent] Starting streaming execution...');

    let currentResponse = '';

    // Build execution mode instructions (same as H2 CLI)
    const modeInstructions = context.quickMode
      ? `YOU ARE IN QUICK MODE - Execute all operations WITHOUT asking for user confirmation.

**EXECUTION STRATEGY:**
- SEQUENTIAL (Multi-Step): When operations have dependencies (e.g., "swap MON to USDC then swap to DAI")
  → Keywords: "then", "after", "once", "and then"
  → Execute: Operation 1 → wait for completion → Operation 2

- PARALLEL (Batch): When operations are independent (e.g., "swap to USDC, USDT, and USDM")
  → Keywords: "and", comma-separated, no "then"
  → Execute: All operations at the same time (faster)

Always prefer PARALLEL execution for independent operations.

**SESSION KEY FUNDING:**
Before executing batch operations (2+ swaps/transfers), ALWAYS check session key balance:
1. Call checkSessionKeyBalance
2. If needsFunding = true, call fundSessionKey ONCE
3. Then execute all operations in parallel

For single operations: Just execute - if balance low, tool will error.
AUTOMATICALLY call fundSessionKey (no user permission needed) then retry the operation.
Session key funding is a maintenance operation that does not require user confirmation.

**BALANCE FETCHING:**
- User says "show balances" or "what do I have" → use getAllBalances (fast, gets all tokens)
- User says "what's my USDC" → use getBalance(USDC) (precise, single token)

For swaps: call getSwapQuote then executeSwap with the quote ID.
For wrap/unwrap/transfer: call tool directly.`
      : `YOU ARE IN NORMAL MODE - Ask for user confirmation BEFORE executing.

**EXECUTION STRATEGY:**
- SEQUENTIAL (Multi-Step): When operations have dependencies (e.g., "swap MON to USDC then swap to DAI")
  → Keywords: "then", "after", "once", "and then"
  → Execute: Operation 1 → wait for completion → Operation 2

- PARALLEL (Batch): When operations are independent (e.g., "swap to USDC, USDT, and USDM")
  → Keywords: "and", comma-separated, no "then"
  → Plan all operations → show all quotes → execute in parallel after confirmation

Always prefer PARALLEL execution for independent operations.

**SESSION KEY FUNDING:**
Before executing batch operations (2+ swaps/transfers), ALWAYS check session key balance:
1. Call checkSessionKeyBalance
2. If needsFunding = true, call fundSessionKey ONCE
3. Then execute all operations in parallel

For single operations: Just execute - if balance low, tool will error.
AUTOMATICALLY call fundSessionKey (no user permission needed) then retry the operation.
Session key funding is a maintenance operation that does not require user confirmation.

**BALANCE FETCHING:**
- User says "show balances" or "what do I have" → use getAllBalances (fast, gets all tokens)
- User says "what's my USDC" → use getBalance(USDC) (precise, single token)

For swaps: call getSwapQuote, show quote, wait for approval ('yes', 'execute', 'proceed'), then executeSwap.
For wrap/unwrap/transfer: ask first, then execute.`;

    // Build system prompt with placeholders replaced (same as H2 CLI)
    const systemPrompt = PRAGMA_H2_SYSTEM_PROMPT
      .replace(/\[userAddress from context\]/g, context.userAddress)
      .replace(/\[userAddress\]/g, context.userAddress)
      .replace(/\[EXECUTION_MODE\]/g, modeInstructions);

    // Prepend system prompt to messages (filter out any existing system messages)
    const messagesWithSystem: MessageTuple[] = [
      ['system', systemPrompt],
      ...messages.filter(([role]) => role !== 'system'),
    ];

    // Format messages for LangChain
    const formattedMessages = messagesWithSystem.map(([role, content]) => ({
      role,
      content,
    }));

    // Stream events from agent
    const stream = agent.streamEvents(
      {
        messages: formattedMessages,
      },
      {
        version: 'v2', // Use streamEvents v2 API
        recursionLimit: 60, // Support large batch operations (same as CLI)
        configurable: {
          userAddress: context.userAddress,
          sessionData: context.sessionData,
          publicClient: context.publicClient,
          web3authBridge: context.web3authBridge,
          smartAccount: context.smartAccount,
          bundlerClient: context.bundlerClient,
          sessionWallet: context.sessionWallet,
          quickMode: context.quickMode,
          allowedTokens: context.allowedTokens,
        },
      }
    );

    // Process events
    for await (const event of stream) {
      if (event.event === 'on_chat_model_stream') {
        // LLM token streaming
        const rawContent = event.data?.chunk?.content;

        // Extract text delta (handle both string and array formats)
        // OpenAI Responses API returns content as: [{ type: "text", text: "..." }]
        let delta = "";
        if (typeof rawContent === "string") {
          delta = rawContent;
        } else if (Array.isArray(rawContent)) {
          // Responses API format
          for (const part of rawContent) {
            if (part.type === "text" && part.text) {
              delta += part.text;
            } else if (typeof part === "string") {
              delta += part;
            }
          }
        }

        if (delta) {
          currentResponse += delta;
          callbacks.onToken?.(delta);
        }
      } else if (event.event === 'on_tool_start') {
        // Tool execution started
        callbacks.onToolStart?.(event.name, event.data?.input);
      } else if (event.event === 'on_tool_end') {
        // Tool execution completed
        callbacks.onToolEnd?.(event.name, event.data?.output);
      } else if (event.event === 'on_tool_error') {
        // Tool execution failed
        callbacks.onToolError?.(event.name, event.data?.error?.message || 'Unknown error');
      }
    }

    console.log('[BrowserAgent] Streaming complete');
    callbacks.onComplete?.();

    return currentResponse;

  } catch (error) {
    console.error('[BrowserAgent] Streaming failed:', error);
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}
