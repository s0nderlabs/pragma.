"use client";

import { getAddress } from "viem";
import {
  previewSwapWithSession,
  executeSwapWithSession,
  type SwapPreviewResult,
  type SwapExecutionConfig,
  type SwapResult,
  type ExecutionLogger,
  type SwapEngineDependencies,
} from "@pragma/core/execution/swap";
import { createSessionWallet } from "@pragma/core/session/wallet";

import {
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_RPC_URL,
  MONAD_WMON_ADDRESS,
  MONAD_WRAPPED_TOKEN_SYMBOL,
  MONORAIL_AGGREGATOR_ADDRESS,
} from "../config";
import { createMonadExecutionClient, createMonadPublicClient, monadChain } from "../clients";
import { fetchMonorailQuote } from "../monorail/pathfinder";

const routerAddress = getAddress(MONORAIL_AGGREGATOR_ADDRESS);
const nativeTokenAddress = getAddress(MONAD_NATIVE_TOKEN_ADDRESS);
const wrappedNativeAddress = getAddress(MONAD_WMON_ADDRESS);

const buildDependencies = (logger?: ExecutionLogger): SwapEngineDependencies => ({
  publicClient: createMonadPublicClient(),
  fallbackPublicClient: createMonadExecutionClient(),
  sessionWalletFactory: (session) =>
    createSessionWallet(session, {
      chain: monadChain,
      rpcUrl: MONAD_RPC_URL,
    }),
  quoteFetcher: (params) => fetchMonorailQuote(params),
  routerAddress,
  nativeTokenAddress,
  wrappedNativeAddress,
  nativeTokenSymbol: MONAD_NATIVE_TOKEN_SYMBOL,
  wrappedNativeSymbol: MONAD_WRAPPED_TOKEN_SYMBOL,
  logger,
});

export const previewSwap = async (
  config: SwapExecutionConfig,
  logger?: ExecutionLogger,
): Promise<SwapPreviewResult> => previewSwapWithSession(config, buildDependencies(logger));

export const executeSwap = async (
  config: SwapExecutionConfig,
  logger?: ExecutionLogger,
): Promise<SwapResult> => executeSwapWithSession(config, buildDependencies(logger));
