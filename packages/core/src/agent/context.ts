import { getAddress } from "viem";

import type { DelegationContext } from "../intent/types.js";
import type { SessionDelegationInfo } from "../delegations/types.js";

export interface DelegationContextOptions {
  session: Pick<SessionDelegationInfo, "mode" | "allowedTokens" | "sessionKeyAddress" | "sessionNonce" | "perTokenCapsWei" | "nativeTokenCapWei" | "pairAddresses">;
  metadata?: {
    nativeTokenSymbol?: string;
    nativeTokenAddress?: string;
    wrappedNativeSymbol?: string;
    wrappedNativeAddress?: string;
    defaultSlippageBps?: number;
    defaultDeadlineMinutes?: number;
    maxSlippageBpsSafe?: number;
    maxSlippageBpsNormal?: number;
    maxDeadlineMinutesSafe?: number;
    maxDeadlineMinutesNormal?: number;
    chainId?: number;
    feeBps?: number;
    feeRecipient?: string;
  };
}

export const buildDelegationContext = ({ session, metadata }: DelegationContextOptions): DelegationContext => {
  const context: DelegationContext = {
    mode: session.mode,
    allowedTokens: session.allowedTokens ?? [],
  };

  if (metadata?.nativeTokenSymbol) context.nativeTokenSymbol = metadata.nativeTokenSymbol;
  if (metadata?.nativeTokenAddress) context.nativeTokenAddress = getAddress(metadata.nativeTokenAddress);
  if (metadata?.wrappedNativeSymbol) context.wrappedNativeSymbol = metadata.wrappedNativeSymbol;
  if (metadata?.wrappedNativeAddress) context.wrappedNativeAddress = getAddress(metadata.wrappedNativeAddress);
  if (metadata?.defaultSlippageBps !== undefined) context.defaultSlippageBps = metadata.defaultSlippageBps;
  if (metadata?.defaultDeadlineMinutes !== undefined) context.defaultDeadlineMinutes = metadata.defaultDeadlineMinutes;
  if (metadata?.maxSlippageBpsSafe !== undefined) context.maxSlippageBpsSafe = metadata.maxSlippageBpsSafe;
  if (metadata?.maxSlippageBpsNormal !== undefined) context.maxSlippageBpsNormal = metadata.maxSlippageBpsNormal;
  if (metadata?.maxDeadlineMinutesSafe !== undefined) context.maxDeadlineMinutesSafe = metadata.maxDeadlineMinutesSafe;
  if (metadata?.maxDeadlineMinutesNormal !== undefined) context.maxDeadlineMinutesNormal = metadata.maxDeadlineMinutesNormal;
  if (metadata?.chainId !== undefined) context.chainId = metadata.chainId;
  if (metadata?.feeBps !== undefined) context.feeBps = metadata.feeBps;
  if (metadata?.feeRecipient) context.feeRecipient = getAddress(metadata.feeRecipient);

  context.sessionKeyId = session.sessionKeyAddress;

  if (session.sessionNonce) {
    const nonceBigInt = BigInt(session.sessionNonce);
    if (nonceBigInt <= BigInt(Number.MAX_SAFE_INTEGER)) {
      context.nonce = Number(nonceBigInt);
    }
  }

  if (session.perTokenCapsWei) {
    context.perTokenCapsWei = Object.fromEntries(
      Object.entries(session.perTokenCapsWei).map(([address, amount]) => [address.toLowerCase(), amount]),
    );
  }

  if (session.nativeTokenCapWei !== undefined) {
    context.nativeTokenCapWei = session.nativeTokenCapWei;
  }

  if (session.pairAddresses) {
    context.pairAddresses = session.pairAddresses.map((address) => getAddress(address));
  }

  return context;
};
