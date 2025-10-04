import { Command } from "commander";
import chalk from "chalk";
import { getAddress } from "viem";

import { onboardingLogger } from "../utils/logger.js";
import { RunOnboardOptions, runOnboard4337 } from "../services/onboarding4337.js";

export const registerSessionReplace = (program: Command) => {
  program
    .command("replace")
    .description("Rotate the stored session key for a HybridDelegator and issue a fresh delegation")
    .requiredOption("--delegator <address>", "HybridDelegator address that owns the session key")
    .option("--mode <mode>", "safe | normal")
    .option("--privy", "Force Privy identity provider for login/signing")
    .option("--web3auth", "Force Web3Auth identity provider for login/signing")
    .action(async (opts: { delegator: string; mode?: string; privy?: boolean; web3auth?: boolean }) => {
      const normalizedDelegator = getAddress(opts.delegator);

      const modeOption = opts.mode?.toLowerCase();
      if (modeOption && !["safe", "normal"].includes(modeOption)) {
        console.error(chalk.red("Invalid mode. Use 'safe' or 'normal'."));
        process.exit(1);
      }

      if (opts.privy && opts.web3auth) {
        console.error(chalk.red("Choose either --privy or --web3auth (not both)."));
        process.exit(1);
      }

      const identityHint = opts.privy ? "privy" : opts.web3auth ? "web3auth" : undefined;

      const runOptions: RunOnboardOptions = {
        rotateSessionKey: true,
        expectedDelegator: normalizedDelegator,
      };

      onboardingLogger.info(
        { delegator: normalizedDelegator, mode: modeOption ?? "prompt" },
        "Rotating session key and reissuing delegation",
      );

      try {
        await runOnboard4337(modeOption as "safe" | "normal" | undefined, identityHint, runOptions);
        onboardingLogger.info(
          { delegator: normalizedDelegator, mode: modeOption ?? "prompt" },
          "Session key rotation completed",
        );
      } catch (error) {
        onboardingLogger.error({ err: error, delegator: normalizedDelegator }, "Session key rotation failed");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
};
