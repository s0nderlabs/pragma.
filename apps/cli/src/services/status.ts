import chalk from "chalk";
import { Address, formatEther, formatUnits } from "viem";

import { loadDelegationArtifact } from "./delegationArtifacts.js";
import { createSepoliaPublicClient } from "./web3authClients.js";
import { WETH_SEPOLIA } from "./onboarding4337.js";
import { onboardingLogger } from "../utils/logger.js";

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface DelegationStatus {
  mode: string;
  delegator: Address;
  sessionKey: Address;
  expiresAt: number;
  filePath: string;
  isExpired: boolean;
  ethBalanceWei?: bigint;
  wethBalanceWei?: bigint;
}

export interface StatusSnapshot {
  delegation?: DelegationStatus;
}

const fetchBalances = async (delegator: Address): Promise<{ eth?: bigint; weth?: bigint }> => {
  const publicClient = createSepoliaPublicClient();
  const balances: { eth?: bigint; weth?: bigint } = {};

  try {
    balances.eth = await publicClient.getBalance({ address: delegator });
  } catch (error) {
    onboardingLogger.debug({ err: error }, "Failed to fetch ETH balance for status snapshot");
  }

  try {
    const amount = (await publicClient.readContract({
      address: WETH_SEPOLIA,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [delegator],
    })) as bigint;
    balances.weth = amount;
  } catch (error) {
    onboardingLogger.debug({ err: error }, "Failed to fetch WETH balance for status snapshot");
  }

  return balances;
};

export const getStatusSnapshot = async (): Promise<StatusSnapshot> => {
  try {
    const { artifact, filePath } = await loadDelegationArtifact();
    const balances = await fetchBalances(artifact.delegation.delegator as Address);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = artifact.expiresAt;

    return {
      delegation: {
        mode: artifact.mode,
        delegator: artifact.delegation.delegator as Address,
        sessionKey: artifact.sessionKeyAddress,
        expiresAt,
        filePath,
        isExpired: expiresAt <= now,
        ethBalanceWei: balances.eth,
        wethBalanceWei: balances.weth,
      },
    };
  } catch (error) {
    const message = (error as Error).message ?? "";
    if (message.includes("No delegation artifacts")) {
      return {};
    }
    onboardingLogger.debug({ err: error }, "Status snapshot failed");
    return {};
  }
};

export const renderStatusSnapshot = (snapshot: StatusSnapshot) => {
  console.log(chalk.bold("Pragma CLI Status"));
  console.log(chalk.gray("Sepolia · ERC-4337 HybridDelegator"));
  console.log();

  if (!snapshot.delegation) {
    console.log(chalk.yellow("No delegation artifacts detected."));
    console.log("Run `pragma onboard:4337` to create your first delegation.");
    return;
  }

  const { delegation } = snapshot;
  const ttl = delegation.expiresAt - Math.floor(Date.now() / 1000);
  const ttlLabel = delegation.isExpired
    ? chalk.red("expired")
    : chalk.green(formatDuration(Math.max(ttl, 0)));

  console.log(chalk.bold("Delegation"));
  console.log(`  Mode        : ${delegation.mode}`);
  console.log(`  Delegator   : ${delegation.delegator}`);
  console.log(`  Session key : ${delegation.sessionKey}`);
  console.log(
    `  Expires at  : ${new Date(delegation.expiresAt * 1000).toISOString()} (${ttlLabel})`,
  );
  console.log(`  Artifact    : ${delegation.filePath}`);

  if (delegation.ethBalanceWei !== undefined) {
    console.log(`  ETH balance : ${formatEther(delegation.ethBalanceWei)} ETH`);
  }
  if (delegation.wethBalanceWei !== undefined) {
    console.log(`  WETH balance: ${formatUnits(delegation.wethBalanceWei, 18)} WETH`);
  }
};

const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return "expired";
  const units: [string, number][] = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const parts: string[] = [];
  let remaining = seconds;

  for (const [label, size] of units) {
    if (remaining >= size) {
      const value = Math.floor(remaining / size);
      remaining %= size;
      parts.push(`${value} ${label}${value === 1 ? "" : "s"}`);
    }
  }

  if (parts.length === 0) {
    parts.push(`${remaining} seconds`);
  }

  return parts.slice(0, 2).join(", ");
};
