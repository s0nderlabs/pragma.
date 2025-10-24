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
import { ExecutionMode, type ExecutionStruct, contracts, createExecution, redeemDelegations } from "@metamask/delegation-toolkit";

import type { AllowedToken } from "../monorail/tokens.js";
import type { SessionDelegationInfo, DeleGatorEnv } from "../delegations/types.js";
import type { MonorailQuote, QuoteRequestParams } from "../monorail/pathfinder.js";
import { patchMonorailMinOutput } from "../monorail/calldataPatcher.js";
import { createErrorFromCode } from "../errors/index.js";
import { callWithRpcFallback, callWithRetry } from "../utils/rpcFallback.js";

const WAIT_FOR_RECEIPT_TIMEOUT_MS = 5_000;

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

export interface SwapPreviewConfig {
  session: SessionDelegationInfo;
  environment: DeleGatorEnv;
  hybridDelegator: Address;
  intent: SwapIntent;
  amountInput: string;
  slippageBps: number;
}

export interface SwapPreviewPlan {
  amountIn: bigint;
  quote: MonorailQuote;
  minAmountOut: bigint;
  expectedAmountOut: bigint;
  valueForSwap: bigint;
  execution: ExecutionStruct;
  redeemCalldata: Hex;
  simulationReturn?: Hex;
  gasEstimate?: bigint;
  warnings: string[];
  planHash?: Hex;
}

export interface SwapPreviewContext {
  sessionKeyBalance: bigint;
  fromTokenBalance: bigint;
}

export interface SwapPreviewResult {
  plan: SwapPreviewPlan;
  context: SwapPreviewContext;
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
  blockNumber: bigint;
  gasUsed: bigint;
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
  fallbackPublicClient?: PublicClient;
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
  preparedPlan?: SwapPreviewPlan;
}

const toTokenAddress = (token: AllowedToken): Address => getAddress(token.address);

const isNativeToken = (token: AllowedToken, nativeTokenAddress: Address): boolean =>
  token.address.toLowerCase() === nativeTokenAddress.toLowerCase() || token.kind === "native";

const readTokenBalance = async (
  token: AllowedToken,
  owner: Address,
  publicClient: PublicClient,
  fallbackClient: PublicClient | undefined,
  nativeTokenAddress: Address,
): Promise<bigint> => {
  if (isNativeToken(token, nativeTokenAddress)) {
    return callWithRpcFallback(publicClient, fallbackClient, (client) =>
      client.getBalance({ address: owner }),
    );
  }
  return (await callWithRpcFallback(publicClient, fallbackClient, (client) =>
    client.readContract({
      address: toTokenAddress(token),
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [owner],
    }),
  )) as bigint;
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

  const { publicClient, fallbackPublicClient, routerAddress, sessionWalletFactory, logger } = dependencies;

  const allowance = (await callWithRpcFallback(publicClient, fallbackPublicClient, (client) =>
    client.readContract({
      address: toTokenAddress(token),
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [hybridDelegator, routerAddress],
    }),
  )) as bigint;

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
  const txHash = await callWithRpcFallback(publicClient, fallbackPublicClient, (client) =>
    redeemDelegations(
      sessionWallet,
      client,
      environment.DelegationManager as Address,
      [
        {
          permissionContext: [session.delegation],
          executions: [approveExecution],
          mode: ExecutionMode.SingleDefault,
        },
      ],
    ),
  );

  const symbol = token.symbol ?? token.address.slice(0, 6);
  emit(
    logger,
    "info",
    `Approving aggregator to spend ${formatUnits(requiredAmount, token.decimals)} ${symbol} (tx: ${txHash})`,
  );

  if (strategy === "wait") {
    const receipt = await callWithRpcFallback(publicClient, fallbackPublicClient, (client) =>
      client.waitForTransactionReceipt({ hash: txHash, timeout: WAIT_FOR_RECEIPT_TIMEOUT_MS }),
    );
    emit(
      logger,
      "success",
      `Approval confirmed (tx: ${txHash}, block: ${receipt.blockNumber})`,
    );
  } else {
    void callWithRpcFallback(publicClient, fallbackPublicClient, (client) =>
      client.waitForTransactionReceipt({ hash: txHash, timeout: WAIT_FOR_RECEIPT_TIMEOUT_MS }),
    )
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

export const previewSwapWithSession = async (
  config: SwapPreviewConfig,
  dependencies: SwapEngineDependencies,
): Promise<SwapPreviewResult> => {
  const { session, environment, hybridDelegator, intent, amountInput, slippageBps } = config;
  const { publicClient, fallbackPublicClient, quoteFetcher, nativeTokenAddress, routerAddress, logger } = dependencies;

  const warnings: string[] = [];

  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt <= now) {
    throw createErrorFromCode("SIM_PREVIEW_EXPIRED", {
      message: `Delegation expired at ${new Date(session.expiresAt * 1000).toISOString()} - reissue before swapping.`,
      context: {
        session_key_id: session.sessionKeyAddress,
        delegation_expires_at: session.expiresAt,
      },
    });
  }

  const amountIn = parseUnits(amountInput, intent.from.decimals);
  if (amountIn <= 0n) {
    throw createErrorFromCode("AMOUNT_MALFORMED", {
      message: "Swap amount must be greater than zero.",
    });
  }

  const sessionKeyBalance = await callWithRpcFallback(publicClient, fallbackPublicClient, (client) =>
    client.getBalance({ address: session.sessionKeyAddress }),
  );
  if (sessionKeyBalance === 0n) {
    throw createErrorFromCode("SIM_BALANCE_TOO_LOW", {
      message: `Session key ${session.sessionKeyAddress} has zero MON. Fund the session key before performing delegated swaps.`,
      context: {
        session_key_id: session.sessionKeyAddress,
      },
    });
  }

  const fromBalance = await callWithRetry(() =>
    readTokenBalance(
      intent.from,
      hybridDelegator,
      publicClient,
      fallbackPublicClient,
      nativeTokenAddress,
    ),
  );
  if (fromBalance < amountIn) {
    const symbol = intent.from.symbol ?? nativeTokenAddress.slice(0, 6);
    throw createErrorFromCode("SIM_BALANCE_TOO_LOW", {
      message: `HybridDelegator ${hybridDelegator} has insufficient ${symbol} balance (${formatUnits(fromBalance, intent.from.decimals)}).`,
      context: {
        delegator: hybridDelegator,
        token: intent.from.address,
      },
    });
  }

  const amountDecimal = formatUnits(amountIn, intent.from.decimals);
  const destination = getAddress(hybridDelegator);
  const sender = destination;

  const applyQuote = (quoteCandidate: MonorailQuote) => {
    const isNativeInput = isNativeToken(intent.from, nativeTokenAddress);
    let valueForSwap = quoteCandidate.transactionValue;
    if (isNativeInput) {
      if (valueForSwap === 0n) {
        valueForSwap = amountIn;
      } else if (valueForSwap !== amountIn) {
        warnings.push(
          `Quote value ${formatUnits(valueForSwap, intent.from.decimals)} differs from input ${formatUnits(amountIn, intent.from.decimals)}. Using input amount for native swap.`,
        );
        valueForSwap = amountIn;
      }
    } else if (valueForSwap !== 0n) {
      warnings.push(
        `Quote returned non-zero native value (${valueForSwap}) for ERC-20 input; this may indicate multi-asset routing.`,
      );
    }

    if (routerAddress && quoteCandidate.aggregator.toLowerCase() !== routerAddress.toLowerCase()) {
      warnings.push(
        `Quote aggregator ${quoteCandidate.aggregator} does not match configured router ${routerAddress}. Ensure the allowlist is up to date.`,
      );
    }

    const execution = createExecution({
      target: quoteCandidate.aggregator,
      value: valueForSwap,
      callData: quoteCandidate.transactionData,
    });

    return { quote: quoteCandidate, valueForSwap, execution };
  };

  const initialQuote = await quoteFetcher({
    fromToken: toTokenAddress(intent.from),
    toToken: toTokenAddress(intent.to),
    amountDecimal,
    sender,
    destination,
    maxSlippageBps: slippageBps,
  });

  // Patch Monorail's buggy calldata (API always uses 0.5% instead of user's slippage)
  const patchResult = patchMonorailMinOutput(
    initialQuote.transactionData,
    initialQuote.rawOutput,
    slippageBps
  );
  initialQuote.transactionData = patchResult.patchedCalldata;
  // Only update rawMinOutput if patching actually succeeded (i.e., it was a valid Monorail call)
  if (patchResult.tradesPatched > 0) {
    initialQuote.rawMinOutput = patchResult.patchedMinOutput;
  }

  const { quote, valueForSwap, execution: swapExecution } = applyQuote(initialQuote);

  const redeemCalldata = contracts.DelegationManager.encode.redeemDelegations({
    delegations: [[session.delegation]],
    modes: [ExecutionMode.SingleDefault],
    executions: [[swapExecution]],
  });

  const expectedOut = quote.rawOutput;
  const policyMin = expectedOut > 0n ? (expectedOut * BigInt(10_000 - slippageBps)) / 10_000n : 0n;
  if (quote.rawMinOutput < policyMin) {
    throw createErrorFromCode("SIM_MIN_OUT_NOT_MET", {
      message: `Quoted minimum output is below the policy floor (${formatUnits(policyMin, intent.to.decimals)} ${intent.to.symbol ?? intent.to.address.slice(0, 6)}).`,
      context: {
        token_in: intent.from.address,
        token_out: intent.to.address,
        min_out: formatUnits(quote.rawMinOutput, intent.to.decimals),
      },
    });
  }

  return {
    plan: {
      amountIn,
      quote,
      minAmountOut: quote.rawMinOutput,
      expectedAmountOut: expectedOut,
      valueForSwap,
      execution: swapExecution,
      redeemCalldata,
      simulationReturn: undefined,
      gasEstimate: undefined,
      warnings,
    },
    context: {
      sessionKeyBalance,
      fromTokenBalance: fromBalance,
    },
  };
};

const resolveApprovalStrategy = (config: SwapExecutionConfig): ApprovalStrategy => {
  if (config.approvalStrategy) return config.approvalStrategy;
  const env = process.env.PRAGMA_SWAP_APPROVAL_STRATEGY?.toLowerCase();
  if (env === "wait") return "wait";
  if (env === "fire-and-forget") return "fire-and-forget";
  return "wait"; // Wait for approval to prevent nonce race with swap tx
};

export const executeSwapWithSession = async (
  config: SwapExecutionConfig,
  dependencies: SwapEngineDependencies,
): Promise<SwapResult> => {
  const { session, environment, hybridDelegator, intent, amountInput, slippageBps, preparedPlan } = config;
  const {
    publicClient,
    fallbackPublicClient,
    sessionWalletFactory,
    quoteFetcher,
    nativeTokenAddress,
    wrappedNativeSymbol,
    nativeTokenSymbol,
    logger,
  } =
    dependencies;

  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt <= now) {
    throw createErrorFromCode("SIM_PREVIEW_EXPIRED", {
      message: `Delegation expired at ${new Date(session.expiresAt * 1000).toISOString()} - reissue before swapping.`,
      context: {
        session_key_id: session.sessionKeyAddress,
        delegation_expires_at: session.expiresAt,
      },
    });
  }

  let amountIn = parseUnits(amountInput, intent.from.decimals);
  if (amountIn <= 0n) {
    throw createErrorFromCode("AMOUNT_MALFORMED", {
      message: "Swap amount must be greater than zero.",
    });
  }

  if (preparedPlan) {
    if (preparedPlan.amountIn <= 0n) {
      throw createErrorFromCode("AMOUNT_MALFORMED", {
        message: "Prepared swap plan has invalid amount (<= 0).",
      });
    }
    amountIn = preparedPlan.amountIn;
  }

  const sessionWallet = sessionWalletFactory(session);
  const sessionKeyBalance = await callWithRpcFallback(publicClient, fallbackPublicClient, (client) =>
    client.getBalance({ address: session.sessionKeyAddress }),
  );
  const SESSION_KEY_CRITICAL_THRESHOLD = 10_000_000_000_000_000n; // 0.01 MON
  const SESSION_KEY_WARN_THRESHOLD = 100_000_000_000_000_000n; // 0.1 MON
  if (sessionKeyBalance === 0n || sessionKeyBalance < SESSION_KEY_CRITICAL_THRESHOLD) {
    throw createErrorFromCode("SIM_BALANCE_TOO_LOW", {
      message: `Session key ${session.sessionKeyAddress} only has ${formatUnits(sessionKeyBalance, 18)} MON. Fund the session key (≥0.1 MON) before performing delegated swaps.`,
      context: {
        session_key_id: session.sessionKeyAddress,
      },
    });
  }
  if (sessionKeyBalance < SESSION_KEY_WARN_THRESHOLD) {
    emit(
      logger,
      "warn",
      `Session key balance is low: ${formatUnits(sessionKeyBalance, 18)} MON. Consider topping up to avoid failed transactions.`,
    );
  }

  const fromBalance = await callWithRetry(() =>
    readTokenBalance(
      intent.from,
      hybridDelegator,
      publicClient,
      fallbackPublicClient,
      nativeTokenAddress,
    ),
  );
  if (fromBalance < amountIn) {
    const symbol = intent.from.symbol ?? nativeTokenSymbol ?? "token";
    throw createErrorFromCode("SIM_BALANCE_TOO_LOW", {
      message: `HybridDelegator ${hybridDelegator} has insufficient ${symbol} balance (${formatUnits(fromBalance, intent.from.decimals)}).`,
      context: {
        delegator: hybridDelegator,
        token: intent.from.address,
      },
    });
  }

  const approvalStrategy = resolveApprovalStrategy(config);

  await ensureAllowance(intent.from, amountIn, session, dependencies, environment, hybridDelegator, approvalStrategy);

  const destination = getAddress(hybridDelegator);
  const sender = destination;

  const outputBalanceBeforeDelegator = await readTokenBalance(
    intent.to,
    hybridDelegator,
    publicClient,
    fallbackPublicClient,
    nativeTokenAddress,
  );
  const outputBalanceBeforeSession = await readTokenBalance(
    intent.to,
    session.sessionKeyAddress,
    publicClient,
    fallbackPublicClient,
    nativeTokenAddress,
  );

  let quote: MonorailQuote;
  let valueForSwap: bigint;
  let swapExecution: ExecutionStruct;

  if (preparedPlan) {
    quote = preparedPlan.quote;
    valueForSwap = preparedPlan.valueForSwap;
    swapExecution = preparedPlan.execution;
  } else {
    const amountDecimal = formatUnits(amountIn, intent.from.decimals);
    quote = await quoteFetcher({
      fromToken: toTokenAddress(intent.from),
      toToken: toTokenAddress(intent.to),
      amountDecimal,
      sender,
      destination,
      maxSlippageBps: slippageBps,
    });

    // Patch Monorail's buggy calldata (API always uses 0.5% instead of user's slippage)
    const patchResult = patchMonorailMinOutput(
      quote.transactionData,
      quote.rawOutput,
      slippageBps
    );
    quote.transactionData = patchResult.patchedCalldata;
    // Only update rawMinOutput if patching actually succeeded (i.e., it was a valid Monorail call)
    if (patchResult.tradesPatched > 0) {
      quote.rawMinOutput = patchResult.patchedMinOutput;
    }

    const isNativeInput = isNativeToken(intent.from, nativeTokenAddress);
    valueForSwap = quote.transactionValue;
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

    swapExecution = createExecution({
      target: quote.aggregator,
      value: valueForSwap,
      callData: quote.transactionData,
    });
  }

  let txHash: Hex;
  try {
    txHash = await callWithRpcFallback(publicClient, fallbackPublicClient, (client) =>
      redeemDelegations(
        sessionWallet,
        client,
        environment.DelegationManager as Address,
        [
          {
            permissionContext: [session.delegation],
            executions: [swapExecution],
            mode: ExecutionMode.SingleDefault,
          },
        ],
      ),
    );
  } catch (error) {
    const message = (error as Error)?.message ?? "";

    // Handle Monorail aggregator slippage errors (now rare due to patching)
    if (/0x8199f5f3/i.test(message) || /SlippageExceeded/i.test(message)) {
      throw createErrorFromCode("EXEC_ROUTER_REVERT", {
        message:
          "Swap reverted with SlippageExceeded: the actual output dropped below the Monorail quote's minimum. Increase tolerance or refresh the quote.",
        cause: error,
      });
    }

    // Handle DEX router insufficient output errors (ZFRouter, StageSwap, etc.)
    if (/INSUFFICIENT_OUTPUT_AMOUNT/i.test(message)) {
      const routerMatch = message.match(/([\w]+Router|[\w]+Swap):/);
      const routerName = routerMatch ? routerMatch[1] : "DEX router";
      throw createErrorFromCode("EXEC_ROUTER_REVERT", {
        message: `Swap failed due to high price impact on ${routerName}. The actual output would be less than your minimum (${slippageBps / 100}% slippage tolerance). Try: (1) Increase slippage to 5-10%, (2) Reduce swap amount, or (3) Wait and retry.`,
        cause: error,
      });
    }
    const sessionKeyBalanceNow = await callWithRpcFallback(publicClient, fallbackPublicClient, (client) =>
      client.getBalance({ address: session.sessionKeyAddress }),
    );
    if (sessionKeyBalanceNow < SESSION_KEY_CRITICAL_THRESHOLD) {
      throw createErrorFromCode("SIM_BALANCE_TOO_LOW", {
        message: `Delegated swap failed because session key ${session.sessionKeyAddress} only has ${formatUnits(sessionKeyBalanceNow, 18)} MON. Fund the session key (≥0.1 MON) and retry.`,
        context: { session_key_id: session.sessionKeyAddress },
        cause: error,
      });
    }
    throw error;
  }

  const receipt = await callWithRpcFallback(publicClient, fallbackPublicClient, (client) =>
    client.waitForTransactionReceipt({ hash: txHash, timeout: WAIT_FOR_RECEIPT_TIMEOUT_MS }),
  );

  const outputAfterDelegator = await readTokenBalance(
    intent.to,
    hybridDelegator,
    publicClient,
    fallbackPublicClient,
    nativeTokenAddress,
  );
  const outputAfterSession = await readTokenBalance(
    intent.to,
    session.sessionKeyAddress,
    publicClient,
    fallbackPublicClient,
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
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed ?? 0n,
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
  fallbackPublicClient?: PublicClient;
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
  const {
    publicClient,
    fallbackPublicClient,
    sessionWalletFactory,
    wrappedNativeAddress,
    nativeTokenSymbol,
    wrappedNativeSymbol,
    logger,
  } =
    dependencies;

  const amount = parseUnits(amountInput, 18);
  if (amount <= 0n) {
    throw createErrorFromCode("AMOUNT_MALFORMED", {
      message: "Wrap amount must be greater than zero.",
    });
  }

  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt <= now) {
    throw createErrorFromCode("SIM_PREVIEW_EXPIRED", {
      message: "Delegation expired. Reissue before wrapping.",
      context: { session_key_id: session.sessionKeyAddress },
    });
  }

  const balance = await callWithRpcFallback(publicClient, fallbackPublicClient, (client) =>
    client.getBalance({ address: hybridDelegator }),
  );
  if (balance < amount) {
    throw createErrorFromCode("SIM_BALANCE_TOO_LOW", {
      message: `HybridDelegator ${hybridDelegator} has insufficient ${nativeTokenSymbol ?? "MON"} balance (${formatUnits(balance, 18)}).`,
      context: { delegator: hybridDelegator, token: nativeTokenSymbol ?? "MON" },
    });
  }

  const sessionWallet = sessionWalletFactory(session);
  const execution = createExecution({
    target: getAddress(wrappedNativeAddress),
    value: amount,
    callData: encodeFunctionData({ abi: WRAPPED_NATIVE_ABI, functionName: "deposit" }),
  });

  const txHash = await callWithRpcFallback(publicClient, fallbackPublicClient, (client) =>
    redeemDelegations(
      sessionWallet,
      client,
      environment.DelegationManager as Address,
      [
        {
          permissionContext: [session.delegation],
          executions: [execution],
          mode: ExecutionMode.SingleDefault,
        },
      ],
    ),
  );

  const receipt = await callWithRpcFallback(publicClient, fallbackPublicClient, (client) =>
    client.waitForTransactionReceipt({ hash: txHash, timeout: WAIT_FOR_RECEIPT_TIMEOUT_MS }),
  );
  const wrappedBalance = (await callWithRpcFallback(publicClient, fallbackPublicClient, (client) =>
    client.readContract({
      address: getAddress(wrappedNativeAddress),
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [hybridDelegator],
    }),
  )) as bigint;

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
  const {
    publicClient,
    fallbackPublicClient,
    sessionWalletFactory,
    wrappedNativeAddress,
    nativeTokenSymbol,
    wrappedNativeSymbol,
    logger,
  } = dependencies;

  const amount = parseUnits(amountInput, 18);
  if (amount <= 0n) {
    throw createErrorFromCode("AMOUNT_MALFORMED", {
      message: "Unwrap amount must be greater than zero.",
    });
  }

  const wrappedBalance = (await callWithRpcFallback(publicClient, fallbackPublicClient, (client) =>
    client.readContract({
      address: getAddress(wrappedNativeAddress),
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [hybridDelegator],
    }),
  )) as bigint;

  if (wrappedBalance < amount) {
    throw createErrorFromCode("SIM_BALANCE_TOO_LOW", {
      message: `HybridDelegator ${hybridDelegator} has insufficient ${wrappedNativeSymbol ?? "WMON"} balance (${formatUnits(wrappedBalance, 18)}).`,
      context: { delegator: hybridDelegator, token: wrappedNativeAddress },
    });
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

  const txHash = await callWithRpcFallback(publicClient, fallbackPublicClient, (client) =>
    redeemDelegations(
      sessionWallet,
      client,
      environment.DelegationManager as Address,
      [
        {
          permissionContext: [session.delegation],
          executions: [execution],
          mode: ExecutionMode.SingleDefault,
        },
      ],
    ),
  );

  await callWithRpcFallback(publicClient, fallbackPublicClient, (client) =>
    client.waitForTransactionReceipt({ hash: txHash, timeout: WAIT_FOR_RECEIPT_TIMEOUT_MS }),
  );

  emit(
    logger,
    "success",
    `Unwrapped ${formatUnits(amount, 18)} ${wrappedNativeSymbol ?? "WMON"} -> ${nativeTokenSymbol ?? "MON"} (tx: ${txHash})`,
  );

  return { txHash, amount };
};
