"use client";

import { getAddress, type Address, type Hex } from "viem";
import { getDeleGatorEnvironment } from "@metamask/delegation-toolkit";
import {
  DEFAULT_CALL_LIMITS,
  type SessionDelegationInfo,
  type DelegationArtifact,
  type DeleGatorEnv,
} from "@pragma/core/delegations/types";

import { listActiveDelegations } from "../storage/delegations";
import { MONAD_CHAIN_ID } from "../config";

export interface ChatSessionContext {
  session: SessionDelegationInfo;
  environment: DeleGatorEnv;
  delegator: Address;
  artifact: DelegationArtifact;
}

const toSessionDelegation = (artifact: DelegationArtifact): SessionDelegationInfo => {
  const perTokenCaps = artifact.perTokenCapsWei
    ? Object.fromEntries(
        Object.entries(artifact.perTokenCapsWei).map(([address, amount]) => [
          getAddress(address as Address).toLowerCase(),
          BigInt(amount),
        ]),
      )
    : undefined;

  const nativeCap =
    artifact.nativeTokenCapWei !== undefined && artifact.nativeTokenCapWei !== null
      ? BigInt(artifact.nativeTokenCapWei)
      : undefined;

  const callLimit = artifact.callsUnlimited
    ? null
    : artifact.callLimit ?? DEFAULT_CALL_LIMITS[artifact.mode];

  return {
    mode: artifact.mode,
    sessionKeyAddress: getAddress(artifact.sessionKeyAddress),
    sessionKeyPrivateKey: artifact.sessionKeyPrivateKey as Hex,
    delegation: artifact.delegation,
    expiresAt: artifact.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
    callLimit,
    callsUnlimited: artifact.callsUnlimited ?? false,
    sessionNonce: (artifact.sessionNonce ?? "0x0") as Hex,
    allowedTokens: artifact.allowedTokens ?? [],
    kind: artifact.kind,
    transferMaxAmount:
      artifact.transferMaxAmount !== undefined && artifact.transferMaxAmount !== null
        ? BigInt(artifact.transferMaxAmount)
        : undefined,
    pairAddresses: artifact.pairAddresses?.map((address) => getAddress(address as Address)),
    perTokenCapsWei: perTokenCaps,
    nativeTokenCapWei: nativeCap,
  } satisfies SessionDelegationInfo;
};

const environment = getDeleGatorEnvironment(MONAD_CHAIN_ID);

export const loadChatSession = (kind: "swap" | "transfer", fallbackKind?: "swap" | "transfer"):
  | ChatSessionContext
  | undefined => {
  const primary = listActiveDelegations(kind);
  const candidates = primary.length > 0 ? primary : fallbackKind ? listActiveDelegations(fallbackKind) : [];

  const target = candidates[0];
  if (!target) {
    return undefined;
  }

  const session = toSessionDelegation(target.artifact);
  const delegator = getAddress(target.artifact.delegation.delegator as Address);

  return {
    session,
    environment,
    delegator,
    artifact: target.artifact,
  };
};
