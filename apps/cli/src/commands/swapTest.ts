import { Command } from "commander";
import chalk from "chalk";

import { onboardingLogger } from "../utils/logger.js";
import { runSwapTest } from "../services/swapEngine.js";

const MODES = ["safe", "normal"] as const;
type SwapMode = (typeof MODES)[number];

export const registerSwapTest = (program: Command) => {
  program
    .command("swap:test")
    .description("[dev] Provision a HybridDelegator and execute a delegated swap via Monorail aggregator")
    .option("--mode <mode>", "Delegation mode: safe | normal", "safe")
    .action(async ({ mode }: { mode?: string }) => {
      const normalizedMode = (mode ?? "safe").toLowerCase();
      if (!MODES.includes(normalizedMode as SwapMode)) {
        console.error(chalk.red("Invalid mode. Use 'safe' or 'normal'."));
        process.exit(1);
      }

      onboardingLogger.info({ mode: normalizedMode }, "Starting swap test");
      try {
        const result = await runSwapTest(normalizedMode as SwapMode);
        onboardingLogger.info({ mode: normalizedMode, delegator: result.hybridDelegator }, "Swap test completed");
        console.log(chalk.green(`[dev/${normalizedMode}] Swap test completed for ${result.hybridDelegator}`));
        console.log(`  Session key : ${result.sessionKey}`);
        console.log(
          `  Swap       : ${result.amount} ${result.fromToken.symbol ?? result.fromToken.address.slice(0, 6)} -> ${
            result.toToken.symbol ?? result.toToken.address.slice(0, 6)
          }`,
        );
      } catch (error) {
        onboardingLogger.error({ err: error }, "Swap test failed");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
};
