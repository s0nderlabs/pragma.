import { Command } from "commander";
import chalk from "chalk";

import { loadSwapSession } from "../services/swapArtifacts.js";
import { wrapNativeWithSession, isNativeToken } from "../services/swapEngine.js";

export const registerWrap = (program: Command) => {
  program
    .command("wrap")
    .description("Wrap native MON into WMON using the stored delegation")
    .requiredOption("--amount <mon>", "Amount of native MON to wrap")
    .option("--artifact <path>", "Delegation artifact path (defaults to latest active)")
    .option("--delegator <address>", "HybridDelegator address when multiple artifacts exist")
    .action(
      async ({ amount, artifact: artifactPath, delegator }: { amount: string; artifact?: string; delegator?: string }) => {
        try {
          if (!amount || Number(amount) <= 0) {
            throw new Error("Wrap amount must be greater than zero.");
          }

          const { session, environment, delegatorAddress, allowedTokens } = await loadSwapSession({
            artifactPath,
            delegator,
          });

          const hasNative = allowedTokens.some((token) => isNativeToken(token));
          const hasWrapped = allowedTokens.some((token) => token.kind === "wrappedNative");
          if (!hasNative || !hasWrapped) {
            throw new Error(
              "Delegation must include both native MON and wrapped MON tokens. Reissue the delegation with those assets before wrapping.",
            );
          }

          await wrapNativeWithSession({
            session,
            environment,
            hybridDelegator: delegatorAddress,
            amountInput: amount,
            logPrefix: "[wrap]",
          });
        } catch (error) {
          console.error(chalk.red((error as Error).message));
          process.exit(1);
        }
      },
    );
};
