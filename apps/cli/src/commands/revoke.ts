import { Command } from "commander";
import chalk from "chalk";

import { onboardingLogger } from "../utils/logger.js";
import { runRevoke } from "../services/revoke.js";

export const registerRevoke = (program: Command) => {
  program
    .command("revoke")
    .description("Revoke all delegations by bumping nonce")
    .option("--mode <mode>", "safe | normal", "safe")
    .action(async (opts: { mode: string }) => {
      const mode = opts.mode.toLowerCase();
      if (!["safe", "normal"].includes(mode)) {
        console.error(chalk.red("Invalid mode. Use 'safe' or 'normal'."));
        process.exit(1);
      }

      onboardingLogger.info({ mode }, "Revoking delegations via nonce bump");

      try {
        await runRevoke(mode as "safe" | "normal");
        onboardingLogger.info({ mode }, "Delegations revoked");
      } catch (error) {
        onboardingLogger.error({ err: error }, "Nonce bump failed");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
};
