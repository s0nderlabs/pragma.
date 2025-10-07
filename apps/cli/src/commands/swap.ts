import { Command } from "commander";
import chalk from "chalk";

import { MONAD_NATIVE_TOKEN_SYMBOL } from "../services/config.js";
import type { AllowedToken } from "../services/monorailTokens.js";
import { executeSwapWithSession, SwapIntent, SwapToken, isNativeToken } from "../services/swapEngine.js";
import { formatUnits } from "viem";
import { loadSwapSession, resolveSwapToken } from "../services/swapArtifacts.js";

const DEFAULT_SLIPPAGE_BPS = 50;

const resolveToken = (input: string, tokens: AllowedToken[]): SwapToken => resolveSwapToken(input, tokens) as SwapToken;

export const registerSwap = (program: Command) => {
  program
    .command("swap")
    .description("Execute a delegated swap using stored session permissions (Monorail aggregator)")
    .requiredOption("--amount <value>", "Amount to swap (interpreted in the source token decimals)")
    .option("--from <token>", "Source token symbol or address (must be in delegation allowlist)")
    .option("--to <token>", "Destination token symbol or address (must be in delegation allowlist)")
    .option("--artifact <path>", "Delegation artifact path (defaults to latest active)")
    .option("--delegator <address>", "HybridDelegator address when multiple artifacts exist")
    .option(
      "--slippage-bps <bps>",
      `Slippage tolerance in basis points (default ${DEFAULT_SLIPPAGE_BPS} = 0.50%)`,
    )
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
        amount: string;
        from?: string;
        to?: string;
        slippageBps?: string;
      }) => {
        try {
          if (!amount || Number(amount) <= 0) {
            throw new Error("Swap amount must be greater than zero.");
          }

          const slippage = slippageBps ? Number(slippageBps) : DEFAULT_SLIPPAGE_BPS;
          if (!Number.isFinite(slippage) || slippage <= 0) {
            throw new Error("Slippage must be a positive integer (basis points).");
          }

          const { session, environment, delegatorAddress, allowedTokens } = await loadSwapSession({
            artifactPath,
            delegator,
          });

          if (allowedTokens.length < 2 && !(session.callsUnlimited ?? false)) {
            console.log(
              chalk.yellow(
                "Delegation allowlist has fewer than two tokens. Use `pragma delegation:update-tokens` to append assets before swapping.",
              ),
            );
          }

          if (!from || !to) {
            throw new Error(
              "Both --from and --to tokens are required. Consult `pragma delegation:list` to review allowed tokens.",
            );
          }

          const fromToken = resolveToken(from, allowedTokens);
          const toToken = resolveToken(to, allowedTokens);

          if (fromToken.address.toLowerCase() === toToken.address.toLowerCase()) {
            throw new Error("Source and destination tokens must differ.");
          }

          const intent: SwapIntent = {
            from: fromToken,
            to: toToken,
          };

          const logPrefix = `[swap ${fromToken.symbol ?? MONAD_NATIVE_TOKEN_SYMBOL ?? "token"}->${
            toToken.symbol ?? "token"
          }]`;

          const result = await executeSwapWithSession({
            session,
            environment,
            hybridDelegator: delegatorAddress,
            intent,
            amountInput: amount,
            slippageBps: slippage,
            logPrefix,
          });

          const { quote } = result;
          if (quote.fees && (quote.fees.protocolBps || quote.fees.feeShareBps)) {
            const protocolFee = quote.fees.protocolAmount
              ? formatUnits(quote.fees.protocolAmount, toToken.decimals)
              : undefined;
            const refFee = quote.fees.feeShareAmount
              ? formatUnits(quote.fees.feeShareAmount, toToken.decimals)
              : undefined;

            console.log(
              chalk.gray(
                `  Fees: protocol ${quote.fees.protocolBps ?? 0} bps${
                  protocolFee ? ` (~${protocolFee} ${toToken.symbol ?? "TOKEN"})` : ""
                }${
                  quote.fees.feeShareBps
                    ? ` · ref ${quote.fees.feeShareBps} bps${
                        refFee ? ` (~${refFee} ${toToken.symbol ?? "TOKEN"})` : ""
                      }`
                    : ""
                }`,
              ),
            );
          }

          if (quote.compoundImpact) {
            console.log(chalk.gray(`  Price impact: ${quote.compoundImpact}%`));
          }

          if (quote.routes && quote.routes.length > 0) {
            console.log(chalk.gray("  Route breakdown:"));
            quote.routes.slice(0, 3).forEach((route, index) => {
              const legLabel = `${route.fromSymbol ?? route.from ?? "?"} -> ${route.toSymbol ?? route.to ?? "?"}`;
              console.log(chalk.gray(`    ${index + 1}. ${legLabel}`));
              if (route.splits && route.splits.length > 0) {
                route.splits.forEach((split) => {
                  const percentValue = split.percentage !== undefined
                    ? split.percentage > 1
                      ? split.percentage
                      : split.percentage * 100
                    : undefined;
                  const percent = percentValue !== undefined ? `${percentValue.toFixed(2)}%` : "n/a";
                  const fee = split.feeBps !== undefined ? `${split.feeBps} bps` : "n/a";
                  console.log(chalk.gray(`       - ${split.protocol ?? "Unknown"}: ${percent}, fee ${fee}`));
                });
              }
            });
            if (quote.routes.length > 3) {
              console.log(chalk.gray("    …"));
            }
          }
        } catch (error) {
          console.error(chalk.red((error as Error).message));
          process.exit(1);
        }
      },
    );
};
