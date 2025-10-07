import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { getAddress } from "viem";

import { loadLatestActiveDelegation } from "../services/delegationArtifacts.js";
import { runOnboard4337 } from "../services/onboarding4337.js";
import type { AllowedToken } from "../services/monorailTokens.js";
import { onboardingLogger } from "../utils/logger.js";

const formatToken = (token: AllowedToken): string => {
  const tags: string[] = [];
  if (token.kind === "native") tags.push("native");
  if (token.kind === "wrappedNative") tags.push("wrapped");
  if (token.categories && token.categories.length > 0) tags.push(...token.categories);
  const suffix = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
  return `${token.symbol ?? token.address} (${token.address})${suffix}`;
};

export const registerDelegationPruneTokens = (program: Command) => {
  program
    .command("delegation:prune-tokens")
    .description("Reissue a delegation after removing selected tokens from the allowlist")
    .option("--delegator <address>", "HybridDelegator to target when multiple exist")
    .action(async ({ delegator }: { delegator?: string }) => {
      try {
        const { artifact } = await loadLatestActiveDelegation(delegator);
        if ((artifact.allowedTokens ?? []).length === 0) {
          console.log(chalk.yellow("Delegation does not have any tokens to prune."));
          return;
        }

        if (artifact.mode === "safe") {
          console.log(
            chalk.yellow("Safe mode delegations lock to a pair and cannot be pruned. Reissue in normal mode if needed."),
          );
          return;
        }

        const tokens = (artifact.allowedTokens ?? []) as AllowedToken[];
        if (tokens.length <= 2) {
          console.log(
            chalk.yellow("Delegation contains two tokens. Add more tokens before pruning or keep the current scope."),
          );
          return;
        }

        const choices = tokens.map((token) => ({
          name: formatToken(token),
          value: token.address,
        }));

        const { removal } = await inquirer.prompt<{ removal: string[] }>([
          {
            type: "checkbox",
            name: "removal",
            message: "Select tokens to remove from the delegation allowlist",
            choices,
          },
        ]);

        if (removal.length === 0) {
          console.log(chalk.green("No tokens selected. Keeping existing delegation."));
          return;
        }

        const nextTokens = tokens.filter(
          (token) => !removal.some((address) => address.toLowerCase() === token.address.toLowerCase()),
        );

        if (nextTokens.length < 2) {
          console.log(chalk.red("At least two tokens must remain in a normal-mode delegation."));
          return;
        }

        console.log(chalk.bold("Pruned delegation scope:"));
        nextTokens.forEach((token) => console.log(`  - ${formatToken(token)}`));

        const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
          {
            type: "confirm",
            name: "confirm",
            message: "Reissue delegation with this reduced token set?",
            default: true,
          },
        ]);

        if (!confirm) {
          console.log(chalk.yellow("Prune aborted."));
          return;
        }

        const delegatorAddress = getAddress(artifact.delegation.delegator as string);
        onboardingLogger.info({ delegator: delegatorAddress, mode: artifact.mode }, "Reissuing delegation after pruning tokens");
        await runOnboard4337(artifact.mode as "safe" | "normal", undefined, {
          expectedDelegator: delegatorAddress,
          overrideAllowedTokens: nextTokens,
          existingAllowedTokens: nextTokens,
          callLimitOverride: artifact.callLimit ?? undefined,
          unlimitedCalls: artifact.callsUnlimited ?? false,
        });
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
};
