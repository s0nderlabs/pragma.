import { Command } from "commander";
import chalk from "chalk";
import { Address, getAddress } from "viem";

import { runOnboard4337, type AllowedToken } from "../services/onboarding4337.js";
import { loadLatestActiveDelegation } from "../services/delegationArtifacts.js";
import { onboardingLogger } from "../utils/logger.js";

export const registerDelegationUpdateTokens = (program: Command) => {
  program
    .command("delegation:update-tokens")
    .description("Reissue the delegation to update its token allowlist")
    .option("--delegator <address>", "HybridDelegator to target")
    .option("--mode <mode>", "safe | normal")
    .option("--calls <count>", "Override LimitedCalls maximum")
    .option("--unlimited-calls", "Disable LimitedCalls enforcement")
    .action(async ({
      delegator,
      mode,
      calls,
      unlimitedCalls,
    }: {
      delegator?: string;
      mode?: string;
      calls?: string;
      unlimitedCalls?: boolean;
    }) => {
      let normalizedMode = mode?.toLowerCase();
      if (normalizedMode && !["safe", "normal"].includes(normalizedMode)) {
        console.error(chalk.red("Invalid mode. Use 'safe' or 'normal'."));
        process.exit(1);
      }

      let expectedDelegator: Address | undefined;
      if (delegator) {
        try {
          expectedDelegator = getAddress(delegator);
        } catch (error) {
          console.error(chalk.red(`Invalid delegator address: ${(error as Error).message}`));
          process.exit(1);
        }
      }

      let preservedTokens: AllowedToken[] | undefined;
      if (expectedDelegator) {
        try {
          const { artifact } = await loadLatestActiveDelegation(expectedDelegator);
          normalizedMode = normalizedMode ?? artifact.mode;
          preservedTokens = artifact.allowedTokens;
        } catch (error) {
          onboardingLogger.warn({ err: error }, "Unable to load existing delegation for token preservation");
        }
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

      onboardingLogger.info(
        { delegator: expectedDelegator ?? "prompt", mode: normalizedMode ?? "prompt" },
        "Reissuing delegation for updated token allowlist",
      );

      try {
        await runOnboard4337(normalizedMode as "safe" | "normal" | undefined, undefined, {
          expectedDelegator,
          callLimitOverride: callOverride,
          unlimitedCalls: unlimitedCalls ?? false,
          existingAllowedTokens: preservedTokens,
        });
      } catch (error) {
        onboardingLogger.error({ err: error }, "Token update delegation flow failed");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
};
