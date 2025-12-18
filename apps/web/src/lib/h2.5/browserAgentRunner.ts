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
import { PRAGMA_H2_SYSTEM_PROMPT, PRAGMA_H2_SYSTEM_PROMPT_DEEPSEEK, PRAGMA_H2_SYSTEM_PROMPT_GROK, PRAGMA_H2_SYSTEM_PROMPT_GEMINI, createLogger } from "@pragma/core";
import type { AllowedToken } from "@pragma/core";
import { onProgress, offProgress, type ProgressEvent } from "@pragma/core/h2/progress/emitter";
import { authenticatedFetch } from "../api/authenticatedFetch";
import { createMetricsCollector } from "./metrics";
import { createBrowserAgent } from "./createBrowserAgent";
import { tokenTracker } from "./tokenTracker";

const logger = createLogger("[BrowserAgent]");

/**
 * Determine if a message requires high reasoning effort
 *
 * Uses regex heuristics to detect complex queries that benefit from
 * extended thinking time. gpt-5-mini defaults to "medium" reasoning,
 * so we only upgrade to "high" for genuinely complex scenarios.
 *
 * Complex queries include:
 * - Multi-step workflows ("swap X then stake", "after that transfer")
 * - Batch operations ("swap X, stake Y, wrap Z", "swap and stake")
 * - Comparative analysis ("best", "cheapest", "optimal")
 * - Conditional logic ("if...then", "depending on")
 * - Architecture/knowledge questions ("how does X work", "what is delegation")
 * - Complex calculations or planning
 * - Debugging or troubleshooting requests
 *
 * @param message - User message to analyze
 * @returns true if high reasoning should be used
 */
function shouldUseHighReasoning(message: string): boolean {
  // Multi-step workflow patterns
  const multiStepPatterns = [
    /\bthen\b.*\b(swap|stake|transfer|send|wrap|unwrap)\b/i,
    /\b(swap|stake|transfer|send|wrap|unwrap)\b.*\bthen\b/i,
    /\bafter\s+that\b/i,
    /\bonce\s+(done|complete|finished)\b/i,
    /\bfirst\b.*\bthen\b/i,
    /\band\s+then\b/i,
    /\bstep\s+\d+/i,
    /\bsequentially\b/i,
  ];

  // Comparative/optimization patterns
  const comparativePatterns = [
    /\b(best|cheapest|optimal|maximum|minimum|highest|lowest)\b/i,
    /\bcompare\b/i,
    /\bwhich\s+(one|option|route)\b/i,
    /\bmost\s+(efficient|profitable|cost-effective)\b/i,
  ];

  // Conditional logic patterns
  const conditionalPatterns = [
    /\bif\b.*\bthen\b/i,
    /\bdepending\s+on\b/i,
    /\bwhen\b.*\b(happens|occurs|is)\b/i,
    /\bunless\b/i,
    /\bin\s+case\b/i,
  ];

  // Complex analysis patterns
  const analysisPatterns = [
    /\bexplain\s+(how|why|what)\b/i,
    /\bwhat\s+would\s+happen\b/i,
    /\banalyze\b/i,
    /\bdebug\b/i,
    /\btroubleshoot\b/i,
    /\bwhat('s|\s+is)\s+(wrong|the\s+issue|the\s+problem)\b/i,
    /\bhelp\s+me\s+understand\b/i,
    /\bplan\s+(out|for)\b/i,
  ];

  // Batch/parallel operation patterns (multiple operations in one message)
  const batchPatterns = [
    // Comma-separated operations (swap X, stake Y, wrap Z)
    /\b(swap|stake|transfer|send|wrap|unwrap)\b.*,.*\b(swap|stake|transfer|send|wrap|unwrap)\b/i,
    // "X and Y" pattern with action verbs (but not "and then" which is sequential)
    /\b(swap|stake|transfer|wrap|unwrap)\b.+\band\s+(?!then\b)(swap|stake|transfer|wrap|unwrap)\b/i,
    // Multiple token targets (swap to X, Y, and Z)
    /\bswap\b.*\b(to|into)\b.*,/i,
  ];

  // Architecture/knowledge questions (require deeper understanding)
  const knowledgePatterns = [
    // "how does X work" pattern
    /\bhow\s+does\b.*\b(work|function|operate)\b/i,
    // "explain X" without "how/why/what" immediately after
    /\bexplain\s+(?!how\b|why\b|what\b)(the\s+)?\w+/i,
    // "what is X" for technical/protocol concepts
    /\bwhat\s+(is|are)\b.*\b(monad|pragma|apriori|monorail|delegation|consensus|bft|parallel|execution|staking|liquid|epoch|validator)\b/i,
    // Direct technical term questions
    /\b(monadbft|parallel\s+execution|delegation\s+(system|toolkit)|liquid\s+staking)\b/i,
  ];

  // Check all pattern groups
  const allPatterns = [
    ...multiStepPatterns,
    ...comparativePatterns,
    ...conditionalPatterns,
    ...analysisPatterns,
    ...batchPatterns,
    ...knowledgePatterns,
  ];

  for (const pattern of allPatterns) {
    if (pattern.test(message)) {
      return true;
    }
  }

  // Also check for very long messages (likely complex requests)
  // 300+ chars often indicates detailed multi-part requests
  if (message.length > 300) {
    return true;
  }

  return false;
}

/**
 * Message tuple format used by LangChain
 * [role, content]
 */
export type MessageTuple = ["user" | "assistant" | "system", string];

// ============================================================================
// Turn-Based Sliding Window (Anti-Hallucination)
// ============================================================================


/**
 * Apply turn-based sliding window to conversation history
 *
 * A "turn" = 1 user message + agent's complete response (including all tool calls)
 *
 * Strategy:
 * - Keep FULL last turn (all tool calls, results, reasoning preserved)
 * - Keep current user message (start of new turn)
 * - Drop everything before last turn
 *
 * This prevents:
 * - Hallucinations from stale data in old turns
 * - Breaking tool call flow (full turn context preserved)
 *
 * Example:
 *   Turn 1: [user1, assistant(tool), tool, assistant(final)]  → DROP
 *   Turn 2: [user2, assistant(tool), tool, assistant(final)]  → DROP
 *   Turn 3: [user3, assistant(tool), tool, assistant(final)]  → KEEP
 *   Turn 4: [user4]                                           → KEEP (current)
 */
function applySlidingWindow(messages: MessageTuple[]): MessageTuple[] {
  // Filter out system messages for counting (they're re-added separately)
  const nonSystemMessages = messages.filter(([role]) => role !== "system");

  // Find all user message indices (each user message starts a new turn)
  const userIndices: number[] = [];
  nonSystemMessages.forEach(([role], idx) => {
    if (role === "user") {
      userIndices.push(idx);
    }
  });

  // Less than 2 turns? Keep everything (no trimming needed)
  if (userIndices.length < 2) {
    return messages;
  }

  // Keep from second-to-last user message onward (= last complete turn + current turn)
  const keepFromIndex = userIndices[userIndices.length - 2];
  const recentMessages = nonSystemMessages.slice(keepFromIndex);

  // Log kept messages for debugging
  logger.debug(`Sliding window keeping ${recentMessages.length} messages from turn ${userIndices.length - 1}`);
  recentMessages.forEach(([role, content], idx) => {
    const preview = content.length > 100 ? content.slice(0, 100) + '...' : content;
    logger.debug(`  [${idx}] ${role}: ${preview.replace(/\n/g, ' ')}`);
  });

  // Preserve system messages from original
  const systemMessages = messages.filter(([role]) => role === "system");

  return [...systemMessages, ...recentMessages];
}

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
   * Reasoning token streaming callback (DeepSeek chain-of-thought)
   * Called as DeepSeek reasoner streams thinking tokens
   * Only fires for DeepSeek V3.2+ models with reasoning capability
   */
  onReasoningToken?: (token: string) => void;

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

  /** User's balance data for unverified token symbol resolution */
  userBalances?: unknown[];
  // Note: sponsorUserOperationFn removed - session key funding is now self-paid (no paymaster)

  /** Authenticated fetch function for API proxy calls */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetch?: (url: string, options?: any) => Promise<Response>;

  /** Origin URL for API calls (e.g., http://localhost:3000) */
  origin?: string;
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
          userBalances: context.userBalances, // For unverified token symbol resolution
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
              logger.error("Tool error:", error);
              callbacks.onToolError?.(runnable.name, error.message);
            },

            // Handle agent errors
            handleChainError(error: Error) {
              logger.error("Chain error:", error);
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
    logger.error("Execution failed:", error);
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

  // Performance metrics collector
  const metrics = createMetricsCollector();

  try {
    let currentResponse = "";

    // Token tracking for hallucination detection
    let reasoningTokenCount = 0;
    let outputTokenCount = 0;
    let toolCallCount = 0;

    // =========================================================================
    // Dynamic Reasoning Effort (Regex-Based)
    // =========================================================================

    // Extract last user message to determine reasoning effort
    const lastUserMessage = [...messages].reverse().find(([role]) => role === "user");
    const userContent = lastUserMessage?.[1] || "";

    // Determine reasoning effort for OpenAI (DeepSeek has built-in reasoning)
    // OpenAI gpt-5-mini uses reasoningEffort: "high" for complex queries, "medium" otherwise
    const isComplexQuery = shouldUseHighReasoning(userContent);
    const reasoningEffort = isComplexQuery ? "high" : "medium";
    logger.debug(`Complex query: ${isComplexQuery}, reasoning effort: ${reasoningEffort} for message: "${userContent.slice(0, 50)}..."`);

    // Create agent (reasoningEffort only used by OpenAI, DeepSeek ignores it)
    const activeAgent = createBrowserAgent({ reasoningEffort });

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

        // NFT tools - use contract:tokenIds for matching
        case 'getNFTDetails':
          // For NFT details: use contract:tokenIds hash
          if (inputObj.contract && inputObj.tokenIds) {
            const ids = Array.isArray(inputObj.tokenIds) ? inputObj.tokenIds.join(',') : inputObj.tokenIds;
            return `${toolName}:${String(inputObj.contract).slice(0, 10)}:${ids}`;
          }
          return toolName;

        case 'getNFTActivity':
          // For NFT activity: use mode:identifier
          if (inputObj.mode) {
            const id = inputObj.contract ? String(inputObj.contract).slice(0, 10) : inputObj.collection ? String(inputObj.collection) : inputObj.account ? String(inputObj.account).slice(0, 10) : 'user';
            return `${toolName}:${inputObj.mode}:${id}`;
          }
          return toolName;

        case 'getTopCollections':
          // For top collections: use search term or 'top'
          if (inputObj.search) {
            return `${toolName}:search:${String(inputObj.search).slice(0, 20)}`;
          }
          return `${toolName}:top`;

        case 'getMyNFTs':
        case 'browseCollection':
        case 'getCollectionInfo':
          return toolName;

        case 'getNFTBuyQuote':
          // For NFT quotes: use collection + tokenId for uniqueness
          if (inputObj.collection && inputObj.tokenId) {
            return `${toolName}:${String(inputObj.collection).slice(0, 10)}-${inputObj.tokenId}`;
          }
          return toolName;

        case 'executeNFTBuy':
          // For NFT execution: use quoteId (matches tool's emitted signature)
          if (inputObj.quoteId) {
            return `${toolName}:${String(inputObj.quoteId)}`;
          }
          return toolName;

        case 'transferNFT':
          // For NFT transfer: use contract:tokenId (matches tool's emitted signature)
          if (inputObj.contract && inputObj.tokenId) {
            return `${toolName}:${String(inputObj.contract)}:${inputObj.tokenId}`;
          }
          return toolName;

        case 'listNFT':
          // listNFT doesn't use unique signatures in the tool, so just use toolName
          return toolName;

        // Search tools - use query for parallel batching
        case 'web_search':
          if (inputObj.query) {
            return `${toolName}:${String(inputObj.query)}`;
          }
          return toolName;

        case 'search_protocol_docs':
          if (inputObj.query) {
            return `${toolName}:${String(inputObj.query)}`;
          }
          return toolName;

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

**CRITICAL - QUICK MODE BEHAVIOR:**
- SWAPS: Call getSwapQuote → IMMEDIATELY call executeSwap in the SAME response (no confirmation)
- STAKE/UNSTAKE: Execute immediately (no confirmation)
- WRAP/UNWRAP/TRANSFER: Execute immediately (no confirmation)
NEVER ask "proceed?" or wait for user approval. Execute everything in ONE response.

**EXECUTION STRATEGY - DATA DEPENDENCY ANALYSIS:**

Before executing multiple operations, analyze DATA FLOW:

1. **PARALLEL** - Operations are INDEPENDENT (no shared data):
   - "swap 1 MON to USDC and swap 1 MON to DAK" → PARALLEL (both use MON as input)
   - "wrap 1 MON, stake 1 MON, swap 1 MON to USDC" → PARALLEL (each uses fresh MON)
   - "show NFTs and show balances" → PARALLEL (read-only, no dependencies)

2. **SEQUENTIAL** - Output of one is INPUT to next:
   - "swap MON to USDC, then swap that USDC to DAK" → SEQUENTIAL (USDC output → USDC input)
   - "swap all my MON to USDC" → SEQUENTIAL (need balance first)
   - "getSwapQuote → executeSwap" → SEQUENTIAL (need quoteId)

**Decision Rule:**
- If operation B needs the RESULT of operation A → SEQUENTIAL
- If operation B uses FRESH inputs (not A's output) → PARALLEL

**Examples:**
| User Request | Execution | Why |
|-------------|-----------|-----|
| "swap 1 MON to USDC, 1 MON to DAK, 1 MON to WETH" | PARALLEL | Each uses fresh 1 MON |
| "swap all MON to USDC then swap half to DAK" | SEQUENTIAL | Second needs USDC amount from first |
| "wrap 1 MON and stake 1 MON" | PARALLEL | Independent operations |
| "swap to USDC and send it to alice.nad" | SEQUENTIAL | Transfer needs swap output |

CRITICAL: Do NOT rely on keywords alone. "swap X and swap Y" could be SEQUENTIAL if Y uses X's output.

**SESSION KEY FUNDING:**
Before executing batch operations (2+ swaps/transfers), ALWAYS check session key balance:
1. Count total operations planned (swaps, transfers, stakes, etc.)
2. Call checkSessionKeyBalance with estimatedOperations parameter (e.g., {estimatedOperations: 3})
3. If needsFunding = true, call fundSessionKey and WAIT for it to complete
4. ONLY THEN (after fundSessionKey completes) → proceed to execution (do NOT check balance again)

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
4. If needsFunding = true → call fundSessionKey (no user permission needed)
5. ONLY THEN (after fundSessionKey completes) → call executeSwap (do NOT check balance again)

For DIRECT operations (transfer/wrap/unwrap/stake/unstake):
1. IMMEDIATELY BEFORE execution tool → call checkSessionKeyBalance
   - Single operation → {estimatedOperations: 1}
   - Batch operations → {estimatedOperations: N}
2. If needsFunding = true → call fundSessionKey (no user permission needed)
3. ONLY THEN (after fundSessionKey completes) → call execution tool (do NOT check balance again)

Session key funding is a maintenance operation that does not require user confirmation.

**FUNDING + EXECUTION IN SAME TURN (CRITICAL):**
In Quick Mode, after fundSessionKey completes, CONTINUE executing in the same response:
1. fundSessionKey → wait for completion
2. IMMEDIATELY proceed to execution tools (no stopping, no waiting)
3. Complete ALL operations in one response

Do NOT say "[next turn will execute]" - there is no next turn in Quick Mode.
Execute everything NOW.

**BALANCE FETCHING:**
- User says "show balances" or "what do I have" → use getAllBalances (fast, gets all tokens)
- User says "what's my USDC" → use getBalance(USDC) (precise, single token)

For swaps: call getSwapQuote then executeSwap with the quote ID.
For wrap/unwrap/transfer: call tool directly.

Group capabilities with **bold section headers**. Use emojis sparingly. Natural, conversational tone.`
      : `YOU ARE IN NORMAL MODE - Ask for user confirmation BEFORE executing.

**CRITICAL - NORMAL MODE BEHAVIOR (CONFIRMATION BOUNDARY):**
- SWAPS: Call getSwapQuote → show quote → END YOUR RESPONSE → wait for user's NEW message ("yes") → then executeSwap
- STAKE/UNSTAKE: Show intent → END YOUR RESPONSE → wait for user's NEW message ("yes") → then execute
- WRAP/UNWRAP/TRANSFER: Show intent → END YOUR RESPONSE → wait for user's NEW message ("yes") → then execute
NEVER call executeSwap/stake/transfer in the SAME response as showing the quote/intent. ALWAYS wait for a NEW user message.

**EXECUTION STRATEGY - DATA DEPENDENCY ANALYSIS:**

Before executing multiple operations, analyze DATA FLOW:

1. **PARALLEL** - Operations are INDEPENDENT (no shared data):
   - "swap 1 MON to USDC and swap 1 MON to DAK" → PARALLEL (both use MON as input)
   - "wrap 1 MON, stake 1 MON, swap 1 MON to USDC" → PARALLEL (each uses fresh MON)
   - "show NFTs and show balances" → PARALLEL (read-only, no dependencies)

2. **SEQUENTIAL** - Output of one is INPUT to next:
   - "swap MON to USDC, then swap that USDC to DAK" → SEQUENTIAL (USDC output → USDC input)
   - "swap all my MON to USDC" → SEQUENTIAL (need balance first)
   - "getSwapQuote → executeSwap" → SEQUENTIAL (need quoteId)

**Decision Rule:**
- If operation B needs the RESULT of operation A → SEQUENTIAL
- If operation B uses FRESH inputs (not A's output) → PARALLEL

**Examples:**
| User Request | Execution | Why |
|-------------|-----------|-----|
| "swap 1 MON to USDC, 1 MON to DAK, 1 MON to WETH" | PARALLEL | Each uses fresh 1 MON |
| "swap all MON to USDC then swap half to DAK" | SEQUENTIAL | Second needs USDC amount from first |
| "wrap 1 MON and stake 1 MON" | PARALLEL | Independent operations |
| "swap to USDC and send it to alice.nad" | SEQUENTIAL | Transfer needs swap output |

CRITICAL: Do NOT rely on keywords alone. "swap X and swap Y" could be SEQUENTIAL if Y uses X's output.

**SESSION KEY FUNDING:**
Before executing batch operations (2+ swaps/transfers), ALWAYS check session key balance:
1. Count total operations planned (swaps, transfers, stakes, etc.)
2. Call checkSessionKeyBalance with estimatedOperations parameter (e.g., {estimatedOperations: 3})
3. If needsFunding = true, call fundSessionKey and WAIT for it to complete
4. ONLY THEN (after fundSessionKey completes) → proceed to execution (do NOT check balance again)

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
4. If needsFunding = true → call fundSessionKey (no user permission needed)
5. ONLY THEN (after fundSessionKey completes) → call executeSwap (do NOT check balance again)

For DIRECT operations (transfer/wrap/unwrap/stake/unstake):
1. Show intent to user and wait for approval
2. AFTER user confirms → IMMEDIATELY BEFORE execution tool → call checkSessionKeyBalance
   - Single operation → {estimatedOperations: 1}
   - Batch operations → {estimatedOperations: N}
3. If needsFunding = true → call fundSessionKey (no user permission needed)
4. ONLY THEN (after fundSessionKey completes) → call execution tool (do NOT check balance again)

Session key funding is a maintenance operation that does not require user confirmation.

**FUNDING FLOW (CRITICAL):**
After user confirms ("yes"):
1. Check session key balance
2. If needsFunding = true → fund session key (silent, no user confirmation needed)
3. IMMEDIATELY execute in THE SAME RESPONSE - do NOT ask again

The user's "yes" covers BOTH funding AND execution. Never ask twice.

**BALANCE FETCHING:**
- User says "show balances" or "what do I have" → use getAllBalances (fast, gets all tokens)
- User says "what's my USDC" → use getBalance(USDC) (precise, single token)

For swaps: call getSwapQuote, show quote, wait for approval ('yes', 'execute', 'proceed'), then executeSwap.
For wrap/unwrap/transfer: ask first, then execute.

Group capabilities with **bold section headers**. Use emojis sparingly. Natural, conversational tone.`;

    // Select prompt based on model provider
    // - Gemini: Dedicated prompt with 5 improvements from founder's audit
    // - DeepSeek/Kimi/Grok: Comprehensive prompt with full tool docs (no compression)
    // - OpenAI (GPT-5-mini): Base prompt (designed for GPT's natural behavior)
    const modelProvider = process.env.NEXT_PUBLIC_MODEL_PROVIDER || 'deepseek';
    const basePrompt =
      modelProvider === 'gemini' ? PRAGMA_H2_SYSTEM_PROMPT_GEMINI :
      ['deepseek', 'kimi', 'grok'].includes(modelProvider) ? PRAGMA_H2_SYSTEM_PROMPT_GROK :
      PRAGMA_H2_SYSTEM_PROMPT;

    // =========================================================================
    // Sliding Window (Anti-Hallucination)
    // =========================================================================
    // Apply sliding window BEFORE sending to agent to prevent context pollution.
    // Old assistant responses contain stale data that causes hallucinations.
    // Exception: Gemini has 1M context and we're testing if it can handle full history.
    const windowedMessages = modelProvider === "gemini"
      ? messages  // Gemini: keep full history (1M context test)
      : applySlidingWindow(messages);

    // Log sliding window application
    logger.debug("Sliding window:", {
      originalMessageCount: messages.length,
      windowedMessageCount: windowedMessages.length,
      trimmed: messages.length !== windowedMessages.length,
    });

    // Apply placeholder replacements
    const systemPrompt = basePrompt
      .replace(/\[userAddress from context\]/g, context.userAddress)
      .replace(/\[userAddress\]/g, context.userAddress)
      .replace(/\[EXECUTION_MODE\]/g, modeInstructions);

    // Prepend system prompt to messages (filter out any existing system messages)
    const messagesWithSystem: MessageTuple[] = [
      ["system", systemPrompt],
      ...windowedMessages.filter(([role]) => role !== "system"),
    ];

    // Format messages for LangChain
    const formattedMessages = messagesWithSystem.map(([role, content]) => ({
      role,
      content,
    }));

    // Mark LLM start
    metrics.markLLMStart();

    // Stream events from agent (with dynamic reasoning effort)
    const stream = activeAgent.streamEvents(
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
          userBalances: context.userBalances, // For unverified token symbol resolution
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
        const chunk = event.data?.chunk;
        const rawContent = chunk?.content;

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

        // Parse reasoning markers injected by DeepSeek proxy
        // Format: <<REASON>>thinking text<<END_REASON>>actual content
        // LangChain drops unknown fields, so proxy injects reasoning into content
        if (delta) {
          // Extract all reasoning blocks
          const reasoningRegex = /<<REASON>>([\s\S]*?)<<END_REASON>>/g;
          let match;
          let cleanDelta = delta;

          while ((match = reasoningRegex.exec(delta)) !== null) {
            const reasoningToken = match[1];
            if (reasoningToken) {
              callbacks.onReasoningToken?.(reasoningToken);
              // Track reasoning tokens (~4 chars per token)
              reasoningTokenCount += Math.ceil(reasoningToken.length / 4);
            }
            // Remove the reasoning marker from delta
            cleanDelta = cleanDelta.replace(match[0], "");
          }

          // Process remaining content (after removing reasoning markers)
          if (cleanDelta) {
            metrics.markFirstToken();
            currentResponse += cleanDelta;
            callbacks.onToken?.(cleanDelta);
            // Track output tokens (~4 chars per token)
            outputTokenCount += Math.ceil(cleanDelta.length / 4);
          }
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

        // Track tool start for metrics
        metrics.markToolStart(event.name, signature);

        // Count tool calls for token tracking
        toolCallCount++;
      } else if (event.event === "on_tool_end") {
        // Tool execution completed
        // Retrieve signature from map using run_id
        const signature = event.run_id ? signatureMap.get(event.run_id) : undefined;

        callbacks.onToolEnd?.(event.name, event.data?.output, signature);

        // Track tool end for metrics
        metrics.markToolEnd(event.name, signature);

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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (event.data as any)?.error?.message || "Unknown error",
          signature
        );

        // Track tool end for metrics (even on error)
        metrics.markToolEnd(event.name, signature);

        // Cleanup
        if (event.run_id) {
          signatureMap.delete(event.run_id);
        }
      }
    }

    // Cleanup progress subscription
    offProgress(progressHandler);

    // Complete metrics and log summary
    metrics.complete();
    metrics.logSummary();

    // Record token metrics for hallucination detection
    // Input tokens estimated from message history (~4 chars per token)
    const inputTokenEstimate = messages.reduce((acc, [, content]) => {
      return acc + Math.ceil((content?.length || 0) / 4);
    }, 0);

    tokenTracker.recordTurn(
      inputTokenEstimate,
      outputTokenCount,
      reasoningTokenCount,
      messages.length + 1 // +1 for the assistant response being added
    );

    callbacks.onComplete?.();

    return currentResponse;
  } catch (error) {
    // Cleanup progress subscription on error
    if (progressHandler) {
      offProgress(progressHandler);
    }

    // Log metrics even on error (helps debug where it failed)
    metrics.complete();
    metrics.logSummary();

    logger.error("Streaming failed:", error);
    callbacks.onError?.(
      error instanceof Error ? error : new Error(String(error))
    );
    throw error;
  }
}
