/**
 * H2 Agent REPL
 *
 * Interactive REPL for the H2 LangChain-powered agent.
 */

import readline from "node:readline";
import { setMaxListeners } from "node:events";
import chalk from "chalk";
import { createWalletClient, http, type WalletClient } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";

// Increase max listeners for batch operations
// LangChain/LangGraph uses AbortSignals for cancellation/timeout on each tool call
// Default limit is 10, but batch operations (10 swaps = 20+ tool calls) need higher limit
// This is safe - LangGraph properly cleans up listeners after each operation completes
setMaxListeners(50); // Support up to ~20 batch operations safely

import { createPragmaH2Agent, PRAGMA_H2_SYSTEM_PROMPT } from "@pragma/core";
import { loadAllowedTokens } from "./monorailTokens.js";
import { logoutH2Session, type SessionState } from "./sessionStore.js";
import type { Web3AuthBridge } from "./web3authServer.js";
import type { H2Bridge } from "./h2Bridge.js";

export interface H2AgentReplOptions {
  apiKey?: string;
  quickMode?: boolean;
  userAddress?: string;
  sessionData?: SessionState; // For Phase 3+: delegation/execution
  web3authBridge?: Web3AuthBridge | H2Bridge; // Bridge for signing delegations (Web3Auth for prod, H2Bridge for dev)
  publicClient?: any; // Viem public client for balance checks and RPC calls
  smartAccount?: any; // Smart account instance from DTK (for UserOp-based session key funding)
  bundlerClient?: any; // Bundler client (for UserOp-based session key funding)
}

// ============================================================================
// Constants
// ============================================================================

const EXIT_COMMANDS = new Set(["exit", "quit", "q", ":q", "/q", "bye"]);
const MAX_HISTORY_MESSAGES = 20; // System prompt + 10 conversation turns

// ============================================================================
// Input Handling
// ============================================================================

/**
 * Prompt for user input with readline
 * Handles SIGINT (Ctrl+C) to allow graceful exit
 */
const promptLine = async (prompt: string): Promise<string> => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const handleSigint = () => {
      process.stdout.write("^C\n");
      rl.close();
      resolve("exit");  // Return "exit" to break the main loop
    };

    rl.on("SIGINT", handleSigint);

    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

// ============================================================================
// Meta Commands
// ============================================================================

type MetaCommandResult = "continue" | "exit";

const handleMetaCommand = async (
  command: string,
  state: {
    quickMode: boolean;
    setQuickMode: (value: boolean) => void;
    userAddress?: string;
    sessionData?: SessionState;
  }
): Promise<MetaCommandResult> => {
  const cmd = command.toLowerCase().trim();

  switch (cmd) {
    case "/help":
    case "/h":
      console.log(chalk.bold("\nPragma H2 Agent - Commands\n"));
      console.log(chalk.cyan("Session Commands:"));
      console.log("  /account, /whoami  - Show current account and session info");
      console.log("  /logout            - Logout and clear session");
      console.log("");
      console.log(chalk.cyan("Meta Commands:"));
      console.log("  /help, /h          - Show this help message");
      console.log("  /quick             - Toggle quick mode (yolo mode - execute immediately)");
      console.log("  /exit, /q          - Exit the REPL");
      console.log("");
      console.log(chalk.cyan("Exit Commands:"));
      console.log("  exit, quit, q, :q, bye");
      console.log("");
      console.log(chalk.cyan("Example Queries:"));
      console.log("  what account am I using?");
      console.log("  show all my balances");
      console.log("  swap 0.1 MON to DAK");
      console.log("  wrap 0.5 MON");
      console.log("  unwrap 0.5 WMON");
      console.log("  send 100 USDC to 0x...");
      console.log("");
      console.log(chalk.gray("Note: Monad uses MON (not ETH) for the native token"));
      console.log("");
      return "continue";

    case "/quick":
      state.setQuickMode(!state.quickMode);
      if (state.quickMode) {
        console.log(chalk.yellow("⚡ Quick mode enabled - transactions will execute immediately"));
      } else {
        console.log(chalk.gray("Quick mode disabled - you will be asked to confirm"));
      }
      return "continue";

    case "/account":
    case "/whoami":
      console.log(chalk.bold("\n📋 Your Account Information\n"));
      if (!state.userAddress) {
        console.log(chalk.yellow("No active session found."));
        console.log(chalk.gray("Please restart the CLI to connect your wallet.\n"));
        return "continue";
      }

      console.log(chalk.cyan("Smart Account (HybridDelegator):"));
      console.log(`  ${state.userAddress}`);
      console.log("");

      if (state.sessionData) {
        if (state.sessionData.ownerAddress) {
          console.log(chalk.cyan("Owner Address (Web3Auth):"));
          console.log(`  ${state.sessionData.ownerAddress}`);
          console.log("");
        }

        if (state.sessionData.sessionKeyAddress) {
          console.log(chalk.cyan("Session Key (Ephemeral):"));
          console.log(`  ${state.sessionData.sessionKeyAddress}`);
          console.log("");
        }

        if (state.sessionData.chainId) {
          const chainName = state.sessionData.chainId === 10143 ? "Monad Testnet" : `Chain ${state.sessionData.chainId}`;
          console.log(chalk.cyan("Network:"));
          console.log(`  ${chainName} (Chain ID: ${state.sessionData.chainId})`);
          console.log("");
        }
      }

      console.log(chalk.gray("All transactions execute from your Smart Account.\n"));
      return "continue";

    case "/logout":
      console.log(chalk.yellow("\n⚠️  Logging out and clearing session...\n"));
      try {
        await logoutH2Session();
        console.log(chalk.green("✓ Session cleared successfully"));
        console.log(chalk.gray("Session keys preserved for reuse on next login."));
        console.log(chalk.gray("Run 'pragma h2' again to create a new session.\n"));
      } catch (error) {
        console.error(chalk.red(`Failed to clear session: ${(error as Error).message}\n`));
      }
      return "exit";

    case "/exit":
    case "/q":
      return "exit";

    default:
      console.log(chalk.red(`Unknown command: ${command}`));
      console.log(chalk.gray("Type /help for available commands"));
      return "continue";
  }
};

// ============================================================================
// Main REPL
// ============================================================================

export const runPragmaH2Repl = async (options: H2AgentReplOptions = {}): Promise<void> => {
  console.log(chalk.bold("\n🤖 Pragma H2 Agent REPL\n"));
  console.log(chalk.gray("Type /help for commands, or just chat naturally"));
  console.log(chalk.gray(`Quick mode: ${options.quickMode ? chalk.yellow("ON") : "off"}`));
  console.log("");

  // Load token context
  console.log(chalk.gray("Loading token list..."));
  const allowedTokens = await loadAllowedTokens();
  console.log(chalk.gray(`Loaded ${allowedTokens.length} tokens\n`));

  // Get user address
  const userAddress = options.userAddress || "0x742d35Cc6634C0532925a3b844Bc9e7595f0bE60";
  if (!options.userAddress) {
    console.log(chalk.gray(`Using test address: ${userAddress}\n`));
  }

  // Create agent
  const agent = createPragmaH2Agent({ apiKey: options.apiKey });

  // Create shared session wallet with nonce manager
  // The nonce manager provides atomic nonce management, preventing collisions
  // when executing parallel transactions (queues parallel calls, increments nonces safely)
  let sessionWallet: WalletClient | undefined;
  if (options.sessionData?.sessionKeyPrivateKey && options.sessionData?.chainId) {
    const MONAD_RPC_URL = process.env.MONAD_EXECUTION_RPC_URL || "https://testnet.monad.xyz/";

    try {
      // Create account with nonce manager for parallel transaction support
      const account = privateKeyToAccount(
        options.sessionData.sessionKeyPrivateKey as `0x${string}`,
        { nonceManager }  // Enable atomic nonce management for parallel operations
      );

      sessionWallet = createWalletClient({
        account,  // Account with nonce manager attached
        chain: {
          id: options.sessionData.chainId,
          name: "Monad",
          nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
          rpcUrls: {
            default: { http: [MONAD_RPC_URL] },
            public: { http: [MONAD_RPC_URL] },
          },
        },
        transport: http(MONAD_RPC_URL),
      });

      console.log(chalk.gray("✓ Session wallet initialized with nonce manager (parallel tx support)\n"));
    } catch (error) {
      console.log(chalk.yellow(`⚠ Failed to initialize session wallet: ${(error as Error).message}`));
      console.log(chalk.gray("  Tools will create wallets individually (fallback mode)\n"));
    }
  }

  // State
  let quickMode = options.quickMode ?? false;
  const setQuickMode = (value: boolean) => {
    quickMode = value;
  };

  // Initialize conversation history with actual userAddress and mode injected
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

  const systemPrompt = PRAGMA_H2_SYSTEM_PROMPT
    .replace(/\[userAddress from context\]/g, userAddress)
    .replace(/\[userAddress\]/g, userAddress)
    .replace(/\[EXECUTION_MODE\]/g, modeInstructions);

  const messages: Array<[string, string]> = [["system", systemPrompt]];

  // Process-level SIGINT handler as backup for graceful shutdown
  const sigintHandler = async () => {
    console.log(chalk.gray("\n\nInterrupted. Cleaning up...\n"));

    // Close Web3Auth browser window before exit (only for Web3AuthBridge, not H2Bridge)
    if (options.web3authBridge && 'shutdown' in options.web3authBridge) {
      try {
        await options.web3authBridge.shutdown();
        console.log(chalk.gray("✓ Browser window closed\n"));
      } catch (error) {
        console.log(chalk.yellow("⚠ Browser cleanup failed (may already be closed)\n"));
      }
    }

    process.exit(0);
  };
  process.on("SIGINT", sigintHandler);

  try {
    // Main loop
    while (true) {
    try {
      // Prompt
      const prompt = quickMode
        ? chalk.cyan("pragma ") + chalk.yellow("[quick]> ")
        : chalk.cyan("pragma> ");

      const inputLine = await promptLine(prompt);
      const line = inputLine.trim();

      // Skip empty lines
      if (!line) continue;

      // Handle meta commands
      if (line.startsWith("/")) {
        const result = await handleMetaCommand(line, {
          quickMode,
          setQuickMode,
          userAddress,
          sessionData: options.sessionData,
        });
        if (result === "exit") break;
        continue;
      }

      // Handle exit commands
      if (EXIT_COMMANDS.has(line.toLowerCase())) {
        console.log(chalk.gray("\nGoodbye! 👋\n"));
        break;
      }

      // Detect yolo/quick mode keywords in natural language
      const lowerLine = line.toLowerCase();

      // Enable quick mode
      if (!quickMode && (
        lowerLine.includes(" yolo") ||
        lowerLine.includes("yolo ") ||
        lowerLine === "yolo" ||
        lowerLine.includes("quick mode") ||
        lowerLine.includes("enable quick") ||
        lowerLine.includes("skip confirmation") ||
        lowerLine.includes("just do it")
      )) {
        quickMode = true;
        console.log(chalk.yellow("⚡ Quick mode enabled - executing immediately without confirmation\n"));
      }

      // Disable quick mode
      if (quickMode && (
        lowerLine.includes("disable quick") ||
        lowerLine.includes("turn off quick") ||
        lowerLine.includes("turn off yolo") ||
        lowerLine.includes("disable yolo") ||
        lowerLine.includes("normal mode") ||
        lowerLine.includes("stop quick") ||
        lowerLine.includes("exit yolo") ||
        lowerLine.includes("exit quick")
      )) {
        quickMode = false;
        console.log(chalk.gray("Quick mode disabled - you will be asked to confirm before execution\n"));
      }

      // Add user message to history
      messages.push(["user", line]);

      // Update system prompt with current mode
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

      const updatedSystemPrompt = PRAGMA_H2_SYSTEM_PROMPT
        .replace(/\[userAddress from context\]/g, userAddress)
        .replace(/\[userAddress\]/g, userAddress)
        .replace(/\[EXECUTION_MODE\]/g, modeInstructions);

      // Always update system message (first in array) with current mode
      messages[0] = ["system", updatedSystemPrompt];

      // Stream agent response with token-level streaming
      const stream = await agent.streamEvents(
        { messages },
        {
          version: "v2",
          recursionLimit: 60, // Increased from default 25 to handle large batch operations (8+ sequential operations)
          configurable: {
            userAddress,
            allowedTokens,
            quickMode,
            publicClient: options.publicClient,
            sessionData: options.sessionData,
            web3authBridge: options.web3authBridge,
            smartAccount: options.smartAccount,
            bundlerClient: options.bundlerClient,
            sessionWallet, // Shared wallet for transaction nonce management (prevents parallel tx collisions)
          },
        }
      );

      // Buffering for smooth character-by-character streaming (from H1 pattern)
      let buffer = "";
      let lastChunkTime = Date.now();
      const IMMEDIATE_THRESHOLD_MS = 80;
      const AUTO_FLUSH_MS = 300;

      const flushBuffer = (force = false) => {
        const elapsed = Date.now() - lastChunkTime;
        if (force || (buffer.length > 0 && elapsed >= IMMEDIATE_THRESHOLD_MS)) {
          process.stdout.write(chalk(buffer));
          buffer = "";
          lastChunkTime = Date.now();
        }
      };

      // Auto-flush interval for smooth display
      const flushInterval = setInterval(() => flushBuffer(), AUTO_FLUSH_MS);

      // Track assistant response for history
      let assistantResponse = "";
      let hasOutput = false;

      try {
        for await (const event of stream) {
          // Token-level streaming from LLM
          if (event.event === "on_chat_model_stream") {
            const rawContent = event.data?.chunk?.content;

            // Extract text delta from content (handle both string and array formats)
            let delta = "";
            if (typeof rawContent === "string") {
              delta = rawContent;
            } else if (Array.isArray(rawContent)) {
              // Content is an array of message parts (Responses API format)
              for (const part of rawContent) {
                if (part.type === "text" && part.text) {
                  delta += part.text;
                } else if (typeof part === "string") {
                  delta += part;
                }
              }
            }

            if (delta) {
              if (!hasOutput) {
                console.log(""); // Blank line before first output
                hasOutput = true;
              }
              assistantResponse += delta;
              buffer += delta;
              flushBuffer();
            }
          }
          // Tool execution start
          else if (event.event === "on_tool_start") {
            flushBuffer(true); // Force flush before tool display
            if (!hasOutput) {
              console.log("");
              hasOutput = true;
            }
            const toolName = event.name || "tool";
            console.log(chalk.cyan(`\n🔧 Calling ${toolName}...`));
          }
          // Tool execution complete
          else if (event.event === "on_tool_end") {
            const toolName = event.name || "tool";
            const output = event.data?.output;
            console.log(chalk.green(`✓ ${toolName} complete`));
            if (output && typeof output === "string") {
              // Display tool result
              console.log(chalk.gray(`   ${output.slice(0, 200)}${output.length > 200 ? "..." : ""}\n`));
            } else {
              console.log("");
            }
          }
        }
      } finally {
        clearInterval(flushInterval);
        flushBuffer(true); // Final flush
      }

      // Add assistant's response to history
      if (assistantResponse) {
        messages.push(["assistant", assistantResponse]);
      }

      // Prune history if too long (keep system prompt + last N messages)
      if (messages.length > MAX_HISTORY_MESSAGES) {
        messages.splice(1, messages.length - MAX_HISTORY_MESSAGES);
      }

      // Ensure newline after response
      if (hasOutput && !assistantResponse.endsWith("\n")) {
        console.log("");
      }
      console.log(""); // Blank line after response
    } catch (error) {
      const err = error as Error;
      console.error(chalk.red(`\n❌ Error: ${err.message}\n`));

      // Show error type for better debugging of intermittent issues
      if (err.name && err.name !== "Error") {
        console.error(chalk.gray(`   Type: ${err.name}`));
      }

      if (process.env.DEBUG) {
        console.error(chalk.gray(`   Stack: ${err.stack}`));
        console.error(chalk.gray(`   Full error:`), error);
      }

      // Remove failed user message from history
      if (messages[messages.length - 1]?.[0] === "user") {
        messages.pop();
      }
      // Continue REPL
    }
  }
  } finally {
    // Clean up SIGINT handler
    process.off("SIGINT", sigintHandler);
  }
};
