/**
 * H2 Dev Command - Testing H2 with Direct PK
 *
 * This command provides a test/dev mode for H2 that bypasses Web3Auth
 * and uses direct private key signing. It's designed for testing the
 * quote/execute architecture without browser-based authentication.
 *
 * Usage:
 *   pragma dev h2                    # Use PRAGMA_ADMIN_TEST_PK
 *   pragma dev h2 --pk 0x...         # Use custom PK
 *   pragma dev h2 --skip-deploy      # Reuse existing HybridDelegator
 *   pragma dev h2 --skip-funding     # Don't fund session key
 */

import { Command } from "commander";
import chalk from "chalk";
import { type Hex } from "viem";

import { setupH2TestEnvironment } from "../services/h2TestSetup.js";
import { runPragmaH2Repl } from "../services/h2AgentLoop.js";

// ============================================================================
// H2 Dev Command
// ============================================================================

/**
 * Register the `pragma dev h2` command
 *
 * This creates a subcommand under `pragma dev` that allows testing H2
 * with direct private key authentication (no Web3Auth popup required).
 *
 * @param program - Commander program instance
 */
export function registerH2DevCommand(program: Command): void {
  program
    .command("h2")
    .description("[dev] H2 agent with test private key (no Web3Auth)")
    .option("--pk <privateKey>", "Private key to use (defaults to PRAGMA_ADMIN_TEST_PK)")
    .option("--skip-deploy", "Skip HybridDelegator deployment (reuse existing)")
    .option("--skip-funding", "Skip automatic session key funding")
    .option("--new-session", "Force new session key generation (don't reuse)")
    .option("--api-key <key>", "OpenAI API key (or use OPENAI_API_KEY_H2 env var)")
    .option("--quick", "Enable quick mode (yolo - execute without confirmation)")
    .action(async (options) => {
      try {
        // Show dev mode warning
        console.log(chalk.yellow("\n════════════════════════════════════════════════════════"));
        console.log(chalk.yellow("  ⚠️  H2 DEV MODE - Using Direct Private Key"));
        console.log(chalk.yellow("════════════════════════════════════════════════════════\n"));
        console.log(chalk.gray("  This mode bypasses Web3Auth for testing purposes."));
        console.log(chalk.gray("  DO NOT use this in production!\n"));

        // Setup test environment
        console.log(chalk.cyan("🔧 Setting up H2 test environment...\n"));

        const context = await setupH2TestEnvironment({
          privateKey: options.pk as Hex | undefined,
          skipDeploy: options.skipDeploy,
          skipFunding: options.skipFunding,
          newSession: options.newSession,
        });

        // Display test environment info
        console.log(chalk.green("\n✓ Test environment ready!\n"));
        console.log(chalk.cyan("📋 Environment Details:"));
        console.log(chalk.gray("  ├─ Owner:          "), chalk.white(context.rootAccount.address));
        console.log(chalk.gray("  ├─ HybridDelegator:"), chalk.white(context.hybridDelegator));
        console.log(chalk.gray("  └─ Session Key:    "), chalk.white(context.sessionKey.address));
        console.log();

        // Get API key
        const apiKey = options.apiKey || process.env.OPENAI_API_KEY_H2;
        if (!apiKey) {
          console.log(chalk.red("✗ Missing OpenAI API key"));
          console.log(chalk.yellow("\n  Set OPENAI_API_KEY_H2 environment variable or use --api-key flag\n"));
          process.exit(1);
        }

        // Launch H2 REPL
        console.log(chalk.cyan("🚀 Launching H2 REPL...\n"));
        console.log(chalk.gray("─".repeat(60)));
        console.log();

        await runPragmaH2Repl({
          apiKey,
          quickMode: options.quick,
          userAddress: context.hybridDelegator,
          sessionData: context.sessionState,
          web3authBridge: context.bridge, // Use direct PK bridge
          publicClient: context.publicClient, // For balance checks
        });
      } catch (error) {
        console.error(chalk.red("\n✗ Failed to start H2 dev mode:"), (error as Error).message);
        process.exit(1);
      }
    });
}
