import chalk from "chalk";
import { getAddress } from "viem";

import { loadSwapSession } from "./swapArtifacts.js";
import {
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
  };

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
