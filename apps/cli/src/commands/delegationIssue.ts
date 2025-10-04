import { Command } from "commander";
import chalk from "chalk";

import { runOnboard4337 } from "../services/onboarding4337.js";
import { onboardingLogger } from "../utils/logger.js";

export const registerDelegationIssue = (program: Command) => {
  program
    .command("delegation:issue")
    .description("Issue a new delegation (safe | normal) without redeploying the HybridDelegator")
    .option("--mode <mode>", "safe | normal")
    .action(async ({ mode }: { mode?: string }) => {
      const normalized = mode?.toLowerCase();
      if (normalized && !["safe", "normal"].includes(normalized)) {
        console.error(chalk.red("Invalid mode. Use 'safe' or 'normal'."));
        process.exit(1);
      }

      onboardingLogger.info({ mode: normalized ?? "prompt" }, "Issuing delegation via CLI");
      try {
        await runOnboard4337(normalized as "safe" | "normal" | undefined);
      } catch (error) {
        onboardingLogger.error({ err: error }, "Delegation issuance failed");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
};
