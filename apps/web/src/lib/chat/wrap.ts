"use client";

import { getAddress } from "viem";
import {
  wrapNativeWithSession,
  unwrapNativeWithSession,
  type WrapConfig,
  type WrapDependencies,
  type ExecutionLogger,
} from "@pragma/core/execution/swap";
import { createSessionWallet } from "@pragma/core/session/wallet";

import {
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_RPC_URL,
  MONAD_WMON_ADDRESS,
  MONAD_WRAPPED_TOKEN_SYMBOL,
} from "../config";
import { createMonadPublicClient, monadChain } from "../clients";

const wrappedNativeAddress = getAddress(MONAD_WMON_ADDRESS);

const buildWrapDependencies = (logger?: ExecutionLogger): WrapDependencies => ({
  publicClient: createMonadPublicClient(),
  sessionWalletFactory: (session) =>
    createSessionWallet(session, {
      chain: monadChain,
      rpcUrl: MONAD_RPC_URL,
    }),
  wrappedNativeAddress,
  nativeTokenSymbol: MONAD_NATIVE_TOKEN_SYMBOL,
  wrappedNativeSymbol: MONAD_WRAPPED_TOKEN_SYMBOL,
  logger,
});

export const executeWrap = async (config: WrapConfig, logger?: ExecutionLogger) =>
  wrapNativeWithSession(config, buildWrapDependencies(logger));

export const executeUnwrap = async (config: WrapConfig, logger?: ExecutionLogger) =>
  unwrapNativeWithSession(config, buildWrapDependencies(logger));
