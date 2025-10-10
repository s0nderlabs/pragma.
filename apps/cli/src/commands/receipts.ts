import { Command } from "commander";
import chalk from "chalk";
import { formatUnits } from "viem";

import { listReceipts, findReceiptByTxHash } from "../services/receiptStore.js";

const formatAmount = (amountWei?: string, decimals?: number) => {
  if (!amountWei || decimals === undefined) return "-";
  try {
    return formatUnits(BigInt(amountWei), decimals);
  } catch {
    return amountWei;
  }
};

export const registerReceipts = (program: Command) => {
  program
    .command("receipts:list")
    .description("List stored swap receipts")
    .option("--limit <count>", "Number of receipts to display", "10")
    .action(async ({ limit }: { limit: string }) => {
      const take = Number.parseInt(limit, 10);
      const receipts = await listReceipts(undefined, Number.isFinite(take) && take > 0 ? take : 10);
      if (receipts.length === 0) {
        console.log(chalk.gray("No receipts stored yet."));
        return;
      }

      receipts.forEach(({ record }) => {
        const timestamp = new Date(record.executedAt ?? record.createdAt).toISOString();
        const status = record.status === "success" ? chalk.green("success") : chalk.red("failed");
        const amountIn = formatAmount(record.amountInWei, record.tokenIn.decimals);
        const amountOut = formatAmount(record.amountOutWei, record.tokenOut.decimals);
        const summary = record.summary || `${amountIn} ${record.tokenIn.symbol ?? record.tokenIn.address.slice(0, 6)} → ${amountOut} ${record.tokenOut.symbol ?? record.tokenOut.address.slice(0, 6)}`;
        console.log(`${timestamp} · ${status} · ${summary}`);
        if (record.txHash) {
          console.log(chalk.gray(`  tx: ${record.txHash}`));
        }
        if (record.planHash) {
          console.log(chalk.gray(`  plan: ${record.planHash}`));
        }
      });
    });

  program
    .command("receipts:show <txHash>")
    .description("Show a stored receipt by transaction hash")
    .option("--json", "Print raw JSON output")
    .action(async (txHash: string, options: { json?: boolean }) => {
      const receipt = await findReceiptByTxHash(txHash);
      if (!receipt) {
        console.log(chalk.red(`No receipt found for transaction ${txHash}.`));
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(receipt.record, null, 2));
        return;
      }

      const { record } = receipt;
      console.log(chalk.bold(`Receipt for ${record.txHash ?? "unsubmitted plan"}`));
      console.log(`Status    : ${record.status}`);
      console.log(`Delegator : ${record.delegator}`);
      console.log(`Session   : ${record.sessionKey}`);
      console.log(`Chain     : ${record.chainId}`);
      console.log(`Plan Hash : ${record.planHash ?? "n/a"}`);
      console.log(`Quote ID  : ${record.quoteId ?? "n/a"}`);
      console.log(`Summary   : ${record.summary}`);
      if (record.amountOutWei) {
        console.log(
          `Amount    : ${formatAmount(record.amountInWei, record.tokenIn.decimals)} ${record.tokenIn.symbol ?? record.tokenIn.address.slice(0, 6)} -> ${formatAmount(record.amountOutWei, record.tokenOut.decimals)} ${record.tokenOut.symbol ?? record.tokenOut.address.slice(0, 6)}`,
        );
      } else {
        console.log(
          `Amount    : ${formatAmount(record.amountInWei, record.tokenIn.decimals)} ${record.tokenIn.symbol ?? record.tokenIn.address.slice(0, 6)} -> (failed)`,
        );
      }
      if (record.error) {
        console.log(chalk.red(`Error     : ${record.error.code} — ${record.error.message}`));
      }
    });
};
