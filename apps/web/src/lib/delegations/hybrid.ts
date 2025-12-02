"use client";

import { getAddress, toHex, type Address, type Hex } from "viem";
import { buildHybridCaveats, buildHybridScope, ZERO_SALT } from "@pragma/core/delegations/hybrid";
import { DEFAULT_CALL_LIMITS } from "@pragma/core/delegations/types";
import type { DelegationArtifact, Mode } from "@pragma/core/delegations/types";
import type { AllowedToken } from "@pragma/core/monorail/tokens";
import { createDelegation, getDeleGatorEnvironment, type Delegation, type Caveats } from "@metamask/delegation-toolkit";

import { buildDelegationTypedData } from "@pragma/core/delegations/typedData";
import {
  MONAD_CHAIN_ID,
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONORAIL_AGGREGATOR_ADDRESS,
} from "../config";

export const ROUTER_ADDRESS = getAddress(MONORAIL_AGGREGATOR_ADDRESS);

// Use testnet chain ID (10143) for DTK environment lookup since:
// 1. DTK doesn't have mainnet (143) in its registry yet
// 2. All DTK contracts are deployed at same CREATE2 addresses on both networks
const DTK_CHAIN_ID_FOR_ADDRESSES = 10143;
const environment = getDeleGatorEnvironment(DTK_CHAIN_ID_FOR_ADDRESSES);

export interface CallLimitConfig {
  unlimitedCalls: boolean;
  callLimit?: number | null;
}

export interface TokenCapsConfig {
  perTokenCaps?: Record<Address, bigint>;
  nativeTokenCap?: bigint;
}

export interface DelegationBuildContext {
  delegator: Address;
  sessionKey: Address;
  nonce: bigint;
  expiresAt: number;
  mode: Mode;
  allowedTokens: AllowedToken[];
  callLimits: CallLimitConfig;
  tokenCaps: TokenCapsConfig;
  sessionKeyPrivateKey?: Hex;
}

export interface DelegationBuildResult {
  delegation: Delegation;
  typedData: ReturnType<typeof buildDelegationTypedData>;
  artifact: DelegationArtifact;
}

export const buildSwapDelegation = (context: DelegationBuildContext): DelegationBuildResult => {
  const { delegator, sessionKey, nonce, expiresAt, mode, allowedTokens } = context;

  if (allowedTokens.length === 0) {
    throw new Error("Allowed token list cannot be empty when issuing a swap delegation.");
  }

  const normalizedTokens = allowedTokens.map((token) => ({
    ...token,
    address: getAddress(token.address),
  }));

  const scope = buildHybridScope({
    allowedTokens: normalizedTokens,
    router: ROUTER_ADDRESS,
    delegator,
  });

  const caveats = buildHybridCaveats(mode, expiresAt, {
    callLimit: context.callLimits.unlimitedCalls
      ? undefined
      : context.callLimits.callLimit ?? DEFAULT_CALL_LIMITS[mode],
    unlimitedCalls: context.callLimits.unlimitedCalls,
    nonce,
    tokenCaps: context.tokenCaps.perTokenCaps,
    nativeTokenCap: context.tokenCaps.nativeTokenCap,
  });

  const delegationWithoutSignature = createDelegation({
    environment,
    scope,
    from: delegator as Hex,
    to: sessionKey as Hex,
    caveats: caveats as Caveats,
    salt: ZERO_SALT,
  });

  const typedData = buildDelegationTypedData(
    delegationWithoutSignature,
    MONAD_CHAIN_ID,
    environment.DelegationManager as Address,
  );

  const pairAddresses =
    mode === "safe"
      ? normalizedTokens.slice(0, 2).map((token) => getAddress(token.address))
      : undefined;

  const artifact: DelegationArtifact = {
    mode,
    sessionKeyAddress: sessionKey,
    sessionKeyPrivateKey: context.sessionKeyPrivateKey ?? ("0x" as Hex),
    delegation: delegationWithoutSignature,
    expiresAt,
    callLimit: context.callLimits.unlimitedCalls
      ? null
      : context.callLimits.callLimit ?? DEFAULT_CALL_LIMITS[mode],
    callsUnlimited: context.callLimits.unlimitedCalls,
    sessionNonce: toHex(nonce),
    allowedTokens: normalizedTokens,
    kind: "swap",
    transferMaxAmount: null,
    pairAddresses,
    perTokenCapsWei: context.tokenCaps.perTokenCaps
      ? Object.fromEntries(
          Object.entries(context.tokenCaps.perTokenCaps).map(([address, amount]) => [
            getAddress(address as Address),
            amount.toString(),
          ]),
        )
      : undefined,
    nativeTokenCapWei: context.tokenCaps.nativeTokenCap ? context.tokenCaps.nativeTokenCap.toString() : null,
  };

  return {
    delegation: delegationWithoutSignature,
    typedData,
    artifact,
  };
};

export const buildTransferDelegation = (
  context: Omit<DelegationBuildContext, "allowedTokens" | "tokenCaps" | "mode" | "nonce"> & {
    maxAmountWei: bigint;
  },
): DelegationBuildResult => {
  const { delegator, sessionKey, expiresAt } = context;

  const scope = {
    type: "nativeTokenTransferAmount" as const,
    maxAmount: context.maxAmountWei,
  };

  const caveats = [
    {
      type: "timestamp" as const,
      afterThreshold: 0,
      beforeThreshold: expiresAt,
    },
  ];

  const delegationWithoutSignature = createDelegation({
    environment,
    scope,
    from: delegator as Hex,
    to: sessionKey as Hex,
    caveats: caveats as Caveats,
    salt: ZERO_SALT,
  });

  const typedData = buildDelegationTypedData(
    delegationWithoutSignature,
    MONAD_CHAIN_ID,
    environment.DelegationManager as Address,
  );

  const artifact: DelegationArtifact = {
    mode: "normal",
    sessionKeyAddress: sessionKey,
    sessionKeyPrivateKey: context.sessionKeyPrivateKey ?? ("0x" as Hex),
    delegation: delegationWithoutSignature,
    expiresAt,
    callLimit: null,
    callsUnlimited: true,
    sessionNonce: "0x0",
    allowedTokens: [],
    kind: "transfer",
    transferMaxAmount: context.maxAmountWei.toString(),
    nativeTokenCapWei: context.maxAmountWei.toString(),
  };

  return {
    delegation: delegationWithoutSignature,
    typedData,
    artifact,
  };
};

export const isNativeTokenAddress = (address: Address) =>
  address.toLowerCase() === MONAD_NATIVE_TOKEN_ADDRESS.toLowerCase();
