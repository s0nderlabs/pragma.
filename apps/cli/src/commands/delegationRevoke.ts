import { Command } from "commander";
import chalk from "chalk";

import { runRevoke } from "../services/revoke.js";
import { onboardingLogger } from "../utils/logger.js";

export const registerDelegationRevoke = (program: Command) => {
  program
    .command("delegation:revoke")
    .description("Alias for revoke — bumps nonce to invalidate all delegations")
    .option("--mode <mode>", "safe | normal", "safe")
    .action(async ({ mode }: { mode: string }) => {
      const normalized = mode.toLowerCase();
      if (!["safe", "normal"].includes(normalized)) {
        console.error(chalk.red("Invalid mode. Use 'safe' or 'normal'."));
        process.exit(1);
      }

      onboardingLogger.info({ mode: normalized }, "Nonce bump via delegation:revoke");
      try {
        await runRevoke(normalized as "safe" | "normal");
        onboardingLogger.info({ mode: normalized }, "Delegations revoked");
      } catch (error) {
        onboardingLogger.error({ err: error }, "Nonce bump failed");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
};
