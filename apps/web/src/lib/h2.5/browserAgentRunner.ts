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

import type { BaseMessage } from "@langchain/core/messages";
import { PRAGMA_H2_SYSTEM_PROMPT } from "@pragma/core";
import type { AllowedToken } from "@pragma/core";
import { onProgress, offProgress, type ProgressEvent } from "@pragma/core/h2/progress/emitter";
import { authenticatedFetch } from "../api/authenticatedFetch";

/**
 * Message tuple format used by LangChain
 * [role, content]
 */
export type MessageTuple = ["user" | "assistant" | "system", string];

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
   * @param signature - Unique identifier for parallel tool matching (e.g., "MON-DAK")
   * @param description - Resolved human-readable description to update parent tool display
   */
  onProgress?: (message: string, toolName?: string, signature?: string, description?: string) => void;

  /**
   * Tool execution started
   * Called when agent begins executing a tool
   * @param signature - Unique identifier generated from tool input (e.g., "MON-DAK" for swaps)
   */
  onToolStart?: (toolName: string, input: unknown, signature?: string) => void;

  /**
   * Tool execution completed
   * Called when tool finishes successfully
   * @param signature - Unique identifier for matching tool start
   */
  onToolEnd?: (toolName: string, output: string, signature?: string) => void;

  /**
   * Tool execution error
   * Called when tool execution fails
   * @param signature - Unique identifier for matching tool start
   */
  onToolError?: (toolName: string, error: string, signature?: string) => void;

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

  /** Authenticated RPC transport (proxies calls through /api/rpc with JWT + signature) */
  transport: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  /** Smart account instance (optional, for account abstraction) */
  smartAccount?: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  /** Bundler client (optional, for ERC-4337) */
  bundlerClient?: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  /** Shared session wallet (optional, for nonce management) */
  sessionWallet?: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  /** Quick mode enabled (skip confirmations) */
  quickMode?: boolean;

  /** Allowed tokens for swaps */
  allowedTokens?: AllowedToken[];
  // Note: sponsorUserOperationFn removed - session key funding is now self-paid (no paymaster)
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
    // Format messages for LangChain (convert tuples to message objects)
    const formattedMessages = messages.map(([role, content]) => ({
      role,
      content,
    }));

    // Track current assistant message for streaming
    let currentResponse = "";

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
          transport: context.transport,
          smartAccount: context.smartAccount,
          bundlerClient: context.bundlerClient,
          sessionWallet: context.sessionWallet,
          quickMode: context.quickMode,
          allowedTokens: context.allowedTokens,
          fetch: authenticatedFetch, // Authenticated fetch for proxy API calls
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            handleToolStart(tool: any, input: string) {
              callbacks.onToolStart?.(tool.name, input);
            },

            // Handle tool execution end
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            handleToolEnd(output: any) {
              callbacks.onToolEnd?.(output.tool, output.output);
            },

            // Handle tool errors
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            handleToolError(error: Error, runnable: any) {
              console.error("[BrowserAgent] Tool error:", error);
              callbacks.onToolError?.(runnable.name, error.message);
            },

            // Handle agent errors
            handleChainError(error: Error) {
              console.error("[BrowserAgent] Chain error:", error);
              callbacks.onError?.(error);
            },
          },
        ],
      }
    );

    callbacks.onComplete?.();

    // Extract final response from result
    const finalMessages = result.messages as BaseMessage[];
    const lastMessage = finalMessages[finalMessages.length - 1];

    if (!lastMessage) {
      throw new Error("No response from agent");
    }

    // Return content from last AI message
    return typeof lastMessage.content === "string"
      ? lastMessage.content
      : currentResponse;
  } catch (error) {
    console.error("[BrowserAgent] Execution failed:", error);
    callbacks.onError?.(
      error instanceof Error ? error : new Error(String(error))
    );
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
  // Progress handler - declared here for catch block access
  let progressHandler: ((event: ProgressEvent) => void) | undefined;

  try {
    let currentResponse = "";

    // Track signatures by run_id for matching tool_end/error to tool_start
    const signatureMap = new Map<string, string>();

    /**
     * Generate signature from tool input based on tool type
     * This creates a unique identifier for parallel tool execution
     */
    const generateSignatureFromInput = (toolName: string, input: unknown): string | undefined => {
      if (!input) return undefined;

      // Handle string input (LangChain may pass JSON string)
      let inputObj: Record<string, unknown>;
      if (typeof input === 'string') {
        try {
          inputObj = JSON.parse(input);
        } catch {
          return undefined;
        }
      } else if (typeof input === 'object') {
        inputObj = input as Record<string, unknown>;
      } else {
        return undefined;
      }

      // Handle nested input structure from LangChain
      // Input may be wrapped as { input: '{"fromToken":"MON",...}' }
      if (inputObj.input && typeof inputObj.input === 'string') {
        try {
          inputObj = JSON.parse(inputObj.input);
        } catch {
          // Keep original if parsing fails
        }
      }

      // All signatures are prefixed with toolName to prevent collisions
      // between different tool types (e.g., getSwapQuote vs executeSwap)
      switch (toolName) {
        case 'getSwapQuote':
          // For quotes: use toolName:fromToken-toToken
          if (inputObj.fromToken && inputObj.toToken) {
            const from = String(inputObj.fromToken).toUpperCase();
            const to = String(inputObj.toToken).toUpperCase();
            return `${toolName}:${from}-${to}`;
          }
          break;

        case 'executeSwap':
          // For execution: use quoteId-only format for guaranteed matching
          // QuoteId is cryptographically unique, preventing signature collisions
          if (inputObj.quoteId) {
            return `${toolName}:${inputObj.quoteId}`;
          }
          break;

        case 'getBalance':
          // For balance checks: use toolName:token
          if (inputObj.token) {
            return `${toolName}:${String(inputObj.token).toUpperCase()}`;
          }
          break;

        case 'transfer':
          // For transfers: use toolName:token-recipient
          if (inputObj.token && inputObj.to) {
            const token = String(inputObj.token).toUpperCase();
            const to = String(inputObj.to).slice(0, 8);
            return `${toolName}:${token}-${to}`;
          }
          break;

        case 'stake':
        case 'unstakeRequest':
        case 'unstakeClaim':
          // For staking: use toolName:amount
          if (inputObj.amount) {
            return `${toolName}:${inputObj.amount}`;
          }
          break;

        case 'wrap':
        case 'unwrap':
          // For wrap/unwrap: use toolName:amount
          if (inputObj.amount) {
            return `${toolName}:${inputObj.amount}`;
          }
          break;

        // Tools that use toolName as signature (no parallel batching needed)
        case 'checkSessionKeyBalance':
        case 'fundSessionKey':
        case 'getSessionKeyBalance':
        case 'getAllBalances':
        case 'getAccountInfo':
        case 'listVerifiedTokens':
        case 'withdrawSessionKeyBalance':
          return toolName;
      }

      // Fallback: use toolName for any unmapped tools
      return toolName;
    };

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
1. Count total operations planned (swaps, transfers, stakes, etc.)
2. Call checkSessionKeyBalance with estimatedOperations parameter (e.g., {estimatedOperations: 3})
3. If needsFunding = true, call fundSessionKey and WAIT for it to complete
4. After fundSessionKey completes, call checkSessionKeyBalance AGAIN to verify funding succeeded
5. If balance still insufficient after funding, retry fundSessionKey ONCE
6. ONLY THEN execute all operations in parallel

CRITICAL: Session key funding MUST complete and be verified before swaps start.
Do NOT parallelize funding with swaps - this causes race conditions and stuck transactions.
If funding fails after retry, report the error to user with the transaction hash for debugging.

CRITICAL: Each operation costs ~0.095 MON. Examples:
- 2 swaps → 0.39 MON needed (not 0.1!)
- 3 swaps → 0.485 MON needed
- 4 swaps → 0.58 MON needed

**SESSION KEY BALANCE CHECKING:**

For SWAPS:
1. Call getSwapQuote (no balance check needed - read-only operation)
2. Show quote to user
3. IMMEDIATELY BEFORE executeSwap → call checkSessionKeyBalance with estimatedOperations
   - Single swap → {estimatedOperations: 1}
   - Batch swaps → {estimatedOperations: N}
4. If needsFunding = true → AUTOMATICALLY call fundSessionKey (no user permission needed)
5. After funding completes → call checkSessionKeyBalance AGAIN to verify
6. ONLY THEN call executeSwap

For DIRECT operations (transfer/wrap/unwrap/stake/unstake):
1. IMMEDIATELY BEFORE execution tool → call checkSessionKeyBalance
   - Single operation → {estimatedOperations: 1}
   - Batch operations → {estimatedOperations: N}
2. If needsFunding = true → AUTOMATICALLY call fundSessionKey (no user permission needed)
3. After funding completes → call checkSessionKeyBalance AGAIN to verify
4. ONLY THEN call the execution tool

Session key funding is a maintenance operation that does not require user confirmation.

**BALANCE FETCHING:**
- User says "show balances" or "what do I have" → use getAllBalances (fast, gets all tokens)
- User says "what's my USDC" → use getBalance(USDC) (precise, single token)

For swaps: call getSwapQuote then executeSwap with the quote ID.
For wrap/unwrap/transfer: call tool directly.

Group capabilities with **bold section headers**. Use emojis sparingly. Natural, conversational tone.`
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
1. Count total operations planned (swaps, transfers, stakes, etc.)
2. Call checkSessionKeyBalance with estimatedOperations parameter (e.g., {estimatedOperations: 3})
3. If needsFunding = true, call fundSessionKey and WAIT for it to complete
4. After fundSessionKey completes, call checkSessionKeyBalance AGAIN to verify funding succeeded
5. If balance still insufficient after funding, retry fundSessionKey ONCE
6. ONLY THEN execute all operations in parallel

CRITICAL: Session key funding MUST complete and be verified before swaps start.
Do NOT parallelize funding with swaps - this causes race conditions and stuck transactions.
If funding fails after retry, report the error to user with the transaction hash for debugging.

CRITICAL: Each operation costs ~0.095 MON. Examples:
- 2 swaps → 0.39 MON needed (not 0.1!)
- 3 swaps → 0.485 MON needed
- 4 swaps → 0.58 MON needed

**SESSION KEY BALANCE CHECKING:**

For SWAPS:
1. Call getSwapQuote (no balance check needed - read-only operation)
2. Show quote to user and wait for approval ('yes', 'execute', 'proceed')
3. AFTER user confirms → IMMEDIATELY BEFORE executeSwap → call checkSessionKeyBalance
   - Single swap → {estimatedOperations: 1}
   - Batch swaps → {estimatedOperations: N}
4. If needsFunding = true → AUTOMATICALLY call fundSessionKey (no user permission needed)
5. After funding completes → call checkSessionKeyBalance AGAIN to verify
6. ONLY THEN call executeSwap

For DIRECT operations (transfer/wrap/unwrap/stake/unstake):
1. Show intent to user and wait for approval
2. AFTER user confirms → IMMEDIATELY BEFORE execution tool → call checkSessionKeyBalance
   - Single operation → {estimatedOperations: 1}
   - Batch operations → {estimatedOperations: N}
3. If needsFunding = true → AUTOMATICALLY call fundSessionKey (no user permission needed)
4. After funding completes → call checkSessionKeyBalance AGAIN to verify
5. ONLY THEN call the execution tool

Session key funding is a maintenance operation that does not require user confirmation.

**BALANCE FETCHING:**
- User says "show balances" or "what do I have" → use getAllBalances (fast, gets all tokens)
- User says "what's my USDC" → use getBalance(USDC) (precise, single token)

For swaps: call getSwapQuote, show quote, wait for approval ('yes', 'execute', 'proceed'), then executeSwap.
For wrap/unwrap/transfer: ask first, then execute.

Group capabilities with **bold section headers**. Use emojis sparingly. Natural, conversational tone.`;

    // Build system prompt with placeholders replaced (same as H2 CLI)
    // Formatting instructions now in base system prompt (CRITICAL FORMATTING RULES section)
    const systemPrompt = PRAGMA_H2_SYSTEM_PROMPT.replace(
      /\[userAddress from context\]/g,
      context.userAddress
    )
      .replace(/\[userAddress\]/g, context.userAddress)
      .replace(/\[EXECUTION_MODE\]/g, modeInstructions);

    // Prepend system prompt to messages (filter out any existing system messages)
    const messagesWithSystem: MessageTuple[] = [
      ["system", systemPrompt],
      ...messages.filter(([role]) => role !== "system"),
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
        version: "v2", // Use streamEvents v2 API
        recursionLimit: 60, // Support large batch operations (same as CLI)
        configurable: {
          userAddress: context.userAddress,
          sessionData: context.sessionData,
          publicClient: context.publicClient,
          web3authBridge: context.web3authBridge,
          transport: context.transport,
          smartAccount: context.smartAccount,
          bundlerClient: context.bundlerClient,
          sessionWallet: context.sessionWallet,
          quickMode: context.quickMode,
          allowedTokens: context.allowedTokens,
          fetch: authenticatedFetch, // Authenticated fetch for proxy API calls
          // Note: sponsorUserOperationFn removed - session key funding is now self-paid
        },
      }
    );

    // Subscribe to global progress events from tools
    // Tools call emitProgress() which we bridge to callbacks.onProgress
    progressHandler = (event: ProgressEvent) => {
      callbacks.onProgress?.(event.message, event.toolName, event.signature, event.description);
    };
    onProgress(progressHandler);

    // Process events
    for await (const event of stream) {
      if (event.event === "on_chat_model_stream") {
        // LLM token streaming
        const rawContent = event.data?.chunk?.content;

        // Extract text delta (handle both string and array formats)
        // OpenAI Responses API returns content as: [{ type: "text", text: "..." }]
        let delta = "";
        if (typeof rawContent === "string") {
          delta = rawContent;
        } else if (Array.isArray(rawContent)) {
          // Responses API format - concatenate all text parts
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
      } else if (event.event === "on_tool_start") {
        // Tool execution started
        const input = event.data?.input;

        // Generate signature (always returns a value - toolName fallback)
        const signature = generateSignatureFromInput(event.name, input) || event.name;

        // Store signature by run_id for matching tool_end/error
        if (event.run_id) {
          signatureMap.set(event.run_id, signature);
        }

        callbacks.onToolStart?.(event.name, input, signature);
      } else if (event.event === "on_tool_end") {
        // Tool execution completed
        // Retrieve signature from map using run_id
        const signature = event.run_id ? signatureMap.get(event.run_id) : undefined;

        callbacks.onToolEnd?.(event.name, event.data?.output, signature);

        // Cleanup
        if (event.run_id) {
          signatureMap.delete(event.run_id);
        }
      } else if (event.event === "on_tool_error") {
        // Tool execution failed
        // Retrieve signature from map using run_id
        const signature = event.run_id ? signatureMap.get(event.run_id) : undefined;

        callbacks.onToolError?.(
          event.name,
          event.data?.error?.message || "Unknown error",
          signature
        );

        // Cleanup
        if (event.run_id) {
          signatureMap.delete(event.run_id);
        }
      }
    }

    // Cleanup progress subscription
    offProgress(progressHandler);

    callbacks.onComplete?.();

    return currentResponse;
  } catch (error) {
    // Cleanup progress subscription on error
    if (progressHandler) {
      offProgress(progressHandler);
    }
    console.error("[BrowserAgent] Streaming failed:", error);
    callbacks.onError?.(
      error instanceof Error ? error : new Error(String(error))
    );
    throw error;
  }
}
