import { Command } from "commander";
import chalk from "chalk";

import { onboardingLogger } from "../utils/logger.js";
import { runSwapTest } from "../services/swapTest.js";

const MODES = ["safe", "normal"] as const;
type SwapMode = (typeof MODES)[number];

export const registerSwapTest = (program: Command) => {
  program
    .command("swap:test")
    .description("Provision a HybridDelegator + session key and execute a delegated swap test")
    .option("--mode <mode>", "Delegation mode: safe | normal", "safe")
    .action(async ({ mode }: { mode?: string }) => {
      const normalizedMode = (mode ?? "safe").toLowerCase();
      if (!MODES.includes(normalizedMode as SwapMode)) {
        console.error(chalk.red("Invalid mode. Use 'safe' or 'normal'."));
        process.exit(1);
      }

      onboardingLogger.info({ mode: normalizedMode }, "Starting swap test");
      try {
        await runSwapTest(normalizedMode as SwapMode);
        onboardingLogger.info({ mode: normalizedMode }, "Swap test completed");
      } catch (error) {
        onboardingLogger.error({ err: error }, "Swap test failed");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
};
