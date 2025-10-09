import type { Address, Hex } from "viem";
import type { Delegation } from "@metamask/delegation-toolkit";
import { getDeleGatorEnvironment } from "@metamask/delegation-toolkit";

import type { AllowedToken } from "../monorail/tokens.js";

export type Mode = "safe" | "normal";

export const DEFAULT_CALL_LIMITS: Record<Mode, number> = {
  safe: 6,
  normal: 12,
};

export type DelegationKind = "swap" | "transfer";

export interface SessionDelegationInfo {
  mode: Mode;
  sessionKeyAddress: Address;
  sessionKeyPrivateKey: Hex;
  expiresAt: number;
  delegation: Delegation;
  callLimit?: number | null;
  callsUnlimited?: boolean;
  sessionNonce: Hex;
  allowedTokens?: AllowedToken[];
  kind?: DelegationKind;
  transferMaxAmount?: bigint | null;
  pairAddresses?: Address[];
  perTokenCapsWei?: Record<string, bigint>;
  nativeTokenCapWei?: bigint;
}

export interface DelegationArtifact {
  mode: Mode;
  sessionKeyPrivateKey: Hex;
  sessionKeyAddress: Address;
  delegation: Delegation;
  expiresAt: number;
  callLimit?: number | null;
  callsUnlimited?: boolean;
  sessionNonce: Hex;
  allowedTokens?: AllowedToken[];
  kind?: DelegationKind;
  transferMaxAmount?: string | null;
  revokedAt?: number | null;
  pairAddresses?: Address[];
  perTokenCapsWei?: Record<string, string>;
  nativeTokenCapWei?: string | null;
}

export type DeleGatorEnv = ReturnType<typeof getDeleGatorEnvironment>;
