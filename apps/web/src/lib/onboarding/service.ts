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
import { listDelegations, saveDelegation } from "../storage/delegations";
import { getOwnerDelegator, setOwnerDelegator } from "../storage/owner-delegators";
import { getOrCreateSessionKey, getSessionKey, rotateSessionKey, type SessionKeyRecord } from "../storage/session-keys";
import type { WalletWithAddress } from "../clients";

export interface HybridOnboardingInitResult {
  handle: Awaited<ReturnType<typeof createHybridDelegatorHandle>>;
  deployment?: { userOpHash: Hex | null; transactionHash?: Hex };
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

export const fetchAllowlist = async (options?: { forceFallback?: boolean }): Promise<AllowedToken[]> => {
  try {
    const tokens = await loadAllowedTokens(options);
    console.log(`[fetchAllowlist] Loaded ${tokens.length} tokens from loadAllowedTokens`);
    const normalized = normalizeTokens(tokens);
    console.log(`[fetchAllowlist] Normalized to ${normalized.length} tokens`);
    return normalized;
  } catch (error) {
    console.warn("Falling back to static token list", error);
    const fallback = getFallbackAllowedTokens();
    console.log(`[fetchAllowlist] Using fallback with ${fallback.length} tokens`);
    const normalized = normalizeTokens(fallback);
    console.log(`[fetchAllowlist] Normalized fallback to ${normalized.length} tokens`);
    return normalized;
  }
};

export const initializeHybridDelegator = async (
  walletClient: WalletWithAddress["walletClient"],
  ownerAddress: Address,
  { rotateKey, skipDeployment }: { rotateKey?: boolean; skipDeployment?: boolean } = {},
): Promise<HybridOnboardingInitResult> => {
  const handle = await createHybridDelegatorHandle(walletClient, ownerAddress);

  const normalizedOwner = getAddress(ownerAddress);
  const existingOwner = await fetchHybridDelegatorOwner(handle);
  if (existingOwner && existingOwner !== normalizedOwner) {
    throw new Error(
      `Connected Web3Auth wallet ${normalizedOwner} does not control HybridDelegator ${handle.delegator}. Use ${existingOwner} instead or update contract ownership.`,
    );
  }

  const deployment = skipDeployment
    ? undefined
    : await ensureHybridDelegatorDeployed(handle, { allowDirectFallback: true });
  const nonce = await fetchDelegationNonce(handle);

  const existingSessionKey = getSessionKey(handle.delegator);
  const sessionKey = rotateKey
    ? rotateSessionKey(handle.delegator)
    : existingSessionKey ?? getOrCreateSessionKey(handle.delegator);

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
  setOwnerDelegator(ownerAddress, swapArtifact.delegation.delegator as Address);

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
    setOwnerDelegator(ownerAddress, transferArtifact.delegation.delegator as Address);
  }

  return results;
};

const SAFE_TTL_SECONDS = 60 * 60;
const NORMAL_TTL_SECONDS = 24 * 60 * 60;

const normalizeAllowedTokens = (tokens: AllowedToken[]): AllowedToken[] =>
  tokens.map((token) => ({
    ...token,
    address: getAddress(token.address as Address),
  }));

const toBigIntRecord = (input?: Record<string, string | number | bigint | undefined | null>) => {
  if (!input) return undefined;
  const mapped = Object.entries(input)
    .map(([key, value]) => {
      if (value === undefined || value === null) return undefined;
      try {
        return [getAddress(key as Address), BigInt(value)] as const;
      } catch {
        return undefined;
      }
    })
    .filter((entry): entry is readonly [Address, bigint] => Array.isArray(entry));
  if (mapped.length === 0) return undefined;
  return Object.fromEntries(mapped);
};

export const rotateHybridDelegatorSession = async (
  walletClient: WalletWithAddress["walletClient"],
  ownerAddress: Address,
): Promise<{ sessionKey: SessionKeyRecord; delegator: Address }> => {
  const init = await initializeHybridDelegator(walletClient, ownerAddress, { rotateKey: true, skipDeployment: true });
  let delegations = listDelegations(init.handle.delegator);

  let swapEntry = delegations.find((entry) => !entry.revokedAt && (entry.artifact.kind ?? "swap") === "swap");
  if (!swapEntry) {
    const mappedDelegator = getOwnerDelegator(ownerAddress);
    if (mappedDelegator) {
      delegations = listDelegations(mappedDelegator);
      swapEntry = delegations.find((entry) => !entry.revokedAt && (entry.artifact.kind ?? "swap") === "swap");
    }
  }
  if (!swapEntry) {
    throw new Error("No existing swap delegation found to replicate. Issue a new delegation first.");
  }

  const ttl = swapEntry.artifact.mode === "safe" ? SAFE_TTL_SECONDS : NORMAL_TTL_SECONDS;
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;

  const swapOptions: SwapDelegationOptions = {
    mode: swapEntry.artifact.mode,
    allowedTokens: normalizeAllowedTokens(swapEntry.artifact.allowedTokens ?? []),
    expiresAt,
    unlimitedCalls: swapEntry.artifact.callsUnlimited ?? false,
    callLimit: swapEntry.artifact.callsUnlimited ? undefined : swapEntry.artifact.callLimit ?? undefined,
    perTokenCaps: toBigIntRecord(swapEntry.artifact.perTokenCapsWei ?? undefined),
    nativeTokenCap: swapEntry.artifact.nativeTokenCapWei ? BigInt(swapEntry.artifact.nativeTokenCapWei) : undefined,
  };

  let transferOptions: TransferDelegationOptions | undefined;
  const transferEntry = delegations.find((entry) => !entry.revokedAt && entry.artifact.kind === "transfer");
  if (transferEntry) {
    transferOptions = {
      enabled: true,
      maxAmountWei: transferEntry.artifact.transferMaxAmount
        ? BigInt(transferEntry.artifact.transferMaxAmount)
        : 0n,
    };
  }

  const plan = buildDelegationPlan(init, swapOptions, transferOptions);
  await finalizeDelegations(walletClient, ownerAddress, plan);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("pragma:delegation:updated"));
  }

  return { sessionKey: init.sessionKey, delegator: init.handle.delegator };
};
