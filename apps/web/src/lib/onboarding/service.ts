"use client";

import { getAddress, type Address, type Hex } from "viem";
import type { DelegationArtifact, Mode } from "@pragma/core/delegations/types";
import type { AllowedToken } from "@pragma/core/monorail/tokens";

import {
  createHybridDelegatorHandle,
  ensureHybridDelegatorDeployed,
  fetchDelegationNonce,
  fetchHybridDelegatorOwner,
} from "./hybridDelegator";
import { buildSwapDelegation, buildTransferDelegation, type DelegationBuildResult } from "../delegations/hybrid";
import { getFallbackAllowedTokens, loadAllowedTokens, normalizeTokens } from "../monorail";
import { listActiveDelegations, saveDelegation } from "../storage/delegations";
import { getOrCreateSessionKey, rotateSessionKey, type SessionKeyRecord } from "../storage/session-keys";
import type { WalletWithAddress } from "../clients";

export interface HybridOnboardingInitResult {
  handle: Awaited<ReturnType<typeof createHybridDelegatorHandle>>;
  deployment?: { userOpHash: Hex; transactionHash: Hex };
  sessionKey: SessionKeyRecord;
  nonce: bigint;
}

export interface SwapDelegationOptions {
  mode: Mode;
  allowedTokens: AllowedToken[];
  expiresAt: number;
  unlimitedCalls: boolean;
  callLimit?: number | null;
  perTokenCaps?: Record<Address, bigint>;
  nativeTokenCap?: bigint;
}

export interface TransferDelegationOptions {
  enabled: boolean;
  maxAmountWei: bigint;
}

export interface HybridDelegationPlan {
  swap: DelegationBuildResult;
  transfer?: DelegationBuildResult;
}

export const fetchAllowlist = async (): Promise<AllowedToken[]> => {
  try {
    return normalizeTokens(await loadAllowedTokens());
  } catch (error) {
    console.warn("Falling back to static token list", error);
    return normalizeTokens(getFallbackAllowedTokens());
  }
};

export const initializeHybridDelegator = async (
  walletClient: WalletWithAddress["walletClient"],
  ownerAddress: Address,
  { rotateKey }: { rotateKey?: boolean } = {},
): Promise<HybridOnboardingInitResult> => {
  const handle = await createHybridDelegatorHandle(walletClient, ownerAddress);

  const normalizedOwner = getAddress(ownerAddress);
  const existingOwner = await fetchHybridDelegatorOwner(handle);
  if (existingOwner && existingOwner !== normalizedOwner) {
    throw new Error(
      `Connected Web3Auth wallet ${normalizedOwner} does not control HybridDelegator ${handle.delegator}. Use ${existingOwner} instead or update contract ownership.`,
    );
  }

  const deployment = await ensureHybridDelegatorDeployed(handle);
  const nonce = await fetchDelegationNonce(handle);

  const existingActive = listActiveDelegations().find(
    (entry) => getAddress(entry.artifact.delegation.delegator) === handle.delegator,
  );

  const sessionKey = rotateKey || !existingActive
    ? rotateSessionKey(handle.delegator)
    : getOrCreateSessionKey(handle.delegator);

  return {
    handle,
    deployment,
    sessionKey,
    nonce,
  };
};

export const buildDelegationPlan = (
  init: HybridOnboardingInitResult,
  swapOptions: SwapDelegationOptions,
  transferOptions?: TransferDelegationOptions,
): HybridDelegationPlan => {
  const swap = buildSwapDelegation({
    delegator: init.handle.delegator,
    sessionKey: init.sessionKey.address,
    sessionKeyPrivateKey: init.sessionKey.privateKey,
    nonce: init.nonce,
    expiresAt: swapOptions.expiresAt,
    mode: swapOptions.mode,
    allowedTokens: swapOptions.allowedTokens,
    callLimits: {
      unlimitedCalls: swapOptions.unlimitedCalls,
      callLimit: swapOptions.callLimit,
    },
    tokenCaps: {
      perTokenCaps: swapOptions.perTokenCaps,
      nativeTokenCap: swapOptions.nativeTokenCap,
    },
  });

  let transfer: DelegationBuildResult | undefined;
  if (transferOptions?.enabled) {
    transfer = buildTransferDelegation({
      delegator: init.handle.delegator,
      sessionKey: init.sessionKey.address,
      sessionKeyPrivateKey: init.sessionKey.privateKey,
      expiresAt: swapOptions.expiresAt,
      callLimits: { unlimitedCalls: true, callLimit: null },
      maxAmountWei: transferOptions.maxAmountWei,
    });
  }

  return { swap, transfer };
};

const signDelegation = async (
  walletClient: WalletWithAddress["walletClient"],
  ownerAddress: Address,
  typedData: ReturnType<typeof buildSwapDelegation>["typedData"],
) => {
  const signature = await walletClient.signTypedData({
    account: ownerAddress,
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });
  return signature as Hex;
};

export const finalizeDelegations = async (
  walletClient: WalletWithAddress["walletClient"],
  ownerAddress: Address,
  plan: HybridDelegationPlan,
): Promise<DelegationArtifact[]> => {
  const results: DelegationArtifact[] = [];

  const swapSignature = await signDelegation(walletClient, ownerAddress, plan.swap.typedData);
  plan.swap.delegation.signature = swapSignature;
  const swapArtifact: DelegationArtifact = {
    ...plan.swap.artifact,
    delegation: {
      ...plan.swap.delegation,
      signature: swapSignature,
    },
  };
  results.push(saveDelegation(swapArtifact).artifact);

  if (plan.transfer) {
    const transferSignature = await signDelegation(walletClient, ownerAddress, plan.transfer.typedData);
    plan.transfer.delegation.signature = transferSignature;
    const transferArtifact: DelegationArtifact = {
      ...plan.transfer.artifact,
      delegation: {
        ...plan.transfer.delegation,
        signature: transferSignature,
      },
    };
    results.push(saveDelegation(transferArtifact).artifact);
  }

  return results;
};
