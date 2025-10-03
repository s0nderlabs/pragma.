import { Command } from "commander";
import chalk from "chalk";

import { onboardingLogger } from "../utils/logger.js";
import { runOnboard4337 } from "../services/onboarding4337.js";

export const registerOnboard4337 = (program: Command) => {
  program
    .command("onboard:4337")
    .description("Onboard a new user via Web3Auth + HybridDelegator (ERC-4337)")
    .option("--mode <mode>", "safe | normal")
    .action(async (opts: { mode?: string }) => {
      const modeOption = opts.mode?.toLowerCase();
      if (modeOption && !["safe", "normal"].includes(modeOption)) {
        console.error(chalk.red("Invalid mode. Use 'safe' or 'normal'."));
        process.exit(1);
      }

      onboardingLogger.info({ mode: modeOption ?? "prompt" }, "Starting 4337 onboarding");

      try {
        await runOnboard4337(modeOption as "safe" | "normal" | undefined);
        onboardingLogger.info({ mode: modeOption ?? "prompt" }, "4337 onboarding completed");
      } catch (error) {
        onboardingLogger.error({ err: error }, "4337 onboarding failed");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
};
