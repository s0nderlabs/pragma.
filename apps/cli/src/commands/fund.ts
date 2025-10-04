import { Command } from "commander";
import chalk from "chalk";

import { loadDelegationArtifact, loadLatestActiveDelegation } from "../services/delegationArtifacts.js";
import { createSepoliaPublicClient } from "../services/web3authClients.js";
import { formatEther, parseEther, getAddress } from "viem";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const registerFund = (program: Command) => {
  program
    .command("fund")
    .description("Show funding instructions for the HybridDelegator and optionally watch balance")
    .option("--artifact <path>", "Path to delegation artifact (defaults to latest active)")
    .option("--delegator <address>", "Specific HybridDelegator when multiple exist")
    .option("--target <eth>", "Target ETH balance to wait for", "0.02")
    .option("--interval <seconds>", "Polling interval when watching", "10")
    .option("--watch", "Keep polling until balance >= target", false)
    .action(async ({ artifact: artifactPath, delegator, target, interval, watch }: { artifact?: string; delegator?: string; target?: string; interval?: string; watch?: boolean }) => {
      const normalizedDelegator = delegator ? getAddress(delegator) : undefined;
      const entry = artifactPath
        ? await loadDelegationArtifact(artifactPath)
        : await loadLatestActiveDelegation(normalizedDelegator);
      const artifact = entry.artifact;
      const delegatorAddress = getAddress(artifact.delegation.delegator);

      if (normalizedDelegator && delegatorAddress !== normalizedDelegator) {
        console.error(chalk.red(`Delegation artifact does not match requested delegator ${normalizedDelegator}.`));
        process.exit(1);
      }

      const targetEth = Number(target ?? "0.02");
      if (Number.isNaN(targetEth) || targetEth <= 0) {
        console.error(chalk.red("Invalid target amount. Provide a positive number."));
        process.exit(1);
      }

      const pollInterval = Number(interval ?? "10");
      if (Number.isNaN(pollInterval) || pollInterval <= 0) {
        console.error(chalk.red("Invalid polling interval. Provide a positive number."));
        process.exit(1);
      }

      console.log(chalk.bold("Funding Instructions"));
      console.log(`  HybridDelegator address : ${delegatorAddress}`);
      console.log(`  Suggested buffer        : ${targetEth} ETH`);
      console.log();
      console.log("Send ETH to the address above to cover future UserOperations.");
      console.log("When the transaction confirms, rerun \`pragma status\` to verify balances.\n");

      const publicClient = createSepoliaPublicClient();
      const targetWei = parseEther(targetEth.toString());

      const checkBalance = async () => {
        try {
          const balance = await publicClient.getBalance({ address: delegatorAddress });
          console.log(`Current balance: ${formatEther(balance)} ETH`);
          return balance;
        } catch (error) {
          console.log(chalk.yellow(`Failed to fetch balance: ${(error as Error).message}`));
          return 0n;
        }
      };

      const current = await checkBalance();
      if (!watch) {
        return;
      }

      if (current >= targetWei) {
        console.log(chalk.green("Target reached."));
        return;
      }

      console.log(chalk.blue(`Watching balance every ${pollInterval} seconds... (Ctrl+C to stop)`));
      while (true) {
        await sleep(pollInterval * 1000);
        const balance = await checkBalance();
        if (balance >= targetWei) {
          console.log(chalk.green("Target reached."));
          break;
        }
      }
    });
};
