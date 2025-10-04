import { Command } from "commander";
import chalk from "chalk";
import { createWalletClient, http, formatEther, formatUnits, parseEther, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import { loadDelegationArtifact, loadLatestActiveDelegation } from "../services/delegationArtifacts.js";
import { createSepoliaPublicClient } from "../services/web3authClients.js";
import { WETH_SEPOLIA } from "../services/onboarding4337.js";
import { ERC20_ABI } from "../services/swapTest.js";

export const registerFundFaucet = (program: Command) => {
  program
    .command("fund:faucet")
    .description("[dev] Send faucet ETH/WETH from PRAGMA_ADMIN_TEST_PK to latest HybridDelegator")
    .option("--artifact <path>", "Path to delegation artifact (defaults to latest active)")
    .option("--delegator <address>", "Specific HybridDelegator when multiple exist")
    .option("--eth <amount>", "ETH amount to send", "0.01")
    .option("--weth <amount>", "WETH amount to transfer", "0.01")
    .action(async ({ artifact: artifactPath, delegator, eth, weth }: { artifact?: string; delegator?: string; eth?: string; weth?: string }) => {
      const adminPk = process.env.PRAGMA_ADMIN_TEST_PK;
      if (!adminPk) {
        console.error(
          chalk.red(
            "PRAGMA_ADMIN_TEST_PK not set. Configure the faucet admin private key in your environment to use this command.",
          ),
        );
        process.exit(1);
      }

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

      const ethAmount = parseEther(eth ?? "0.01");
      const wethAmount = parseEther(weth ?? "0.01");

      const adminAccount = privateKeyToAccount(adminPk as `0x${string}`);
      const publicClient = createSepoliaPublicClient();
      const wallet = createWalletClient({
        chain: sepolia,
        transport: http(process.env.SEPOLIA_RPC_URL),
        account: adminAccount,
      });

      console.log(chalk.bold("Pragma faucet"));
      console.log(`  Admin address : ${adminAccount.address}`);
      console.log(`  Recipient     : ${delegatorAddress}`);
      console.log();

      if (ethAmount > 0n) {
        const tx = await wallet.sendTransaction({ to: delegatorAddress, value: ethAmount });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        console.log(chalk.green(`Sent ${formatEther(ethAmount)} ETH (tx: ${tx})`));
      }

      if (wethAmount > 0n) {
        const tx = await wallet.writeContract({
          address: WETH_SEPOLIA,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [delegatorAddress, wethAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        console.log(chalk.green(`Transferred ${formatEther(wethAmount)} WETH (tx: ${tx})`));
      }

      const ethBalance = await publicClient.getBalance({ address: delegatorAddress });
      const wethBalance = (await publicClient.readContract({
        address: WETH_SEPOLIA,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [delegatorAddress],
      })) as bigint;

      console.log();
      console.log(chalk.bold("Updated balances"));
      console.log(`  ETH : ${formatEther(ethBalance)}`);
      console.log(`  WETH: ${formatUnits(wethBalance, 18)}`);
    });
};
