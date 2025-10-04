import { Command } from "commander";
import chalk from "chalk";

import { onboardingLogger } from "../utils/logger.js";
import { runOnboard4337 } from "../services/onboarding4337.js";

export const registerOnboard4337 = (program: Command) => {
  program
    .command("onboard:4337")
    .description("Onboard a new user via HybridDelegator (ERC-4337)")
    .option("--mode <mode>", "safe | normal")
    .option("--privy", "Force Privy identity provider for login/signing")
    .option("--web3auth", "Force Web3Auth identity provider for login/signing")
    .option("--calls <count>", "Override the LimitedCalls max redemptions")
    .option("--unlimited-calls", "Disable LimitedCalls enforcement for this delegation")
    .action(async (opts: {
      mode?: string;
      privy?: boolean;
      web3auth?: boolean;
      calls?: string;
      unlimitedCalls?: boolean;
    }) => {
      const modeOption = opts.mode?.toLowerCase();
      if (modeOption && !["safe", "normal"].includes(modeOption)) {
        console.error(chalk.red("Invalid mode. Use 'safe' or 'normal'."));
        process.exit(1);
      }

      if (opts.privy && opts.web3auth) {
        console.error(chalk.red("Choose either --privy or --web3auth (not both)."));
        process.exit(1);
      }

      const callOverride = opts.calls !== undefined ? Number(opts.calls) : undefined;
      if (Number.isNaN(callOverride)) {
        console.error(chalk.red("--calls must be a valid number."));
        process.exit(1);
      }

      if (opts.unlimitedCalls && callOverride !== undefined) {
        console.error(chalk.red("Cannot combine --calls with --unlimited-calls."));
        process.exit(1);
      }

      const identityHint = opts.privy ? "privy" : opts.web3auth ? "web3auth" : undefined;

      onboardingLogger.info({ mode: modeOption ?? "prompt" }, "Starting 4337 onboarding");

      try {
        await runOnboard4337(modeOption as "safe" | "normal" | undefined, identityHint, {
          callLimitOverride: callOverride,
          unlimitedCalls: opts.unlimitedCalls ?? false,
        });
        onboardingLogger.info({ mode: modeOption ?? "prompt" }, "4337 onboarding completed");
      } catch (error) {
        onboardingLogger.error({ err: error }, "4337 onboarding failed");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
};
