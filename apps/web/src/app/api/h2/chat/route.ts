/**
 * H2 Chat API Route
 *
 * Server-side LangChain agent integration with SSE streaming.
 * Replaces H1 PragmaAgent with H2 LangChain-powered agent.
 *
 * Flow:
 * 1. Client sends message + session data via POST
 * 2. Server creates H2 agent and streams events via SSE
 * 3. Client consumes SSE stream for real-time updates
 *
 * Event Types:
 * - token: AI response tokens (character-by-character streaming)
 * - progress: Tool execution progress updates
 * - tool_start: Tool execution beginning
 * - tool_end: Tool execution complete
 * - tool_error: Tool execution failed
 * - done: Stream complete
 * - error: Fatal error occurred
 */

import { createPragmaH2Agent, PRAGMA_H2_SYSTEM_PROMPT, onProgress, offProgress, type ProgressEvent } from "@pragma/core";
import type { H2SessionState, AllowedToken } from "@/lib/h2/types";
import { getAddress, type Address, createPublicClient, http, createWalletClient, type Transport, type Account } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { createBundlerClient } from "viem/account-abstraction";
import { Implementation, toMetaMaskSmartAccount, getDeleGatorEnvironment } from "@metamask/delegation-toolkit";
import { PIMLICO_BUNDLER_URL } from "@/lib/config";
import { createClientSideWeb3AuthBridge } from "@/lib/h2/clientSideWeb3AuthBridge";
import type { SignatureRequest } from "@/lib/h2/signatureCoordinator";

// ============================================================================
// Configuration
// ============================================================================

const MONAD_CHAIN_ID = Number.parseInt(process.env.NEXT_PUBLIC_MONAD_CHAIN_ID ?? "10143", 10);
const MONAD_RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const MONAD_EXECUTION_RPC_URL = process.env.NEXT_PUBLIC_MONAD_EXECUTION_RPC_URL ?? MONAD_RPC_URL;

const monadChain = {
  id: MONAD_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [MONAD_RPC_URL] },
    public: { http: [MONAD_RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: "https://testnet.monadexplorer.com",
    },
  },
} as const;

// ============================================================================
// Types
// ============================================================================

interface H2ChatRequest {
  messages: Array<[string, string]>; // [role, content] tuples for LangChain
  userAddress: string;
  sessionData?: H2SessionState;
  quickMode?: boolean;
  allowedTokens?: AllowedToken[];
}

interface SSEEvent {
  type: "token" | "progress" | "tool_start" | "tool_end" | "tool_error" | "signature_request" | "done" | "error";
  content?: string;
  message?: string;
  toolName?: string;
  output?: unknown;
  error?: string;
  timestamp?: number;
  signatureRequest?: SignatureRequest;
}

// ============================================================================
// SSE Utilities
// ============================================================================

const textEncoder = new TextEncoder();

/**
 * Encode an event as SSE format
 */
function encodeSSE(event: SSEEvent): Uint8Array {
  const data = JSON.stringify(event);
  return textEncoder.encode(`data: ${data}\n\n`);
}

/**
 * Create SSE response with proper headers
 */
function createSSEResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}

// ============================================================================
// Request Handler
// ============================================================================

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = (await request.json()) as H2ChatRequest;

    // Validate required fields
    if (!body.messages || !Array.isArray(body.messages)) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!body.userAddress) {
      return new Response(
        JSON.stringify({ error: "userAddress is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get OpenAI API key (prioritize H2-specific key)
    const apiKey = process.env.OPENAI_API_KEY_H2 || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured. Set OPENAI_API_KEY_H2 environment variable." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create H2 agent
    const agent = createPragmaH2Agent({ apiKey });

    // Create public client for balance checks
    const publicClient = createPublicClient({
      chain: monadChain,
      transport: http(MONAD_RPC_URL),
    });

    // Create session wallet with nonce manager (for parallel transactions)
    let sessionWallet: ReturnType<typeof createWalletClient> | undefined;
    let smartAccount: any;
    let bundlerClient: any;
    let web3authBridge: any;

    if (body.sessionData?.sessionKeyPrivateKey && body.sessionData?.chainId) {
      try {
        const account = privateKeyToAccount(
          body.sessionData.sessionKeyPrivateKey as `0x${string}`,
          { nonceManager } // Enable atomic nonce management
        );

        sessionWallet = createWalletClient({
          account,
          chain: monadChain,
          transport: http(MONAD_EXECUTION_RPC_URL),
        });

        // Note: Initial session key funding (0 MON → 1.0 MON) is handled client-side
        // in useH2Onboarding.ts during wallet connection for immediate availability.
        // Runtime funding (including fallback UserOp) is handled by fundSessionKey tool
        // which uses smartAccount/bundlerClient created inside the SSE stream callback.
      } catch (error) {
        console.error("Failed to create session wallet:", error);
        // Continue without session wallet (tools will create individual wallets)
      }
    }

    // Build system prompt with mode instructions
    const quickMode = body.quickMode ?? false;
    console.log('[H2 API] 🔍 QuickMode received:', body.quickMode, '| Resolved to:', quickMode);
    console.log('[H2 API] 📋 Will use mode:', quickMode ? 'QUICK MODE' : 'NORMAL MODE');
    const modeInstructions = quickMode
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
⚡ CRITICAL TIMING: Check session key balance ONLY when user FIRST REQUESTS the operation.
The operation STARTS when user makes initial request, NOT when you execute tools.
- DO NOT re-check after showing quotes (balance doesn't change during quote fetch)
- DO NOT re-check after executing swaps in parallel (balance only changes during funding)
- Only re-check if: funding just completed, execution failed with low balance, or user explicitly requests

Before executing batch operations (2+ swaps/transfers):
1. Call checkSessionKeyBalance ONCE when user first requests
2. If needsFunding = true, call fundSessionKey ONCE
3. Then execute all operations in parallel (skip re-checking balance)

For single operations: Just execute - if balance low, tool will error.
AUTOMATICALLY call fundSessionKey (no user permission needed) then retry the operation.
Session key funding is a maintenance operation that does not require user confirmation.

**BALANCE FETCHING:**
- User says "show balances" or "what do I have" → use getAllBalances (fast, gets all tokens)
- User says "what's my USDC" → use getBalance(USDC) (precise, single token)

**SWAP EXECUTION (Quote Reuse Required):**
⚡ CRITICAL: For swaps, call getSwapQuote ONCE to get quote IDs, then IMMEDIATELY call executeSwap with those SAME quote IDs.
- DO NOT call getSwapQuote again before executeSwap (wastes time, causes quote expiry)
- Quotes expire after 10 minutes - reusing IDs prevents expiry errors
- Only re-fetch if user explicitly requests fresh quotes or parameters changed

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
⚡ CRITICAL TIMING: Check session key balance ONLY when user FIRST REQUESTS the operation.
The operation STARTS when user makes initial request, NOT when they confirm "yes".
- DO NOT re-check after showing quotes (balance doesn't change during quote fetch)
- DO NOT re-check after user confirms "yes"/"execute"/"proceed" (still same operation)
- Only re-check if: funding just completed, execution failed with low balance, or user explicitly requests

Before executing batch operations (2+ swaps/transfers):
1. Call checkSessionKeyBalance ONCE when user first requests
2. If needsFunding = true, call fundSessionKey ONCE
3. Fetch quotes and show user
4. After confirmation, execute directly (skip re-checking balance)

For single operations: Just execute - if balance low, tool will error.
AUTOMATICALLY call fundSessionKey (no user permission needed) then retry the operation.
Session key funding is a maintenance operation that does not require user confirmation.

**BALANCE FETCHING:**
- User says "show balances" or "what do I have" → use getAllBalances (fast, gets all tokens)
- User says "what's my USDC" → use getBalance(USDC) (precise, single token)

**SWAP EXECUTION (Quote Reuse Required):**
⚡ CRITICAL: For swaps:
1. Call getSwapQuote ONCE to get quote IDs
2. Show quotes to user
3. Wait for user approval ("yes", "execute", "proceed")
4. When approved: REUSE THE SAME QUOTE IDs - call executeSwap(quoteIds) directly
5. DO NOT call getSwapQuote again before executeSwap (wastes time, causes quote expiry)

Quotes expire after 10 minutes. Reusing quote IDs is REQUIRED for efficiency.
Only re-fetch if user says "fresh quote"/"new quote" or changed amount/slippage/tokens.

**CONFIRMATION HANDLING:**
When user confirms with "yes"/"execute"/"proceed":
- This is a CONTINUATION of the SAME operation (not a new start)
- Look at YOUR PREVIOUS MESSAGES to find the quote IDs you showed
- REUSE those exact quote IDs - call executeSwap immediately
- DO NOT re-check balance (already checked when user first requested)
- DO NOT re-fetch quotes (already fetched and shown to user)

Example: You showed "Quote abc123: 1 MON → 3 USDC", user says "yes" → executeSwap("abc123") immediately.

For wrap/unwrap/transfer: ask first, then execute.`;

    const systemPrompt = PRAGMA_H2_SYSTEM_PROMPT
      .replace(/\[userAddress from context\]/g, body.userAddress)
      .replace(/\[userAddress\]/g, body.userAddress)
      .replace(/\[EXECUTION_MODE\]/g, modeInstructions);

    console.log('[H2 API] 📝 System prompt constructed:', {
      quickMode,
      promptPreview: systemPrompt.substring(0, 200) + '...'
    });

    // Prepend system prompt to messages
    const messages: Array<[string, string]> = [
      ["system", systemPrompt],
      ...body.messages.filter(([role]) => role !== "system"), // Filter out any existing system messages
    ];

    console.log('[H2 API] 📨 Messages sent to agent:', {
      count: messages.length,
      firstMessageRole: messages[0]?.[0],
      firstMessagePreview: messages[0]?.[1]?.substring(0, 100),
    });

    // Create SSE stream
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // Progress event handler - forward to SSE stream
        const progressHandler = (event: ProgressEvent) => {
          controller.enqueue(
            encodeSSE({
              type: "progress",
              message: event.message,
              toolName: event.toolName,
              timestamp: event.timestamp,
            })
          );
        };

        // Subscribe to progress events
        onProgress(progressHandler);

        // Create client-side bridge for delegation signing
        // This bridge requests signatures from the browser client instead of signing directly
        // Controller is now available, so we can emit SSE events
        const clientWeb3AuthBridge = body.sessionData?.sessionKeyPrivateKey
          ? createClientSideWeb3AuthBridge((signatureRequest) => {
              console.log("[H2 API] Emitting signature_request to client");
              controller.enqueue(
                encodeSSE({
                  type: "signature_request",
                  signatureRequest,
                })
              );
            })
          : undefined;

        // Create smartAccount and bundlerClient for UserOp-based session key funding
        // These are needed for fallback funding when session key balance < 0.1 MON
        if (clientWeb3AuthBridge && body.sessionData?.ownerAddress) {
          try {
            console.log("[H2 API] Creating smartAccount with clientSideWeb3AuthBridge signer...");

            // Get DeleGator environment for proper deployment
            const env = getDeleGatorEnvironment(monadChain.id);

            // Create smartAccount using bridge as signer
            // Wrap clientWeb3AuthBridge in proper Account interface for DTK
            smartAccount = await toMetaMaskSmartAccount({
              client: publicClient,
              implementation: Implementation.Hybrid,
              signer: {
                account: {
                  address: body.sessionData.ownerAddress as Address,
                  type: 'local' as const,

                  async signMessage() {
                    // Not needed for delegation signing, but required by Account interface
                    throw new Error('signMessage not supported in server-side bridge context');
                  },

                  async signTypedData(typedData: any) {
                    // Serialize with BigInt support (convert BigInt to string)
                    const typedDataJson = JSON.stringify(typedData, (key, value) =>
                      typeof value === 'bigint' ? value.toString() : value
                    );

                    const { signature } = await clientWeb3AuthBridge.signTypedData({
                      typedDataJson,
                      from: body.sessionData.ownerAddress,
                    });
                    return signature;
                  },
                }
              },
              deployParams: [
                body.sessionData.ownerAddress as `0x${string}`,
                [], // delegations
                [], // salt
                [],  // empty
              ],
              deploySalt: "0x",
            });

            console.log("[H2 API] SmartAccount created:", smartAccount.address);

            // Create bundlerClient for UserOp submission
            bundlerClient = createBundlerClient({
              client: publicClient,
              transport: http(PIMLICO_BUNDLER_URL),
            });

            console.log("[H2 API] BundlerClient created");
          } catch (error) {
            console.error("[H2 API] Failed to create smartAccount/bundlerClient:", error);
            // Continue without them - delegation-based funding will still work
          }
        }

        try {
          // Stream agent events
          const agentStream = await agent.streamEvents(
            { messages },
            {
              version: "v2",
              recursionLimit: 60, // Support large batch operations
              configurable: {
                userAddress: body.userAddress,
                allowedTokens: body.allowedTokens || [],
                quickMode,
                publicClient,
                sessionData: body.sessionData,
                sessionWallet,
                smartAccount,
                bundlerClient,
                web3authBridge: clientWeb3AuthBridge,
              },
            }
          );

          // Process stream events
          for await (const event of agentStream) {
            // Token-level streaming from AI
            if (event.event === "on_chat_model_stream") {
              const rawContent = event.data?.chunk?.content;

              // Extract text delta (handle string and array formats)
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
                controller.enqueue(
                  encodeSSE({
                    type: "token",
                    content: delta,
                  })
                );
              }
            }
            // Tool execution start
            else if (event.event === "on_tool_start") {
              controller.enqueue(
                encodeSSE({
                  type: "tool_start",
                  toolName: event.name,
                })
              );
            }
            // Tool execution complete
            else if (event.event === "on_tool_end") {
              controller.enqueue(
                encodeSSE({
                  type: "tool_end",
                  toolName: event.name,
                  output: event.data?.output,
                })
              );
            }
            // Tool execution error
            else if (event.event === "on_tool_error") {
              controller.enqueue(
                encodeSSE({
                  type: "tool_error",
                  toolName: event.name,
                  error: String(event.data?.error || "Unknown error"),
                })
              );
            }
          }

          // Stream complete
          controller.enqueue(
            encodeSSE({
              type: "done",
            })
          );
        } catch (error) {
          // Stream error
          console.error("H2 agent stream error:", error);
          controller.enqueue(
            encodeSSE({
              type: "error",
              error: error instanceof Error ? error.message : String(error),
            })
          );
        } finally {
          // Cleanup
          offProgress(progressHandler);
          controller.close();
        }
      },
    });

    return createSSEResponse(stream);
  } catch (error) {
    console.error("H2 chat API error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ============================================================================
// Method Not Allowed
// ============================================================================

export async function GET() {
  return new Response("Method not allowed", { status: 405 });
}
