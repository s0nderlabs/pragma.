/**
 * H2 Command - Interactive REPL for LangChain-powered AI agent
 *
 * Usage: pragma h2 [--api-key <key>] [--quick] [--address <address>]
 */

import { Command } from "commander";
import chalk from "chalk";

import { runPragmaH2Repl } from "../services/h2AgentLoop.js";

// ============================================================================
// H2 Command Options
// ============================================================================

export interface H2CommandOptions {
  apiKey?: string;
  quick?: boolean;
  address?: string;
}

// ============================================================================
// H2 Command Handler
// ============================================================================

export async function h2Command(options: H2CommandOptions = {}) {
  try {
    // Get API key from options or environment
    const apiKey = options.apiKey || process.env.OPENAI_API_KEY_H2;

    if (!apiKey) {
      console.error(chalk.red("\n❌ OpenAI API key required\n"));
      console.log(chalk.gray("Set OPENAI_API_KEY_H2 environment variable or use --api-key flag"));
      console.log(chalk.gray("\nExample:"));
      console.log(chalk.cyan("  export OPENAI_API_KEY_H2=sk-..."));
      console.log(chalk.cyan("  pragma h2\n"));
      console.log(chalk.gray("Or:"));
      console.log(chalk.cyan("  pragma h2 --api-key sk-...\n"));
      process.exit(1);
    }

    // Launch REPL
    await runPragmaH2Repl({
      apiKey,
      quickMode: options.quick,
      userAddress: options.address,
    });
  } catch (error) {
    console.error(chalk.red(`\n❌ Error: ${(error as Error).message}\n`));
    if (process.env.DEBUG) {
      console.error(chalk.gray((error as Error).stack));
    }
    process.exit(1);
  }
}

// ============================================================================
// CLI Registration
// ============================================================================

export const registerH2 = (program: Command) => {
  program
    .command("h2")
    .description("Start interactive H2 LangChain agent REPL")
    .option("--api-key <key>", "OpenAI API key (or set OPENAI_API_KEY_H2 env var)")
    .option("--quick", "Enable quick mode (yolo mode - execute immediately without confirmation)")
    .option("--address <address>", "Wallet address to use (default: test address)")
    .action(async (options: H2CommandOptions) => {
      await h2Command(options);
    });
};
