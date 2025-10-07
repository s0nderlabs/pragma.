import { Command } from "commander";
import chalk from "chalk";
import { formatUnits } from "viem";

import { loadSwapSession, resolveSwapToken } from "../services/swapArtifacts.js";
import { fetchMonorailQuote } from "../services/monorailPathfinder.js";
import { MONAD_NATIVE_TOKEN_SYMBOL } from "../services/config.js";
import type { AllowedToken } from "../services/monorailTokens.js";

const resolveToken = (input: string, tokens: AllowedToken[]) => resolveSwapToken(input, tokens);

export const registerSwapPreview = (program: Command) => {
  program
    .command("swap:preview")
    .description("Preview a Monorail aggregator quote without executing the swap")
    .requiredOption("--amount <value>", "Amount to swap (source token decimals)")
    .option("--from <token>", "Source token symbol or address (must be in delegation allowlist)")
    .option("--to <token>", "Destination token symbol or address (must be in delegation allowlist)")
    .option("--artifact <path>", "Delegation artifact path (defaults to latest active)")
    .option("--delegator <address>", "HybridDelegator address when multiple artifacts exist")
    .option("--slippage-bps <bps>", "Slippage tolerance basis points", "50")
    .action(async ({
      amount,
      from,
      to,
      artifact: artifactPath,
      delegator,
      slippageBps,
    }: {
      amount: string;
      from?: string;
      to?: string;
      artifact?: string;
      delegator?: string;
      slippageBps?: string;
    }) => {
      try {
        if (!amount || Number(amount) <= 0) {
          throw new Error("Amount must be greater than zero.");
        }

        const slippage = slippageBps ? Number(slippageBps) : 50;
        if (!Number.isFinite(slippage) || slippage <= 0) {
          throw new Error("Slippage must be a positive integer (basis points).");
        }

        const { session, delegatorAddress, allowedTokens } = await loadSwapSession({
          artifactPath,
          delegator,
        });

        if (!from || !to) {
          throw new Error("Both --from and --to tokens are required to preview a swap.");
        }

        const fromToken = resolveToken(from, allowedTokens);
        const toToken = resolveToken(to, allowedTokens);

        if (fromToken.address.toLowerCase() === toToken.address.toLowerCase()) {
          throw new Error("Source and destination tokens must differ.");
        }

        const quote = await fetchMonorailQuote({
          fromToken: fromToken.address,
          toToken: toToken.address,
          amountDecimal: amount,
          sender: delegatorAddress,
          destination: delegatorAddress,
          maxSlippageBps: slippage,
        });

        const amountInDisplay = quote.inputFormatted ?? amount;
        const amountOutDisplay = quote.outputFormatted ?? formatUnits(quote.rawOutput, toToken.decimals);
        const minOutDisplay = quote.minOutputFormatted ?? formatUnits(quote.rawMinOutput, toToken.decimals);

        console.log(chalk.bold("Swap Preview"));
        console.log(
          `${amountInDisplay} ${fromToken.symbol ?? MONAD_NATIVE_TOKEN_SYMBOL ?? "TOKEN"} → ${amountOutDisplay} ${
            toToken.symbol ?? "TOKEN"
          }`,
        );
        console.log(`Quote ID    : ${quote.quoteId}`);
        console.log(`Min output  : ${minOutDisplay} ${toToken.symbol ?? "TOKEN"}`);
        if (quote.compoundImpact) {
          console.log(`Price impact: ${quote.compoundImpact}%`);
        }
        if (quote.optimisation) {
          console.log(`Optimisation: ${quote.optimisation}`);
        }
        if (quote.fees && (quote.fees.protocolBps || quote.fees.feeShareBps)) {
          const protocolFee = quote.fees.protocolAmount
            ? formatUnits(quote.fees.protocolAmount, toToken.decimals)
            : undefined;
          const refFee = quote.fees.feeShareAmount
            ? formatUnits(quote.fees.feeShareAmount, toToken.decimals)
            : undefined;
          console.log(
            `Fees        : protocol ${quote.fees.protocolBps ?? 0} bps${
              protocolFee ? ` (~${protocolFee} ${toToken.symbol ?? "TOKEN"})` : ""
            }${
              quote.fees.feeShareBps
                ? ` · ref ${quote.fees.feeShareBps} bps${
                    refFee ? ` (~${refFee} ${toToken.symbol ?? "TOKEN"})` : ""
                  }`
                : ""
            }`,
          );
        }
        if (quote.gasEstimate) {
          console.log(`Gas estimate: ${quote.gasEstimate} wei`);
        }
        if (quote.routes && quote.routes.length > 0) {
          console.log("Routes:");
          quote.routes.slice(0, 5).forEach((route, index) => {
            const legLabel = `${route.fromSymbol ?? route.from ?? "?"} → ${route.toSymbol ?? route.to ?? "?"}`;
            console.log(`  ${index + 1}. ${legLabel}${route.weightedPriceImpact ? ` (impact ${route.weightedPriceImpact}%)` : ""}`);
            if (route.splits && route.splits.length > 0) {
              route.splits.forEach((split) => {
                const percentValue = split.percentage !== undefined
                  ? split.percentage > 1
                    ? split.percentage
                    : split.percentage * 100
                  : undefined;
                const percent = percentValue !== undefined ? `${percentValue.toFixed(2)}%` : "n/a";
                const fee = split.feeBps !== undefined ? `${split.feeBps} bps` : "n/a";
                console.log(`     - ${split.protocol ?? "Unknown"}: ${percent}, fee ${fee}`);
              });
            }
          });
          if (quote.routes.length > 5) {
            console.log("  …");
          }
        }
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
};
