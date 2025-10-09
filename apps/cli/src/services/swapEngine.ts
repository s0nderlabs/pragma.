import chalk from "chalk";
import { Address, getAddress, parseUnits, formatUnits } from "viem";

import {
  executeSwapWithSession as executeSwapWithSessionCore,
  wrapNativeWithSession as wrapNativeWithSessionCore,
  unwrapNativeWithSession as unwrapNativeWithSessionCore,
  createSessionWallet as createSessionWalletCore,
  type SwapExecutionConfig as CoreSwapExecutionConfig,
  type SwapResult,
  type ExecutionLogger,
  type SwapEngineDependencies,
  type WrapConfig as CoreWrapConfig,
  type WrapDependencies,
  type SessionDelegationInfo,
  type DeleGatorEnv,
} from "@pragma/core";

import { createMonadPublicClient, monadChain } from "./web3authClients.js";
import { fetchMonorailQuote } from "./monorailPathfinder.js";
import type { AllowedToken } from "./monorailTokens.js";
import {
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_RPC_URL,
  MONAD_WRAPPED_TOKEN_SYMBOL,
  MONAD_WMON_ADDRESS,
  MONORAIL_AGGREGATOR_ADDRESS,
} from "./config.js";
import { setupHybridDelegatorTest } from "./onboarding4337.js";
import { persistSwapSessionCaps } from "./swapArtifacts.js";
import {
  isFixtureMode,
  recordFixtureSwap,
  recordFixtureWrap,
} from "../testing/fixtureRuntime.js";

const ROUTER_ADDRESS = getAddress(MONORAIL_AGGREGATOR_ADDRESS);
const NATIVE_TOKEN_ADDRESS = getAddress(MONAD_NATIVE_TOKEN_ADDRESS);
const WRAPPED_NATIVE_ADDRESS = getAddress(MONAD_WMON_ADDRESS);
const ZERO_TX_HASH = `0x${"0".repeat(64)}` as `0x${string}`;

const createLogger = (prefix?: string): ExecutionLogger => {
  const label = prefix ? `${prefix} ` : "";
  return {
    success: (message) => console.log(chalk.green(`${label}${message}`)),
    info: (message) => console.log(chalk.cyan(`${label}${message}`)),
    warn: (message) => console.log(chalk.yellow(`${label}${message}`)),
  };
};

const createSessionWalletFactory = () => (session: SessionDelegationInfo) =>
  createSessionWalletCore(session, {
    chain: monadChain,
    rpcUrl: MONAD_RPC_URL,
  });

const buildSwapDependencies = (logPrefix?: string): SwapEngineDependencies => ({
  publicClient: createMonadPublicClient(),
  sessionWalletFactory: createSessionWalletFactory(),
  quoteFetcher: fetchMonorailQuote,
  routerAddress: ROUTER_ADDRESS,
  nativeTokenAddress: NATIVE_TOKEN_ADDRESS,
  wrappedNativeAddress: WRAPPED_NATIVE_ADDRESS,
  nativeTokenSymbol: MONAD_NATIVE_TOKEN_SYMBOL,
  wrappedNativeSymbol: MONAD_WRAPPED_TOKEN_SYMBOL,
  logger: createLogger(logPrefix),
});

export interface SwapExecutionConfig extends CoreSwapExecutionConfig {
  logPrefix?: string;
  artifactPath?: string;
}

const getTokenDecimals = (token: AllowedToken & { decimals?: number }): number =>
  typeof token.decimals === "number" && Number.isFinite(token.decimals)
    ? token.decimals
    : Number(token.decimals ?? 18);

const verifyTokenCaps = (config: SwapExecutionConfig, amountInWei: bigint) => {
  const { session, intent } = config;
  const fromAddress = getAddress(intent.from.address).toLowerCase();
  const decimals = getTokenDecimals(intent.from);
  const perTokenCaps = session.perTokenCapsWei;

  if (perTokenCaps && Object.prototype.hasOwnProperty.call(perTokenCaps, fromAddress)) {
    const cap = perTokenCaps[fromAddress];
    if (cap !== undefined && amountInWei > cap) {
      const remaining = formatUnits(cap, decimals);
      throw new Error(
        `Swap amount exceeds remaining allowance for ${intent.from.symbol ?? intent.from.address}. Remaining cap: ${remaining}.`,
      );
    }
  }

  if (session.nativeTokenCapWei !== undefined && isNativeToken(intent.from)) {
    if (amountInWei > session.nativeTokenCapWei) {
      const remaining = formatUnits(session.nativeTokenCapWei, decimals);
      throw new Error(
        `Swap amount exceeds native token allowance. Remaining cap: ${remaining}.`,
      );
    }
  }
};

const consumeTokenCaps = (config: SwapExecutionConfig, amountIn: bigint) => {
  const { session, intent } = config;
  const perTokenCaps = session.perTokenCapsWei;
  const fromAddress = getAddress(intent.from.address).toLowerCase();

  if (perTokenCaps && Object.prototype.hasOwnProperty.call(perTokenCaps, fromAddress)) {
    const current = perTokenCaps[fromAddress];
    if (current !== undefined) {
      const remaining = current > amountIn ? current - amountIn : 0n;
      perTokenCaps[fromAddress] = remaining;
    }
  }

  if (session.nativeTokenCapWei !== undefined && isNativeToken(intent.from)) {
    session.nativeTokenCapWei = session.nativeTokenCapWei > amountIn ? session.nativeTokenCapWei - amountIn : 0n;
  }
};

export const executeSwapWithSession = async (
  config: SwapExecutionConfig,
): Promise<SwapResult> => {
  const decimalsIn = getTokenDecimals(config.intent.from);
  const amountInWei = parseUnits(config.amountInput, decimalsIn);

  verifyTokenCaps(config, amountInWei);

  if (isFixtureMode()) {
    const decimalsOut = getTokenDecimals(config.intent.to);
    const amountOut = parseUnits(config.amountInput, decimalsOut);
    const minAmountOut = amountOut - (amountOut * BigInt(config.slippageBps)) / 10_000n;
    const txHash =
      recordFixtureSwap({
        amountIn: amountInWei,
        amountOut,
        fromToken: config.intent.from.symbol ?? config.intent.from.address.slice(0, 6),
        toToken: config.intent.to.symbol ?? config.intent.to.address.slice(0, 6),
        note: `slippage ${config.slippageBps / 100}%`,
        txHashLabel: config.intent.from.symbol ?? "swap",
      }) ?? ZERO_TX_HASH;
    const quoteId = `fixture-${Date.now()}`;
    const result = {
      txHash,
      amountIn: amountInWei,
      amountOut,
      minAmountOut,
      quoteId,
      slippageToleranceBps: config.slippageBps,
      quote: {
        quoteId,
        transactionData: "0x",
        transactionValue: 0n,
        aggregator: ROUTER_ADDRESS,
        rawInput: amountInWei,
        rawOutput: amountOut,
        rawMinOutput: minAmountOut,
      },
    } satisfies SwapResult;

    consumeTokenCaps(config, amountInWei);
    return result;
  }
  const result = await executeSwapWithSessionCore(config, buildSwapDependencies(config.logPrefix));
  consumeTokenCaps(config, result.amountIn);

  if (!isFixtureMode() && config.artifactPath) {
    try {
      await persistSwapSessionCaps(config.artifactPath, config.session);
    } catch (error) {
      console.warn("Failed to persist cap updates", error);
    }
  }

  return result;
};

const buildWrapDependencies = (logPrefix?: string): WrapDependencies => ({
  publicClient: createMonadPublicClient(),
  sessionWalletFactory: createSessionWalletFactory(),
  wrappedNativeAddress: WRAPPED_NATIVE_ADDRESS,
  nativeTokenSymbol: MONAD_NATIVE_TOKEN_SYMBOL,
  wrappedNativeSymbol: MONAD_WRAPPED_TOKEN_SYMBOL,
  logger: createLogger(logPrefix),
});

export interface WrapConfig extends CoreWrapConfig {
  logPrefix?: string;
}

export const wrapNativeWithSession = async (
  config: WrapConfig,
) => {
  if (isFixtureMode()) {
    const amount = parseUnits(config.amountInput, 18);
    const txHash = recordFixtureWrap({ direction: "wrap", amount, txHashLabel: "wrap" }) ?? ZERO_TX_HASH;
    const label = config.logPrefix ? `${config.logPrefix} ` : "";
    console.log(
      chalk.green(
        `${label}Wrapped ${config.amountInput} ${MONAD_NATIVE_TOKEN_SYMBOL} -> ${MONAD_WRAPPED_TOKEN_SYMBOL} (fixture)`,
      ),
    );
    return { txHash, amount };
  }
  return wrapNativeWithSessionCore(config, buildWrapDependencies(config.logPrefix));
};

export const unwrapNativeWithSession = async (
  config: WrapConfig,
) => {
  if (isFixtureMode()) {
    const amount = parseUnits(config.amountInput, 18);
    const txHash = recordFixtureWrap({ direction: "unwrap", amount, txHashLabel: "unwrap" }) ?? ZERO_TX_HASH;
    const label = config.logPrefix ? `${config.logPrefix} ` : "";
    console.log(
      chalk.green(
        `${label}Unwrapped ${config.amountInput} ${MONAD_WRAPPED_TOKEN_SYMBOL} -> ${MONAD_NATIVE_TOKEN_SYMBOL} (fixture)`,
      ),
    );
    return { txHash, amount };
  }
  return unwrapNativeWithSessionCore(config, buildWrapDependencies(config.logPrefix));
};

export type { SwapResult };
export type SwapIntent = {
  from: AllowedToken & { decimals: number };
  to: AllowedToken & { decimals: number };
};

export type WrapExecutionConfig = {
  session: SessionDelegationInfo;
  environment: DeleGatorEnv;
  hybridDelegator: Address;
  amountInput: string;
  logPrefix?: string;
};

export interface SwapToken extends AllowedToken {
  decimals: number;
}

export const isNativeToken = (token: AllowedToken): boolean =>
  token.kind === "native" || token.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();

export const runSwapTest = async (mode: "safe" | "normal") => {
  const context = await setupHybridDelegatorTest(mode, { logSessionSummaries: true });
  const swapDelegation =
    context.sessionDelegations.find((delegation) => delegation.kind === "swap") ?? context.sessionDelegations[0];

  if (!swapDelegation) {
    throw new Error("Swap test could not locate a session delegation.");
  }

  const allowed = swapDelegation.allowedTokens ?? [];
  if (allowed.length < 2) {
    throw new Error("Swap test requires at least two allowed tokens in the delegation scope.");
  }

  const normalizeToken = (token: AllowedToken): SwapToken => ({
    ...token,
    decimals: typeof token.decimals === "number" ? token.decimals : Number(token.decimals ?? 18),
  });

  const fromToken = normalizeToken(allowed[0]);
  const toToken = normalizeToken(allowed[1]);
  const amountInput = "0.001";

  await executeSwapWithSession({
    session: swapDelegation,
    environment: context.environment,
    hybridDelegator: context.hybridDelegator,
    intent: { from: fromToken, to: toToken },
    amountInput,
    slippageBps: 50,
    logPrefix: `[dev/${mode}]`,
  });

  return {
    hybridDelegator: context.hybridDelegator,
    sessionKey: swapDelegation.sessionKeyAddress,
    amount: amountInput,
    fromToken,
    toToken,
  };
};
