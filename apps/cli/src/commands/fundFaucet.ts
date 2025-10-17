import { Command } from "commander";
import chalk from "chalk";
import { createWalletClient, http, formatEther, formatUnits, parseEther, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { loadDelegationArtifact, loadLatestActiveDelegation } from "../services/delegationArtifacts.js";
import { createMonadPublicClient, monadChain } from "../services/web3authClients.js";
import { loadAllowedTokens } from "../services/monorailTokens.js";
import { ERC20_ABI } from "@pragma/core";
import { MONAD_EXECUTION_RPC_URL } from "../services/config.js";

export const registerFundFaucet = (program: Command) => {
  program
    .command("fund:faucet")
    .description("[dev] Send faucet MON/WMON from PRAGMA_ADMIN_TEST_PK to latest HybridDelegator")
    .option("--artifact <path>", "Path to delegation artifact (defaults to latest active)")
    .option("--delegator <address>", "Specific HybridDelegator when multiple exist")
    .option("--mon <amount>", "MON amount to send", "0.01")
    .option("--wmon <amount>", "WMON amount to transfer", "0.01")
    .action(async ({ artifact: artifactPath, delegator, mon, wmon }: { artifact?: string; delegator?: string; mon?: string; wmon?: string }) => {
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
        : await loadLatestActiveDelegation(normalizedDelegator, undefined, "swap");
      const artifact = entry.artifact;
      const delegatorAddress = getAddress(artifact.delegation.delegator);

      if (normalizedDelegator && delegatorAddress !== normalizedDelegator) {
        console.error(chalk.red(`Delegation artifact does not match requested delegator ${normalizedDelegator}.`));
        process.exit(1);
      }

      const monAmount = parseEther(mon ?? "0.01");
      const wmonAmount = parseEther(wmon ?? "0.01");

      const adminAccount = privateKeyToAccount(adminPk as `0x${string}`);
      const publicClient = createMonadPublicClient();
      const wallet = createWalletClient({
        chain: monadChain,
        transport: http(MONAD_EXECUTION_RPC_URL),
        account: adminAccount,
      });

      console.log(chalk.bold("Pragma faucet"));
      console.log(`  Admin address : ${adminAccount.address}`);
      console.log(`  Recipient     : ${delegatorAddress}`);
      console.log();

      if (monAmount > 0n) {
        const tx = await wallet.sendTransaction({ to: delegatorAddress, value: monAmount });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        console.log(chalk.green(`Sent ${formatEther(monAmount)} MON (tx: ${tx})`));
      }

      const allowlist = await loadAllowedTokens();
      const wrappedToken = allowlist.find((token) => token.kind === "wrappedNative");

      if (wmonAmount > 0n && wrappedToken) {
        const tx = await wallet.writeContract({
          address: wrappedToken.address,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [delegatorAddress, wmonAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        console.log(
          chalk.green(
            `Transferred ${formatUnits(wmonAmount, wrappedToken.decimals ?? 18)} ${
              wrappedToken.symbol ?? "WMON"
            } (tx: ${tx})`,
          ),
        );
      }

      const monBalance = await publicClient.getBalance({ address: delegatorAddress });
      const wrappedBalance = wrappedToken
        ? ((await publicClient.readContract({
            address: wrappedToken.address,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [delegatorAddress],
          })) as bigint)
        : 0n;

      console.log();
      console.log(chalk.bold("Updated balances"));
      console.log(`  MON : ${formatEther(monBalance)}`);
      if (wrappedToken) {
        console.log(
          `  ${wrappedToken.symbol ?? "WMON"}: ${formatUnits(wrappedBalance, wrappedToken.decimals ?? 18)}`,
        );
      }
    });
};
