/**
 * H2 Agent REPL
 *
 * Interactive REPL for the H2 LangChain-powered agent.
 */

import readline from "node:readline";
import chalk from "chalk";

import { createPragmaH2Agent, PRAGMA_H2_SYSTEM_PROMPT } from "@pragma/core";
import { loadAllowedTokens } from "./monorailTokens.js";

// ============================================================================
// Types
// ============================================================================

export interface H2AgentReplOptions {
  apiKey?: string;
  quickMode?: boolean;
  userAddress?: string;
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
 */
const promptLine = async (prompt: string): Promise<string> => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

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
  }
): Promise<MetaCommandResult> => {
  const cmd = command.toLowerCase().trim();

  switch (cmd) {
    case "/help":
    case "/h":
      console.log(chalk.bold("\nPragma H2 Agent - Commands\n"));
      console.log(chalk.cyan("Meta Commands:"));
      console.log("  /help, /h       - Show this help message");
      console.log("  /quick          - Toggle quick mode (yolo mode - execute immediately)");
      console.log("  /exit, /q       - Exit the REPL");
      console.log("");
      console.log(chalk.cyan("Exit Commands:"));
      console.log("  exit, quit, q, :q, bye");
      console.log("");
      console.log(chalk.cyan("Example Queries:"));
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

  // Initialize conversation history
  const messages: Array<[string, string]> = [["system", PRAGMA_H2_SYSTEM_PROMPT]];

  // State
  let quickMode = options.quickMode ?? false;
  const setQuickMode = (value: boolean) => {
    quickMode = value;
  };

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
        const result = await handleMetaCommand(line, { quickMode, setQuickMode });
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

      // Stream agent response with token-level streaming
      const stream = await agent.streamEvents(
        { messages },
        {
          version: "v2",
          configurable: {
            userAddress,
            allowedTokens,
            quickMode,
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
          process.stdout.write(chalk.blue(buffer));
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
      console.error(chalk.red(`\n❌ Error: ${(error as Error).message}\n`));
      if (process.env.DEBUG) {
        console.error(chalk.gray((error as Error).stack));
      }
      // Remove failed user message from history
      if (messages[messages.length - 1]?.[0] === "user") {
        messages.pop();
      }
      // Continue REPL
    }
  }
};
