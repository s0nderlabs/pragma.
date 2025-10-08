import chalk from "chalk";
import { getAddress, parseUnits } from "viem";

import {
  transferNativeWithSession as transferNativeWithSessionCore,
  transferTokenWithSession as transferTokenWithSessionCore,
  type NativeTransferConfig as CoreNativeTransferConfig,
  type TokenTransferConfig as CoreTokenTransferConfig,
  type NativeTransferDependencies,
  type TokenTransferDependencies,
  type ExecutionLogger,
  createSessionWallet as createSessionWalletCore,
  type SessionDelegationInfo,
} from "@pragma/core";

import { createMonadPublicClient, monadChain } from "./web3authClients.js";
import {
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_RPC_URL,
} from "./config.js";
import { isFixtureMode, recordFixtureTransfer } from "../testing/fixtureRuntime.js";

const ZERO_TX_HASH = `0x${"0".repeat(64)}` as `0x${string}`;

const NATIVE_TOKEN_ADDRESS = getAddress(MONAD_NATIVE_TOKEN_ADDRESS);

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

const buildNativeDependencies = (logPrefix?: string): NativeTransferDependencies => ({
  publicClient: createMonadPublicClient(),
  sessionWalletFactory: createSessionWalletFactory(),
  nativeTokenSymbol: MONAD_NATIVE_TOKEN_SYMBOL,
  logger: createLogger(logPrefix),
});

const buildTokenDependencies = (logPrefix?: string): TokenTransferDependencies => ({
  ...buildNativeDependencies(logPrefix),
  nativeTokenAddress: NATIVE_TOKEN_ADDRESS,
});

export interface NativeTransferConfig extends CoreNativeTransferConfig {
  logPrefix?: string;
}

export interface TokenTransferConfig extends CoreTokenTransferConfig {
  logPrefix?: string;
}

export const transferNativeWithSession = async (
  config: NativeTransferConfig,
) => {
  if (isFixtureMode()) {
    const amount = parseUnits(config.amountInput, 18);
    const txHash =
      recordFixtureTransfer({
        token: MONAD_NATIVE_TOKEN_SYMBOL,
        amount,
        recipient: config.recipient,
        txHashLabel: "mon",
      }) ?? ZERO_TX_HASH;
    const label = config.logPrefix ? `${config.logPrefix} ` : "";
    console.log(
      chalk.green(
        `${label}Transferred ${config.amountInput} ${MONAD_NATIVE_TOKEN_SYMBOL} to ${config.recipient} (fixture)`,
      ),
    );
    return { txHash, amount };
  }
  return transferNativeWithSessionCore(config, buildNativeDependencies(config.logPrefix));
};

export const transferTokenWithSession = async (
  config: TokenTransferConfig,
) => {
  if (isFixtureMode()) {
    const decimals = Number(config.token.decimals ?? 18);
    const amount = parseUnits(config.amountInput, decimals);
    const symbol = config.token.symbol ?? config.token.address;
    const txHash =
      recordFixtureTransfer({
        token: symbol,
        amount,
        recipient: config.recipient,
        txHashLabel: symbol,
      }) ?? ZERO_TX_HASH;
    const label = config.logPrefix ? `${config.logPrefix} ` : "";
    console.log(
      chalk.green(
        `${label}Transferred ${config.amountInput} ${symbol} to ${config.recipient} (fixture)`,
      ),
    );
    return { txHash, amount };
  }
  return transferTokenWithSessionCore(config, buildTokenDependencies(config.logPrefix));
};
