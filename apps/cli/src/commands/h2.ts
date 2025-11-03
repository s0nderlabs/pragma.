/**
 * H2 Command - Interactive REPL for LangChain-powered AI agent
 *
 * Usage: pragma h2 [--api-key <key>] [--quick] [--address <address>]
 */

import { Command } from "commander";
import chalk from "chalk";
import { createPublicClient, http } from "viem";

import { runPragmaH2Repl } from "../services/h2AgentLoop.js";
import { loadSessionState, isH2SessionComplete } from "../services/sessionStore.js";
import { runH2Onboarding } from "../services/h2Onboarding.js";
import { monadChain } from "../services/web3authClients.js";

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

    // Check session state - always run onboarding for production (can't persist Web3Auth yet)
    let sessionState = await loadSessionState();
    let web3authBridge: any = undefined;

    // If user provided --address, use that (for testing)
    // Otherwise, run onboarding to get fresh Web3Auth login
    if (!options.address) {
      // Check if we have existing keys (will be reused)
      if (isH2SessionComplete(sessionState) && !sessionState.requireOnboard) {
        console.log(chalk.gray(`\n✓ Existing session found: ${sessionState.delegator}`));
        console.log(chalk.gray("Re-authenticating with Web3Auth (will reuse existing keys)...\n"));
      } else {
        console.log(chalk.yellow("\n⚠️  H2 session not found or incomplete\n"));
      }

      // Run onboarding (will reuse HybridDelegator and session key if they exist)
      const onboardingResult = await runH2Onboarding();
      const bridge = onboardingResult.bridge; // Capture bridge to keep alive
      web3authBridge = onboardingResult.bridge; // Use bridge for delegation signing
      const smartAccount = onboardingResult.smartAccount; // For UserOp-based session key funding
      const bundlerClient = onboardingResult.bundlerClient; // For UserOp-based session key funding

      // Reload session state after onboarding
      sessionState = await loadSessionState();

      if (!isH2SessionComplete(sessionState)) {
        throw new Error("Onboarding completed but session state is still incomplete");
      }

      console.log(chalk.gray("\nStarting H2 REPL...\n"));

      // Create publicClient for balance checks and RPC calls
      const rpcUrl = process.env.MONAD_EXECUTION_RPC_URL || "https://rpc.ankr.com/monad_testnet";
      const publicClient = createPublicClient({
        chain: monadChain,
        transport: http(rpcUrl),
      });

      // Launch REPL with session data - bridge stays alive during session
      try {
        await runPragmaH2Repl({
          apiKey,
          quickMode: options.quick,
          userAddress: options.address || sessionState.delegator,
          sessionData: options.address ? undefined : sessionState,
          web3authBridge,
          publicClient,
          smartAccount,
          bundlerClient,
        });
      } finally {
        // Clean up bridge when REPL exits
        if (bridge?.shutdown) {
          await bridge.shutdown();
        }
      }
    } else {
      // --address mode (test mode without onboarding)
      const rpcUrl = process.env.MONAD_EXECUTION_RPC_URL || "https://rpc.ankr.com/monad_testnet";
      const publicClient = createPublicClient({
        chain: monadChain,
        transport: http(rpcUrl),
      });

      await runPragmaH2Repl({
        apiKey,
        quickMode: options.quick,
        userAddress: options.address || sessionState.delegator,
        sessionData: options.address ? undefined : sessionState,
        web3authBridge,
        publicClient,
      });
    }
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
