import { Command } from "commander";
import chalk from "chalk";

import { listDelegationArtifacts, isDelegationExpired } from "../services/delegationArtifacts.js";
import { formatEther, formatUnits, getAddress } from "viem";
import { createSepoliaPublicClient } from "../services/web3authClients.js";
import { WETH_SEPOLIA } from "../services/onboarding4337.js";

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const registerDelegationList = (program: Command) => {
  program
    .command("delegation:list")
    .description("List stored delegation artifacts under ~/.pragma/test-delegations")
    .option("--delegator <address>", "Filter by HybridDelegator address")
    .action(async ({ delegator }: { delegator?: string }) => {
      const normalizedDelegator = delegator ? getAddress(delegator) : undefined;
      const items = await listDelegationArtifacts(normalizedDelegator);
      if (items.length === 0) {
        console.log(chalk.yellow("No delegation artifacts found."));
        console.log("Run `pragma onboard:4337` to issue the first delegation.");
        return;
      }

      const publicClient = createSepoliaPublicClient();

      for (const { artifact, filePath } of items) {
        const expiryNumber = Number(artifact.expiresAt);
        const hasExpiry = Number.isFinite(expiryNumber) && expiryNumber > 0;
        const ttl = hasExpiry ? expiryNumber - Math.floor(Date.now() / 1000) : undefined;
        const expired = hasExpiry ? isDelegationExpired(artifact) : false;

        let ethBalance: string | undefined;
        let wethBalance: string | undefined;
        try {
          const balance = await publicClient.getBalance({ address: artifact.delegation.delegator });
          ethBalance = `${formatEther(balance)} ETH`;
        } catch {}
        try {
          const amount = (await publicClient.readContract({
            address: WETH_SEPOLIA,
            abi: ERC20_BALANCE_ABI,
            functionName: "balanceOf",
            args: [artifact.delegation.delegator],
          })) as bigint;
          if (amount > 0n) {
            wethBalance = `${formatUnits(amount, 18)} WETH`;
          }
        } catch {}

        const delegatorAddress = (() => {
          try {
            return getAddress(artifact.delegation.delegator);
          } catch {
            return artifact.delegation.delegator;
          }
        })();

        if (normalizedDelegator && delegatorAddress.toLowerCase() !== normalizedDelegator.toLowerCase()) {
          continue;
        }

        console.log(chalk.bold(filePath));
        console.log(`  Mode        : ${artifact.mode}`);
        console.log(`  Delegator   : ${delegatorAddress}`);
        console.log(`  Session key : ${artifact.sessionKeyAddress}`);
        console.log(`  Session secret: ${artifact.sessionKeyPrivateKey}`);
        if (hasExpiry && ttl !== undefined) {
          try {
            const iso = new Date(expiryNumber * 1000).toISOString();
            console.log(
              `  Expires at  : ${iso} (${expired ? chalk.red("expired") : chalk.green(`${Math.max(ttl, 0)}s remaining`)})`,
            );
          } catch {
            console.log("  Expires at  : invalid timestamp (unable to format)");
          }
        } else {
          console.log("  Expires at  : unknown (no timestamp caveat detected)");
        }
        if (ethBalance) console.log(`  ETH balance : ${ethBalance}`);
        if (wethBalance) console.log(`  WETH balance: ${wethBalance}`);
        console.log();
      }
    });
};
