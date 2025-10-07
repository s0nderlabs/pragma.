import { Command } from "commander";
import chalk from "chalk";

import { loadSwapSession } from "../services/swapArtifacts.js";
import { unwrapNativeWithSession } from "../services/swapEngine.js";
import { MONAD_WRAPPED_TOKEN_SYMBOL } from "../services/config.js";

export const registerUnwrap = (program: Command) => {
  program
    .command("unwrap")
    .description("Unwrap WMON back into native MON using the stored delegation")
    .requiredOption("--amount <wmon>", "Amount of WMON to unwrap")
    .option("--artifact <path>", "Delegation artifact path (defaults to latest active)")
    .option("--delegator <address>", "HybridDelegator address when multiple artifacts exist")
    .action(
      async ({ amount, artifact: artifactPath, delegator }: { amount: string; artifact?: string; delegator?: string }) => {
        try {
          if (!amount || Number(amount) <= 0) {
            throw new Error("Unwrap amount must be greater than zero.");
          }

          const { session, environment, delegatorAddress, allowedTokens } = await loadSwapSession({
            artifactPath,
            delegator,
          });

          const hasWrapped = allowedTokens.some((token) => token.kind === "wrappedNative");
          if (!hasWrapped) {
            throw new Error(
              `Delegation must include ${MONAD_WRAPPED_TOKEN_SYMBOL ?? "WMON"}. Reissue the delegation with wrapped native support before unwrapping.`,
            );
          }

          await unwrapNativeWithSession({
            session,
            environment,
            hybridDelegator: delegatorAddress,
            amountInput: amount,
            logPrefix: "[unwrap]",
          });
        } catch (error) {
          console.error(chalk.red((error as Error).message));
          process.exit(1);
        }
      },
    );
};
