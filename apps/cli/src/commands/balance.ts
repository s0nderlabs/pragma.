import chalk from "chalk";
import { Command } from "commander";
import { getAddress } from "viem";

import { loadLatestActiveDelegation } from "../services/delegationArtifacts.js";
import {
  fetchWalletBalances,
  fetchPortfolioValue,
  normalizeBalances,
  formatTokenDisplay,
} from "../services/monorailBalances.js";

interface BalanceOptions {
  delegator?: string;
  address?: string;
  json?: boolean;
}

export const registerBalance = (program: Command) => {
  program
    .command("balance")
    .description("Show token balances and portfolio value for a delegation or address")
    .option("--delegator <address>", "HybridDelegator to inspect (default: latest active)")
    .option("--address <address>", "Specific address to query instead of a delegation")
    .option("--json", "Output raw JSON response")
    .action(async ({ delegator, address, json }: BalanceOptions) => {
      let targetAddress: `0x${string}`;
      let source = "delegator";

      if (address) {
        targetAddress = getAddress(address);
        source = "address";
      } else {
        const entry = await loadLatestActiveDelegation(delegator);
        targetAddress = getAddress(entry.artifact.delegation.delegator);
      }

      try {
        const [rawBalances, portfolio] = await Promise.all([
          fetchWalletBalances(targetAddress),
          fetchPortfolioValue(targetAddress),
        ]);

        if (json) {
          console.log(
            JSON.stringify(
              {
                address: targetAddress,
                source,
                balances: rawBalances,
                portfolio,
              },
              null,
              2,
            ),
          );
          return;
        }

        const balances = normalizeBalances(rawBalances);
        console.log(chalk.bold(`Balances for ${targetAddress} (${source})`));
        for (const balance of balances) {
          console.log(`  • ${formatTokenDisplay(balance)}`);
        }

        if (portfolio?.value) {
          console.log();
          console.log(chalk.cyan(`Total portfolio value: $${portfolio.value}`));
        }
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
};
