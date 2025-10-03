import { Command } from "commander";
import chalk from "chalk";

import { onboardingLogger } from "../utils/logger.js";
import { runOnboard4337Test } from "../services/onboarding4337.js";

export const registerOnboard4337Test = (program: Command) => {
  program
    .command("onboard:4337:test")
    .description("Run HybridDelegator deployment flow with a generated signer for testing")
    .option("--mode <mode>", "Delegation mode: safe, normal, or both", "both")
    .action(async ({ mode }: { mode?: string }) => {
      onboardingLogger.info({}, "Starting 4337 onboarding test");

      try {
        const normalizedMode = (mode ?? "both").toLowerCase();
        if (!["safe", "normal", "both"].includes(normalizedMode)) {
          throw new Error("Invalid mode. Use safe, normal, or both.");
        }

        await runOnboard4337Test(normalizedMode as "safe" | "normal" | "both");
        onboardingLogger.info({}, "4337 onboarding test completed");
        process.exit(0);
      } catch (error) {
        onboardingLogger.error({ err: error }, "4337 onboarding test failed");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
};
