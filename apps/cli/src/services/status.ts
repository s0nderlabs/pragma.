import chalk from "chalk";
import { Address, formatEther, formatUnits } from "viem";

import { loadDelegationArtifact } from "./delegationArtifacts.js";
import { createMonadPublicClient } from "./web3authClients.js";
import type { AllowedToken } from "./monorailTokens.js";
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
  wrappedBalanceWei?: bigint;
  wrappedToken?: Pick<AllowedToken, "address" | "symbol" | "decimals">;
  allowedTokens?: AllowedToken[];
}

export interface StatusSnapshot {
  delegation?: DelegationStatus;
}

const fetchBalances = async (
  delegator: Address,
  wrappedToken?: Pick<AllowedToken, "address" | "decimals" | "symbol">,
): Promise<{ eth?: bigint; wrapped?: bigint }> => {
  const publicClient = createMonadPublicClient();
  const balances: { eth?: bigint; wrapped?: bigint } = {};

  try {
    balances.eth = await publicClient.getBalance({ address: delegator });
  } catch (error) {
    onboardingLogger.debug({ err: error }, "Failed to fetch MON balance for status snapshot");
  }

  if (wrappedToken) {
    try {
      const amount = (await publicClient.readContract({
        address: wrappedToken.address,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [delegator],
      })) as bigint;
      balances.wrapped = amount;
    } catch (error) {
      onboardingLogger.debug({ err: error }, "Failed to fetch wrapped balance for status snapshot");
    }
  }

  return balances;
};

export const getStatusSnapshot = async (): Promise<StatusSnapshot> => {
  try {
    const { artifact, filePath } = await loadDelegationArtifact();
    const wrappedToken = (artifact.allowedTokens ?? []).find(
      (token) => token.kind === "wrappedNative",
    );
    const balances = await fetchBalances(
      artifact.delegation.delegator as Address,
      wrappedToken,
    );
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
        wrappedBalanceWei: balances.wrapped,
        wrappedToken,
        allowedTokens: artifact.allowedTokens,
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
  console.log(chalk.gray("Monad Testnet · ERC-4337 HybridDelegator"));
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
    console.log(`  MON balance : ${formatEther(delegation.ethBalanceWei)} MON`);
  }
  if (delegation.wrappedBalanceWei !== undefined && delegation.wrappedToken) {
    const symbol = delegation.wrappedToken.symbol ?? "WMON";
    const decimals = delegation.wrappedToken.decimals ?? 18;
    console.log(`  ${symbol} balance: ${formatUnits(delegation.wrappedBalanceWei, decimals)} ${symbol}`);
  }
  if (delegation.allowedTokens && delegation.allowedTokens.length > 0) {
    console.log("  Allowed tokens:");
    delegation.allowedTokens.forEach((token) => {
      const tags: string[] = [];
      if (token.kind === "native") tags.push("native");
      if (token.kind === "wrappedNative") tags.push("wrapped");
      if (token.categories && token.categories.length > 0) {
        tags.push(...token.categories.slice(0, 3));
      } else {
        tags.push("legacy");
      }
      const tagSuffix = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
      console.log(
        `    - ${token.symbol ?? token.address} (${token.address})${tagSuffix}`,
      );
    });
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
