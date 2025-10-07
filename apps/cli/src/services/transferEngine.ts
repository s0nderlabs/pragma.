import chalk from "chalk";
import {
  Address,
  Hex,
  encodeFunctionData,
  formatEther,
  formatUnits,
  getAddress,
  parseEther,
  parseUnits,
} from "viem";
import { createExecution, ExecutionMode, redeemDelegations } from "@metamask/delegation-toolkit";

import type { SessionDelegationInfo, DeleGatorEnv } from "./onboarding4337.js";
import { createMonadPublicClient } from "./web3authClients.js";
import { createSessionWallet, ERC20_ABI, isNativeToken } from "./swapEngine.js";
import { MONAD_NATIVE_TOKEN_SYMBOL } from "./config.js";
import type { AllowedToken } from "./monorailTokens.js";

export interface NativeTransferConfig {
  session: SessionDelegationInfo;
  environment: DeleGatorEnv;
  hybridDelegator: Address;
  recipient: Address;
  amountInput: string;
  logPrefix?: string;
}

export interface TokenTransferConfig {
  session: SessionDelegationInfo;
  environment: DeleGatorEnv;
  hybridDelegator: Address;
  token: AllowedToken;
  recipient: Address;
  amountInput: string;
  logPrefix?: string;
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

export const transferNativeWithSession = async ({
  session,
  environment,
  hybridDelegator,
  recipient,
  amountInput,
  logPrefix,
}: NativeTransferConfig) => {
  ensureSessionActive(session);
  const amount = parseEther(amountInput);
  if (amount <= 0n) {
    throw new Error("Native transfer amount must be greater than zero.");
  }
  if (session.transferMaxAmount && amount > session.transferMaxAmount) {
    throw new Error(
      `Requested amount ${formatEther(amount)} exceeds native transfer cap of ${formatEther(session.transferMaxAmount)} MON.`,
    );
  }

  const sessionWallet = createSessionWallet(session);
  const publicClient = createMonadPublicClient();

  const execution = createExecution({
    target: getAddress(recipient),
    value: amount,
    callData: "0x" as Hex,
  });

  const txHash = await redeemDelegations(sessionWallet, publicClient, environment.DelegationManager as Address, [
    { permissionContext: [session.delegation], executions: [execution], mode: ExecutionMode.SingleDefault },
  ]);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const prefix = logPrefix ? `${logPrefix} ` : "";
  console.log(
    chalk.green(
      `${prefix}Transferred ${formatEther(amount)} ${MONAD_NATIVE_TOKEN_SYMBOL ?? "MON"} to ${recipient} (tx: ${txHash}, block: ${receipt.blockNumber})`,
    ),
  );
  return { txHash, amount };
};

export const transferTokenWithSession = async ({
  session,
  environment,
  hybridDelegator,
  token,
  recipient,
  amountInput,
  logPrefix,
}: TokenTransferConfig) => {
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

  if (isNativeToken(token)) {
    throw new Error("Wrapped/native MON should use the dedicated native transfer command.");
  }

  const decimals = typeof token.decimals === "number" ? token.decimals : Number(token.decimals ?? 18);
  const amount = parseUnits(amountInput, decimals);
  if (amount <= 0n) {
    throw new Error("Token transfer amount must be greater than zero.");
  }

  const sessionWallet = createSessionWallet(session);
  const publicClient = createMonadPublicClient();

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

  const txHash = await redeemDelegations(sessionWallet, publicClient, environment.DelegationManager as Address, [
    { permissionContext: [session.delegation], executions: [execution], mode: ExecutionMode.SingleDefault },
  ]);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const prefix = logPrefix ? `${logPrefix} ` : "";
  const symbol = token.symbol ?? token.address.slice(0, 6);
  console.log(
    chalk.green(
      `${prefix}Transferred ${formatUnits(amount, decimals)} ${symbol} to ${recipient} (tx: ${txHash}, block: ${receipt.blockNumber})`,
    ),
  );
  return { txHash, amount };
};
