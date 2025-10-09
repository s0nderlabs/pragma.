import { Command } from "commander";
import chalk from "chalk";

import { loadSwapSession, resolveSwapToken } from "../services/swapArtifacts.js";
import { executeSwapWithSession, SwapToken, isNativeToken } from "../services/swapEngine.js";

const pickDefaultTokenPair = (tokens: SwapToken[]): { from: SwapToken; to: SwapToken } => {
  if (tokens.length < 2) {
    throw new Error("Delegation allowlist must include at least two tokens to execute a swap.");
  }

  const from = tokens.find((token) => isNativeToken(token)) ?? tokens[0];
  const to = tokens.find((token) => token.address.toLowerCase() !== from.address.toLowerCase());
  if (!to) {
    throw new Error("Unable to pick a distinct destination token from the delegation allowlist.");
  }

  return { from, to };
};

export const registerSwapReuse = (program: Command) => {
  program
    .command("swap:test:reuse")
    .description(
      "[dev] Execute a delegated Monorail swap using an existing stored delegation (no redeploy/funding assistance)",
    )
    .option("--artifact <path>", "Delegation artifact path (defaults to latest active)")
    .option("--delegator <address>", "HybridDelegator address when multiple artifacts exist")
    .option("--amount <value>", "Amount to swap (defaults to 0.01 in source token decimals)", "0.01")
    .option("--from <token>", "Source token symbol or address (must be in allowlist)")
    .option("--to <token>", "Destination token symbol or address (must be in allowlist)")
    .option("--slippage-bps <bps>", "Slippage tolerance basis points", "50")
    .action(
      async ({
        artifact: artifactPath,
        delegator,
        amount,
        from,
        to,
        slippageBps,
      }: {
        artifact?: string;
        delegator?: string;
        amount?: string;
        from?: string;
        to?: string;
        slippageBps?: string;
      }) => {
        try {
          const swapAmount = amount ?? "0.01";
          if (Number(swapAmount) <= 0) {
            throw new Error("Swap amount must be greater than zero.");
          }

          const slippage = slippageBps ? Number(slippageBps) : 50;
          if (!Number.isFinite(slippage) || slippage <= 0) {
            throw new Error("Slippage must be a positive integer (basis points).");
          }

          const {
            session,
            environment,
            delegatorAddress,
            allowedTokens,
            artifactPath: resolvedArtifactPath,
          } = await loadSwapSession({
            artifactPath,
            delegator,
          });

          const tokenList = allowedTokens.map((token) => token as SwapToken);
          const defaults = pickDefaultTokenPair(tokenList);

          const fromToken = from ? (resolveSwapToken(from, allowedTokens) as SwapToken) : defaults.from;
          const toToken = to ? (resolveSwapToken(to, allowedTokens) as SwapToken) : defaults.to;

          if (fromToken.address.toLowerCase() === toToken.address.toLowerCase()) {
            throw new Error("Source and destination tokens must differ.");
          }

          const result = await executeSwapWithSession({
            session,
            environment,
            hybridDelegator: delegatorAddress,
            intent: { from: fromToken, to: toToken },
            amountInput: swapAmount,
            slippageBps: slippage,
            logPrefix: "[dev/reuse]",
            artifactPath: resolvedArtifactPath,
          });

          const { quote } = result;
          if (quote.routes && quote.routes.length > 0) {
            console.log(chalk.gray("  Route preview:"));
            quote.routes.slice(0, 3).forEach((route) => {
              console.log(
                chalk.gray(
                  `    - ${route.fromSymbol ?? route.from ?? "?"} -> ${route.toSymbol ?? route.to ?? "?"}`,
                ),
              );
            });
          }
        } catch (error) {
          console.error(chalk.red((error as Error).message));
          process.exit(1);
        }
      },
    );
};
