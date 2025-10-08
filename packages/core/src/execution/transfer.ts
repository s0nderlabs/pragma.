import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  encodeFunctionData,
  formatEther,
  formatUnits,
  getAddress,
  parseEther,
  parseUnits,
} from "viem";
import { createExecution, ExecutionMode, redeemDelegations } from "@metamask/delegation-toolkit";

import type { AllowedToken } from "../monorail/tokens.js";
import type { SessionDelegationInfo, DeleGatorEnv } from "../delegations/types.js";
import { ERC20_ABI, type ExecutionLogger } from "./swap.js";

const emit = (logger: ExecutionLogger | undefined, level: keyof ExecutionLogger, message: string) => {
  const fn = logger?.[level];
  if (typeof fn === "function") {
    fn(message);
  }
};

export interface NativeTransferDependencies {
  publicClient: PublicClient;
  sessionWalletFactory: (session: SessionDelegationInfo) => WalletClient;
  nativeTokenSymbol?: string;
  logger?: ExecutionLogger;
}

export interface TokenTransferDependencies extends NativeTransferDependencies {
  nativeTokenAddress: Address;
}

const ensureSessionActive = (session: SessionDelegationInfo) => {
  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt <= now) {
    throw new Error(
      `Delegation expired at ${new Date(session.expiresAt * 1000).toISOString()} — reissue before executing transfers.`,
    );
  }
  if (!session.sessionKeyPrivateKey) {
    throw new Error("Session delegation is missing the private key secret; reissue onboarding before transferring.");
  }
};

export interface NativeTransferConfig {
  session: SessionDelegationInfo;
  environment: DeleGatorEnv;
  hybridDelegator: Address;
  recipient: Address;
  amountInput: string;
}

export interface TokenTransferConfig {
  session: SessionDelegationInfo;
  environment: DeleGatorEnv;
  hybridDelegator: Address;
  token: AllowedToken;
  recipient: Address;
  amountInput: string;
}

export const transferNativeWithSession = async (
  config: NativeTransferConfig,
  dependencies: NativeTransferDependencies,
) => {
  const { session, environment, hybridDelegator, recipient, amountInput } = config;
  const { publicClient, sessionWalletFactory, nativeTokenSymbol, logger } = dependencies;

  ensureSessionActive(session);
  const amount = parseEther(amountInput);
  if (amount <= 0n) {
    throw new Error("Native transfer amount must be greater than zero.");
  }
  if (session.transferMaxAmount && amount > session.transferMaxAmount) {
    throw new Error(
      `Requested amount ${formatEther(amount)} exceeds native transfer cap of ${formatEther(session.transferMaxAmount)} ${nativeTokenSymbol ?? "MON"}.`,
    );
  }

  const sessionWallet = sessionWalletFactory(session);

  const execution = createExecution({
    target: getAddress(recipient),
    value: amount,
    callData: "0x" as Hex,
  });

  const txHash = await redeemDelegations(
    sessionWallet,
    publicClient,
    environment.DelegationManager as Address,
    [{ permissionContext: [session.delegation], executions: [execution], mode: ExecutionMode.SingleDefault }],
  );

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  emit(
    logger,
    "success",
    `Transferred ${formatEther(amount)} ${nativeTokenSymbol ?? "MON"} to ${recipient} (tx: ${txHash}, block: ${receipt.blockNumber})`,
  );
  return { txHash, amount };
};

const isNativeToken = (token: AllowedToken, nativeTokenAddress: Address) =>
  token.address.toLowerCase() === nativeTokenAddress.toLowerCase() || token.kind === "native";

export const transferTokenWithSession = async (
  config: TokenTransferConfig,
  dependencies: TokenTransferDependencies,
) => {
  const { session, environment, hybridDelegator, token, recipient, amountInput } = config;
  const { publicClient, sessionWalletFactory, nativeTokenAddress, nativeTokenSymbol, logger } = dependencies;

  ensureSessionActive(session);
  if (!session.allowedTokens || session.allowedTokens.length === 0) {
    throw new Error("Session delegation is missing allowed token metadata; reissue onboarding before transferring tokens.");
  }

  const tokenAddress = getAddress(token.address);
  const normalizedAllowed = session.allowedTokens.some(
    (entry) => entry.address.toLowerCase() === tokenAddress.toLowerCase(),
  );
  if (!normalizedAllowed) {
    throw new Error(
      `Token ${token.symbol ?? tokenAddress} is not included in this delegation scope. Update delegation tokens before transferring.`,
    );
  }

  if (isNativeToken(token, nativeTokenAddress)) {
    throw new Error("Wrapped/native MON should use the dedicated native transfer command.");
  }

  const decimals = typeof token.decimals === "number" ? token.decimals : Number(token.decimals ?? 18);
  const amount = parseUnits(amountInput, decimals);
  if (amount <= 0n) {
    throw new Error("Token transfer amount must be greater than zero.");
  }

  const sessionWallet = sessionWalletFactory(session);

  const balance = (await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [hybridDelegator],
  })) as bigint;

  if (balance < amount) {
    throw new Error(
      `HybridDelegator ${hybridDelegator} has insufficient balance (${formatUnits(balance, decimals)} available).`,
    );
  }

  const callData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [getAddress(recipient), amount],
  });

  const execution = createExecution({ target: tokenAddress, value: 0n, callData });

  const txHash = await redeemDelegations(
    sessionWallet,
    publicClient,
    environment.DelegationManager as Address,
    [{ permissionContext: [session.delegation], executions: [execution], mode: ExecutionMode.SingleDefault }],
  );

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const symbol = token.symbol ?? token.address.slice(0, 6);
  emit(
    logger,
    "success",
    `Transferred ${formatUnits(amount, decimals)} ${symbol} to ${recipient} (tx: ${txHash}, block: ${receipt.blockNumber})`,
  );
  return { txHash, amount };
};
