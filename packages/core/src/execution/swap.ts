import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  encodeFunctionData,
  formatUnits,
  getAddress,
  parseUnits,
} from "viem";
import { ExecutionMode, createExecution, redeemDelegations } from "@metamask/delegation-toolkit";

import type { AllowedToken } from "../monorail/tokens.js";
import type { SessionDelegationInfo, DeleGatorEnv } from "../delegations/types.js";
import type { MonorailQuote, QuoteRequestParams } from "../monorail/pathfinder.js";

export const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const WRAPPED_NATIVE_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: [],
  },
] as const;

export interface SwapToken extends AllowedToken {
  decimals: number;
}

export interface SwapIntent {
  from: SwapToken;
  to: SwapToken;
}

export interface SwapResult {
  txHash: Hex;
  amountIn: bigint;
  amountOut: bigint;
  amountOutDelegator?: bigint;
  amountOutSession?: bigint;
  minAmountOut: bigint;
  quoteId: string;
  slippageToleranceBps: number;
  quote: MonorailQuote;
}

export interface ExecutionLogger {
  info?(message: string): void;
  warn?(message: string): void;
  success?(message: string): void;
}

const emit = (logger: ExecutionLogger | undefined, level: keyof ExecutionLogger, message: string) => {
  const fn = logger?.[level];
  if (typeof fn === "function") {
    fn(message);
  }
};

export interface SwapEngineDependencies {
  publicClient: PublicClient;
  sessionWalletFactory: (session: SessionDelegationInfo) => WalletClient;
  quoteFetcher: (params: QuoteRequestParams) => Promise<MonorailQuote>;
  routerAddress: Address;
  nativeTokenAddress: Address;
  wrappedNativeAddress: Address;
  nativeTokenSymbol?: string;
  wrappedNativeSymbol?: string;
  logger?: ExecutionLogger;
}

export type ApprovalStrategy = "wait" | "fire-and-forget";

export interface SwapExecutionConfig {
  session: SessionDelegationInfo;
  environment: DeleGatorEnv;
  hybridDelegator: Address;
  intent: SwapIntent;
  amountInput: string;
  slippageBps: number;
  approvalStrategy?: ApprovalStrategy;
}

const toTokenAddress = (token: AllowedToken): Address => getAddress(token.address);

const isNativeToken = (token: AllowedToken, nativeTokenAddress: Address): boolean =>
  token.address.toLowerCase() === nativeTokenAddress.toLowerCase() || token.kind === "native";

const readTokenBalance = async (
  token: AllowedToken,
  owner: Address,
  publicClient: PublicClient,
  nativeTokenAddress: Address,
): Promise<bigint> => {
  if (isNativeToken(token, nativeTokenAddress)) {
    return publicClient.getBalance({ address: owner });
  }
  return (await publicClient.readContract({
    address: toTokenAddress(token),
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [owner],
  })) as bigint;
};

const ensureAllowance = async (
  token: AllowedToken,
  requiredAmount: bigint,
  session: SessionDelegationInfo,
  dependencies: SwapEngineDependencies,
  environment: DeleGatorEnv,
  hybridDelegator: Address,
  strategy: ApprovalStrategy,
) => {
  if (isNativeToken(token, dependencies.nativeTokenAddress)) return;

  const { publicClient, routerAddress, sessionWalletFactory, logger } = dependencies;

  const allowance = (await publicClient.readContract({
    address: toTokenAddress(token),
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [hybridDelegator, routerAddress],
  })) as bigint;

  if (allowance >= requiredAmount) return;

  const approveCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [routerAddress, requiredAmount],
  });

  const approveExecution = createExecution({
    target: toTokenAddress(token),
    value: 0n,
    callData: approveCalldata,
  });

  const sessionWallet = sessionWalletFactory(session);
  const txHash = await redeemDelegations(
    sessionWallet,
    publicClient,
    environment.DelegationManager as Address,
    [
      {
        permissionContext: [session.delegation],
        executions: [approveExecution],
        mode: ExecutionMode.SingleDefault,
      },
    ],
  );

  const symbol = token.symbol ?? token.address.slice(0, 6);
  emit(
    logger,
    "info",
    `Approving aggregator to spend ${formatUnits(requiredAmount, token.decimals)} ${symbol} (tx: ${txHash})`,
  );

  if (strategy === "wait") {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    emit(
      logger,
      "success",
      `Approval confirmed (tx: ${txHash}, block: ${receipt.blockNumber})`,
    );
  } else {
    void publicClient
      .waitForTransactionReceipt({ hash: txHash })
      .then((receipt) => {
        emit(
          logger,
          "success",
          `Approval confirmed (tx: ${txHash}, block: ${receipt.blockNumber})`,
        );
      })
      .catch((error) => {
        emit(
          logger,
          "warn",
          `Approval transaction ${txHash} failed to confirm: ${(error as Error).message}`,
        );
      });
  }
};

const resolveApprovalStrategy = (config: SwapExecutionConfig): ApprovalStrategy => {
  if (config.approvalStrategy) return config.approvalStrategy;
  const env = process.env.PRAGMA_SWAP_APPROVAL_STRATEGY?.toLowerCase();
  if (env === "wait") return "wait";
  if (env === "fire-and-forget") return "fire-and-forget";
  return "fire-and-forget";
};

export const executeSwapWithSession = async (
  config: SwapExecutionConfig,
  dependencies: SwapEngineDependencies,
): Promise<SwapResult> => {
  const { session, environment, hybridDelegator, intent, amountInput, slippageBps } = config;
  const { publicClient, sessionWalletFactory, quoteFetcher, nativeTokenAddress, wrappedNativeSymbol, nativeTokenSymbol, logger } =
    dependencies;

  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt <= now) {
    throw new Error(
      `Delegation expired at ${new Date(session.expiresAt * 1000).toISOString()} — reissue before swapping.`,
    );
  }

  const amountIn = parseUnits(amountInput, intent.from.decimals);
  if (amountIn <= 0n) {
    throw new Error("Swap amount must be greater than zero.");
  }

  const sessionWallet = sessionWalletFactory(session);
  const sessionKeyBalance = await publicClient.getBalance({ address: session.sessionKeyAddress });
  const SESSION_KEY_CRITICAL_THRESHOLD = 10_000_000_000_000_000n; // 0.01 MON
  const SESSION_KEY_WARN_THRESHOLD = 100_000_000_000_000_000n; // 0.1 MON
  if (sessionKeyBalance === 0n || sessionKeyBalance < SESSION_KEY_CRITICAL_THRESHOLD) {
    throw new Error(
      `Session key ${session.sessionKeyAddress} only has ${formatUnits(sessionKeyBalance, 18)} MON. Fund the session key (≥0.1 MON) before performing delegated swaps.`,
    );
  }
  if (sessionKeyBalance < SESSION_KEY_WARN_THRESHOLD) {
    emit(
      logger,
      "warn",
      `Session key balance is low: ${formatUnits(sessionKeyBalance, 18)} MON. Consider topping up to avoid failed transactions.`,
    );
  }

  const fromBalance = await readTokenBalance(intent.from, hybridDelegator, publicClient, nativeTokenAddress);
  if (fromBalance < amountIn) {
    const symbol = intent.from.symbol ?? nativeTokenSymbol ?? "token";
    throw new Error(
      `HybridDelegator ${hybridDelegator} has insufficient ${symbol} balance (${formatUnits(fromBalance, intent.from.decimals)}).`,
    );
  }

  const approvalStrategy = resolveApprovalStrategy(config);

  await ensureAllowance(intent.from, amountIn, session, dependencies, environment, hybridDelegator, approvalStrategy);

  const amountDecimal = formatUnits(amountIn, intent.from.decimals);
  const destination = getAddress(hybridDelegator);
  const sender = destination;

  const outputBalanceBeforeDelegator = await readTokenBalance(
    intent.to,
    hybridDelegator,
    publicClient,
    nativeTokenAddress,
  );
  const outputBalanceBeforeSession = await readTokenBalance(
    intent.to,
    session.sessionKeyAddress,
    publicClient,
    nativeTokenAddress,
  );

  const quote = await quoteFetcher({
    fromToken: toTokenAddress(intent.from),
    toToken: toTokenAddress(intent.to),
    amountDecimal,
    sender,
    destination,
    maxSlippageBps: slippageBps,
  });

  const isNativeInput = isNativeToken(intent.from, nativeTokenAddress);
  let valueForSwap = quote.transactionValue;
  if (isNativeInput) {
    if (valueForSwap === 0n) {
      valueForSwap = amountIn;
    } else if (valueForSwap !== amountIn) {
      emit(
        logger,
        "warn",
        `Quote value ${formatUnits(valueForSwap, intent.from.decimals)} differs from input ${formatUnits(amountIn, intent.from.decimals)}. Using input amount for native swap.`,
      );
      valueForSwap = amountIn;
    }
  } else if (valueForSwap !== 0n) {
    emit(
      logger,
      "warn",
      `Quote returned non-zero native value (${valueForSwap}) for ERC-20 input; this may indicate multi-asset routing.`,
    );
  }

  const swapExecution = createExecution({
    target: quote.aggregator,
    value: valueForSwap,
    callData: quote.transactionData,
  });

  let txHash: Hex;
  try {
    txHash = await redeemDelegations(
      sessionWallet,
      publicClient,
      environment.DelegationManager as Address,
      [
        {
          permissionContext: [session.delegation],
          executions: [swapExecution],
          mode: ExecutionMode.SingleDefault,
        },
      ],
    );
  } catch (error) {
    const message = (error as Error)?.message ?? "";
    if (/0x8199f5f3/i.test(message) || /SlippageExceeded/i.test(message)) {
      throw new Error(
        "Swap reverted with SlippageExceeded: the actual output dropped below the Monorail quote's minimum. Increase the slippage tolerance (e.g. --slippage-bps 300) or retry after obtaining a fresh quote.",
      );
    }
    const sessionKeyBalanceNow = await publicClient.getBalance({ address: session.sessionKeyAddress });
    if (sessionKeyBalanceNow < SESSION_KEY_CRITICAL_THRESHOLD) {
      throw new Error(
        `Delegated swap failed because session key ${session.sessionKeyAddress} only has ${formatUnits(sessionKeyBalanceNow, 18)} MON. Fund the session key (≥0.1 MON) and retry.`,
      );
    }
    throw error;
  }

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  const outputAfterDelegator = await readTokenBalance(intent.to, hybridDelegator, publicClient, nativeTokenAddress);
  const outputAfterSession = await readTokenBalance(
    intent.to,
    session.sessionKeyAddress,
    publicClient,
    nativeTokenAddress,
  );

  const deltaDelegator = outputAfterDelegator - outputBalanceBeforeDelegator;
  const deltaSession = outputAfterSession - outputBalanceBeforeSession;
  const amountOut = (deltaDelegator > 0n ? deltaDelegator : 0n) + (deltaSession > 0n ? deltaSession : 0n);

  const fromLabel = intent.from.symbol ?? nativeTokenSymbol ?? "token";
  const toLabel = intent.to.symbol ?? wrappedNativeSymbol ?? "token";

  emit(
    logger,
    "success",
    `Swap executed: ${formatUnits(amountIn, intent.from.decimals)} ${fromLabel} -> ${formatUnits(amountOut, intent.to.decimals)} ${toLabel} (tx: ${txHash}, block: ${receipt.blockNumber})`,
  );
  if (deltaDelegator > 0n && deltaSession <= 0n) {
    emit(
      logger,
      "info",
      `Destination ${destination} received ${formatUnits(deltaDelegator, intent.to.decimals)} ${toLabel}.`,
    );
  } else if (deltaSession > 0n && deltaDelegator <= 0n) {
    emit(
      logger,
      "info",
      `Session key ${session.sessionKeyAddress} received ${formatUnits(deltaSession, intent.to.decimals)} ${toLabel}.`,
    );
  }
  emit(
    logger,
    "info",
    `Quote ${quote.quoteId}: minimum out ${formatUnits(quote.rawMinOutput, intent.to.decimals)} ${toLabel}, slippage tolerance ${slippageBps / 100}%`,
  );

  return {
    txHash,
    amountIn,
    amountOut,
    amountOutDelegator: deltaDelegator > 0n ? deltaDelegator : 0n,
    amountOutSession: deltaSession > 0n ? deltaSession : 0n,
    minAmountOut: quote.rawMinOutput,
    quoteId: quote.quoteId,
    slippageToleranceBps: slippageBps,
    quote,
  };
};

export interface WrapConfig {
  session: SessionDelegationInfo;
  environment: DeleGatorEnv;
  hybridDelegator: Address;
  amountInput: string;
}

export interface WrapDependencies {
  publicClient: PublicClient;
  sessionWalletFactory: (session: SessionDelegationInfo) => WalletClient;
  wrappedNativeAddress: Address;
  nativeTokenSymbol?: string;
  wrappedNativeSymbol?: string;
  logger?: ExecutionLogger;
}

export const wrapNativeWithSession = async (
  config: WrapConfig,
  dependencies: WrapDependencies,
) => {
  const { session, environment, hybridDelegator, amountInput } = config;
  const { publicClient, sessionWalletFactory, wrappedNativeAddress, nativeTokenSymbol, wrappedNativeSymbol, logger } =
    dependencies;

  const amount = parseUnits(amountInput, 18);
  if (amount <= 0n) {
    throw new Error("Wrap amount must be greater than zero.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt <= now) {
    throw new Error("Delegation expired. Reissue before wrapping.");
  }

  const balance = await publicClient.getBalance({ address: hybridDelegator });
  if (balance < amount) {
    throw new Error(
      `HybridDelegator ${hybridDelegator} has insufficient ${nativeTokenSymbol ?? "MON"} balance (${formatUnits(balance, 18)}).`,
    );
  }

  const sessionWallet = sessionWalletFactory(session);
  const execution = createExecution({
    target: getAddress(wrappedNativeAddress),
    value: amount,
    callData: encodeFunctionData({ abi: WRAPPED_NATIVE_ABI, functionName: "deposit" }),
  });

  const txHash = await redeemDelegations(
    sessionWallet,
    publicClient,
    environment.DelegationManager as Address,
    [
      {
        permissionContext: [session.delegation],
        executions: [execution],
        mode: ExecutionMode.SingleDefault,
      },
    ],
  );

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const wrappedBalance = (await publicClient.readContract({
    address: getAddress(wrappedNativeAddress),
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [hybridDelegator],
  })) as bigint;

  emit(
    logger,
    "success",
    `Wrapped ${formatUnits(amount, 18)} ${nativeTokenSymbol ?? "MON"} -> ${formatUnits(wrappedBalance, 18)} ${wrappedNativeSymbol ?? "WMON"} (tx: ${txHash}, block: ${receipt.blockNumber})`,
  );

  return { txHash, amount };
};

export const unwrapNativeWithSession = async (
  config: WrapConfig,
  dependencies: WrapDependencies,
) => {
  const { session, environment, hybridDelegator, amountInput } = config;
  const { publicClient, sessionWalletFactory, wrappedNativeAddress, nativeTokenSymbol, wrappedNativeSymbol, logger } =
    dependencies;

  const amount = parseUnits(amountInput, 18);
  if (amount <= 0n) {
    throw new Error("Unwrap amount must be greater than zero.");
  }

  const wrappedBalance = (await publicClient.readContract({
    address: getAddress(wrappedNativeAddress),
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [hybridDelegator],
  })) as bigint;

  if (wrappedBalance < amount) {
    throw new Error(
      `HybridDelegator ${hybridDelegator} has insufficient ${wrappedNativeSymbol ?? "WMON"} balance (${formatUnits(wrappedBalance, 18)}).`,
    );
  }

  const sessionWallet = sessionWalletFactory(session);
  const execution = createExecution({
    target: getAddress(wrappedNativeAddress),
    value: 0n,
    callData: encodeFunctionData({
      abi: WRAPPED_NATIVE_ABI,
      functionName: "withdraw",
      args: [amount],
    }),
  });

  const txHash = await redeemDelegations(
    sessionWallet,
    publicClient,
    environment.DelegationManager as Address,
    [
      {
        permissionContext: [session.delegation],
        executions: [execution],
        mode: ExecutionMode.SingleDefault,
      },
    ],
  );

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  emit(
    logger,
    "success",
    `Unwrapped ${formatUnits(amount, 18)} ${wrappedNativeSymbol ?? "WMON"} -> ${nativeTokenSymbol ?? "MON"} (tx: ${txHash})`,
  );

  return { txHash, amount };
};
