import chalk from "chalk";
import { getAddress } from "viem";

import { loadSwapSession } from "./swapArtifacts.js";
import {
  MONAD_CHAIN_ID,
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_WMON_ADDRESS,
  MONAD_WRAPPED_TOKEN_SYMBOL,
} from "./config.js";
import type { DelegationContext } from "@pragma/core";

export interface LoadedAgentContext {
  delegator: `0x${string}`;
  delegationContext: DelegationContext;
  swapSession: Awaited<ReturnType<typeof loadSwapSession>>;
}

const toLowerHex = (value: string | undefined) => value?.toLowerCase() ?? "";

const extractCaps = (
  session: Awaited<ReturnType<typeof loadSwapSession>>["session"],
  environment: Awaited<ReturnType<typeof loadSwapSession>>["environment"],
) => {
  const perTokenCaps = new Map<string, bigint>();
  let nativeCap: bigint | undefined;

  const erc20Enforcer = toLowerHex(environment.caveatEnforcers?.ERC20TransferAmountEnforcer);
  const nativeEnforcer = toLowerHex(environment.caveatEnforcers?.NativeTokenTransferAmountEnforcer);

  for (const caveat of session.delegation.caveats ?? []) {
    const enforcer = toLowerHex(caveat.enforcer as string | undefined);
    if (!enforcer) continue;

    if (erc20Enforcer && enforcer === erc20Enforcer) {
      try {
        const hex = (caveat.terms as `0x${string}`) ?? "0x";
        const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
        if (stripped.length < 40 + 64) {
          throw new Error(`terms length ${stripped.length / 2} bytes too small`);
        }
        const tokenHex = `0x${stripped.slice(0, 40)}` as `0x${string}`;
        const amountHex = `0x${stripped.slice(40)}` as `0x${string}`;
        const tokenAddress = getAddress(tokenHex).toLowerCase();
        const maxAmount = BigInt(amountHex);
        perTokenCaps.set(tokenAddress, maxAmount);
      } catch (error) {
        console.warn("Failed to decode ERC20 cap", error);
      }
      continue;
    }

    if (nativeEnforcer && enforcer === nativeEnforcer) {
      try {
        const hex = (caveat.terms as `0x${string}`) ?? "0x";
        const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
        if (stripped.length < 64) {
          throw new Error(`terms length ${stripped.length / 2} bytes too small`);
        }
        nativeCap = BigInt(`0x${stripped.slice(stripped.length - 64)}`);
      } catch (error) {
        console.warn("Failed to decode native cap", error);
      }
    }
  }

  return {
    perTokenCaps: perTokenCaps.size > 0 ? Object.fromEntries(perTokenCaps) : undefined,
    nativeCap,
  } as {
    perTokenCaps?: Record<string, bigint>;
    nativeCap?: bigint;
  };
};

export const loadAgentContext = async (delegator?: string): Promise<LoadedAgentContext> => {
  const swapSession = await loadSwapSession({ delegator });
  const delegatorAddress = getAddress(swapSession.delegatorAddress) as `0x${string}`;

  if (!swapSession.allowedTokens || swapSession.allowedTokens.length === 0) {
    throw new Error(
      `${delegatorAddress} does not have any allowed tokens recorded. Reissue a delegation before using the agent.`,
    );
  }

  const delegationContext: DelegationContext = {
    mode: swapSession.session.mode,
    allowedTokens: swapSession.allowedTokens,
    nativeTokenSymbol: MONAD_NATIVE_TOKEN_SYMBOL,
    nativeTokenAddress: getAddress(MONAD_NATIVE_TOKEN_ADDRESS),
    wrappedNativeSymbol: MONAD_WRAPPED_TOKEN_SYMBOL,
    wrappedNativeAddress: getAddress(MONAD_WMON_ADDRESS),
    defaultSlippageBps: swapSession.session.mode === "safe" ? 50 : 100,
    defaultDeadlineMinutes: swapSession.session.mode === "safe" ? 15 : 30,
    maxSlippageBpsSafe: 250,
    maxSlippageBpsNormal: 500,
    maxDeadlineMinutesSafe: 60,
    maxDeadlineMinutesNormal: 120,
    chainId: MONAD_CHAIN_ID,
    feeBps: 0,
    feeRecipient: getAddress("0x000000000000000000000000000000000000dEaD"),
    sessionKeyId: swapSession.session.sessionKeyAddress,
    nonce: (() => {
      if (!swapSession.session.sessionNonce) return undefined;
      const nonceBig = BigInt(swapSession.session.sessionNonce);
      if (nonceBig > BigInt(Number.MAX_SAFE_INTEGER)) {
        return undefined;
      }
      return Number(nonceBig);
    })(),
  };

  const { perTokenCaps, nativeCap } = extractCaps(swapSession.session, swapSession.environment);
  const mergedCaps = new Map<string, bigint>();
  if (perTokenCaps) {
    for (const [address, amount] of Object.entries(perTokenCaps)) {
      mergedCaps.set(address.toLowerCase(), amount);
    }
  }
  if (swapSession.session.perTokenCapsWei) {
    for (const [address, amount] of Object.entries(swapSession.session.perTokenCapsWei)) {
      mergedCaps.set(address.toLowerCase(), BigInt(amount));
    }
  }
  if (mergedCaps.size > 0) {
    delegationContext.perTokenCapsWei = Object.fromEntries(mergedCaps);
  }

  const nativeCapCandidate = swapSession.session.nativeTokenCapWei ?? nativeCap;
  if (nativeCapCandidate !== undefined) {
    delegationContext.nativeTokenCapWei = nativeCapCandidate;
  }
  if (swapSession.session.pairAddresses) {
    delegationContext.pairAddresses = swapSession.session.pairAddresses.map((address) => getAddress(address));
  }

  console.log(
    chalk.gray(
      `Using delegation for ${delegatorAddress} (mode: ${swapSession.session.mode}, tokens: ${swapSession.allowedTokens
        .map((token) => token.symbol ?? token.address.slice(0, 6))
        .join(", ")}).`,
    ),
  );

  return {
    delegator: delegatorAddress,
    delegationContext,
    swapSession,
  };
};
