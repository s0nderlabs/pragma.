import { Command } from "commander";
import chalk from "chalk";

import { runOnboard4337 } from "../services/onboarding4337.js";
import { onboardingLogger } from "../utils/logger.js";

export const registerDelegationIssue = (program: Command) => {
  program
    .command("delegation:issue")
    .description("Issue a new delegation (safe | normal) without redeploying the HybridDelegator")
    .option("--mode <mode>", "safe | normal")
    .option("--calls <count>", "Override the LimitedCalls max redemptions")
    .option("--unlimited-calls", "Disable LimitedCalls enforcement for this delegation")
    .action(async ({ mode, calls, unlimitedCalls }: { mode?: string; calls?: string; unlimitedCalls?: boolean }) => {
      const normalized = mode?.toLowerCase();
      if (normalized && !["safe", "normal"].includes(normalized)) {
        console.error(chalk.red("Invalid mode. Use 'safe' or 'normal'."));
        process.exit(1);
      }

      const callOverride = calls !== undefined ? Number(calls) : undefined;
      if (Number.isNaN(callOverride)) {
        console.error(chalk.red("--calls must be a valid number."));
        process.exit(1);
      }

      if (unlimitedCalls && callOverride !== undefined) {
        console.error(chalk.red("Cannot combine --calls with --unlimited-calls."));
        process.exit(1);
      }

      onboardingLogger.info({ mode: normalized ?? "prompt" }, "Issuing delegation via CLI");
      try {
        await runOnboard4337(normalized as "safe" | "normal" | undefined, undefined, {
          callLimitOverride: callOverride,
          unlimitedCalls: unlimitedCalls ?? false,
        });
      } catch (error) {
        onboardingLogger.error({ err: error }, "Delegation issuance failed");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
};
