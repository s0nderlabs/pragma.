"use client";

import { getAddress } from "viem";
import {
  transferNativeWithSession,
  transferTokenWithSession,
  type NativeTransferConfig,
  type TokenTransferConfig,
  type ExecutionLogger,
  type NativeTransferDependencies,
  type TokenTransferDependencies,
} from "@pragma/core/execution/transfer";
import { createSessionWallet } from "@pragma/core/session/wallet";

import {
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_RPC_URL,
} from "../config";
import { createMonadPublicClient, monadChain } from "../clients";

const nativeTokenAddress = getAddress(MONAD_NATIVE_TOKEN_ADDRESS);

const buildNativeDependencies = (logger?: ExecutionLogger): NativeTransferDependencies => ({
  publicClient: createMonadPublicClient(),
  sessionWalletFactory: (session) =>
    createSessionWallet(session, {
      chain: monadChain,
      rpcUrl: MONAD_RPC_URL,
    }),
  nativeTokenSymbol: MONAD_NATIVE_TOKEN_SYMBOL,
  logger,
});

const buildTokenDependencies = (logger?: ExecutionLogger): TokenTransferDependencies => ({
  ...buildNativeDependencies(logger),
  nativeTokenAddress,
});

export const executeNativeTransfer = async (
  config: NativeTransferConfig,
  logger?: ExecutionLogger,
) => transferNativeWithSession(config, buildNativeDependencies(logger));

export const executeTokenTransfer = async (
  config: TokenTransferConfig,
  logger?: ExecutionLogger,
) => transferTokenWithSession(config, buildTokenDependencies(logger));
