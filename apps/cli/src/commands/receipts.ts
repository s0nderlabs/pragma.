import { Command } from "commander";
import chalk from "chalk";

export const registerReceipts = (program: Command) => {
  program
    .command("receipts:list")
    .description("List stored receipts (coming soon)")
    .action(() => {
      console.log(chalk.yellow("Receipt storage is not implemented yet."));
      console.log("Once swap execution is live, receipts will be stored under ~/.pragma/receipts.");
    });

  program
    .command("receipts:show <txHash>")
    .description("Show a stored receipt by transaction hash (coming soon)")
    .action((txHash: string) => {
      console.log(chalk.yellow(`Receipt lookup for ${txHash} is not available yet.`));
      console.log("Use `pragma receipts:list` to monitor updates in a future release.");
    });
};
