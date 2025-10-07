import chalk from "chalk";
import {
  Address,
  Hex,
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ExecutionMode, createExecution, redeemDelegations } from "@metamask/delegation-toolkit";

import type { SessionDelegationInfo, DeleGatorEnv } from "./onboarding4337.js";
import { createMonadPublicClient, monadChain } from "./web3authClients.js";
import { fetchMonorailQuote, type MonorailQuote, type RouteSummary } from "./monorailPathfinder.js";
import {
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONAD_RPC_URL,
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_WRAPPED_TOKEN_SYMBOL,
  PRAGMA_ADMIN_TEST_PK,
  MONAD_WMON_ADDRESS,
} from "./config.js";
import type { AllowedToken } from "./monorailTokens.js";
import { ROUTER, setupHybridDelegatorTest } from "./onboarding4337.js";

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

const WMON_ABI = [
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
  minAmountOut: bigint;
  quoteId: string;
  slippageToleranceBps: number;
  quote: MonorailQuote;
}

export interface SwapExecutionConfig {
  session: SessionDelegationInfo;
  environment: DeleGatorEnv;
  hybridDelegator: Address;
  intent: SwapIntent;
  amountInput: string;
  slippageBps: number;
  logPrefix?: string;
}

export interface WrapConfig {
  session: SessionDelegationInfo;
  environment: DeleGatorEnv;
  hybridDelegator: Address;
  amountInput: string;
  logPrefix?: string;
}

export interface UnwrapConfig extends WrapConfig {}

export const isNativeToken = (token: AllowedToken): boolean =>
  token.address.toLowerCase() === MONAD_NATIVE_TOKEN_ADDRESS.toLowerCase() || token.kind === "native";

const toTokenAddress = (token: AllowedToken): Address => getAddress(token.address);

const createSessionWallet = (session: SessionDelegationInfo) => {
  const account = privateKeyToAccount(session.sessionKeyPrivateKey as Hex);
  return createWalletClient({
    chain: monadChain,
    transport: http(MONAD_RPC_URL),
    account,
  });
};

const readTokenBalance = async (
  token: AllowedToken,
  publicClient: ReturnType<typeof createMonadPublicClient>,
  owner: Address,
): Promise<bigint> => {
  if (isNativeToken(token)) {
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
  publicClient: ReturnType<typeof createMonadPublicClient>,
  environment: DeleGatorEnv,
  hybridDelegator: Address,
  sessionWallet: ReturnType<typeof createSessionWallet>,
  prefix?: string,
) => {
  if (isNativeToken(token)) return;

  const allowance = (await publicClient.readContract({
    address: toTokenAddress(token),
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [hybridDelegator, ROUTER],
  })) as bigint;

  if (allowance >= requiredAmount) return;

  const approveCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [ROUTER, requiredAmount],
  });

  const approveExecution = createExecution({
    target: toTokenAddress(token),
    value: 0n,
    callData: approveCalldata,
  });

  const txHash = await redeemDelegations(sessionWallet, publicClient, environment.DelegationManager as Address, [
    {
      permissionContext: [session.delegation],
      executions: [approveExecution],
      mode: ExecutionMode.SingleDefault,
    },
  ]);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const symbol = token.symbol ?? token.address.slice(0, 6);
  const prefixLabel = prefix ? `${prefix} ` : "";
  console.log(
    chalk.green(
      `${prefixLabel}Approved Monorail aggregator to spend ${formatUnits(requiredAmount, token.decimals)} ${symbol} (tx: ${txHash}, block: ${receipt.blockNumber})`,
    ),
  );
};

export const executeSwapWithSession = async ({
  session,
  environment,
  hybridDelegator,
  intent,
  amountInput,
  slippageBps,
  logPrefix,
}: SwapExecutionConfig): Promise<SwapResult> => {
  const prefix = logPrefix ? `${logPrefix} ` : "";
  const publicClient = createMonadPublicClient();

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

  const sessionWallet = createSessionWallet(session);

  const fromBalance = await readTokenBalance(intent.from, publicClient, hybridDelegator);
  if (fromBalance < amountIn) {
    const symbol = intent.from.symbol ?? MONAD_NATIVE_TOKEN_SYMBOL ?? "token";
    throw new Error(
      `HybridDelegator ${hybridDelegator} has insufficient ${symbol} balance (${formatUnits(fromBalance, intent.from.decimals)}).`,
    );
  }

  await ensureAllowance(
    intent.from,
    amountIn,
    session,
    publicClient,
    environment,
    hybridDelegator,
    sessionWallet,
    logPrefix,
  );

  const amountDecimal = formatUnits(amountIn, intent.from.decimals);
  const destination = getAddress(hybridDelegator);
  const sender = destination;

  const outputBalanceBefore = await readTokenBalance(intent.to, publicClient, hybridDelegator);

  const quote = await fetchMonorailQuote({
    fromToken: toTokenAddress(intent.from),
    toToken: toTokenAddress(intent.to),
    amountDecimal,
    sender,
    destination,
    maxSlippageBps: slippageBps,
  });

  const valueForSwap = quote.transactionValue;
  if (isNativeToken(intent.from) && valueForSwap !== amountIn) {
    console.log(
      chalk.yellow(
        `${prefix}Warning: native swap quote value ${valueForSwap} differs from input ${amountIn}. Proceeding with quoted value.`,
      ),
    );
  }
  if (!isNativeToken(intent.from) && valueForSwap !== 0n) {
    console.log(
      chalk.yellow(
        `${prefix}Quote returned non-zero MON value for ERC-20 input (${valueForSwap}). This may indicate multi-asset routing.`,
      ),
    );
  }
  const swapExecution = createExecution({
    target: quote.aggregator,
    value: valueForSwap,
    callData: quote.transactionData,
  });

  const txHash = await redeemDelegations(sessionWallet, publicClient, environment.DelegationManager as Address, [
    {
      permissionContext: [session.delegation],
      executions: [swapExecution],
      mode: ExecutionMode.SingleDefault,
    },
  ]);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  const outputAfter = await readTokenBalance(intent.to, publicClient, hybridDelegator);
  const amountOut = outputAfter > outputBalanceBefore ? outputAfter - outputBalanceBefore : 0n;

  const fromLabel = intent.from.symbol ?? MONAD_NATIVE_TOKEN_SYMBOL ?? "token";
  const toLabel = intent.to.symbol ?? MONAD_WRAPPED_TOKEN_SYMBOL ?? "token";

  const amountOutDisplay = formatUnits(amountOut, intent.to.decimals);
  const minOutDisplay = formatUnits(quote.rawMinOutput, intent.to.decimals);

  console.log(
    chalk.green(
      `${prefix}Swap executed: ${formatUnits(amountIn, intent.from.decimals)} ${fromLabel} -> ${amountOutDisplay} ${toLabel} (tx: ${txHash}, block: ${receipt.blockNumber})`,
    ),
  );
  console.log(
    chalk.cyan(
      `${prefix}Quote ${quote.quoteId}: min out ${minOutDisplay} ${toLabel}, slippage tolerance ${slippageBps / 100}%`,
    ),
  );

  return {
    txHash,
    amountIn,
    amountOut,
    minAmountOut: quote.rawMinOutput,
    quoteId: quote.quoteId,
    slippageToleranceBps: slippageBps,
    quote,
  };
};

export const wrapNativeWithSession = async ({
  session,
  environment,
  hybridDelegator,
  amountInput,
  logPrefix,
}: WrapConfig) => {
  const prefix = logPrefix ? `${logPrefix} ` : "";
  const amount = parseUnits(amountInput, 18);
  if (amount <= 0n) {
    throw new Error("Wrap amount must be greater than zero.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt <= now) {
    throw new Error("Delegation expired. Reissue before wrapping.");
  }

  const publicClient = createMonadPublicClient();
  const balance = await publicClient.getBalance({ address: hybridDelegator });
  if (balance < amount) {
    throw new Error(
      `HybridDelegator ${hybridDelegator} has insufficient MON balance (${formatUnits(balance, 18)}).`,
    );
  }

  const sessionWallet = createSessionWallet(session);
  const execution = createExecution({
    target: getAddress(MONAD_WMON_ADDRESS),
    value: amount,
    callData: encodeFunctionData({ abi: WMON_ABI, functionName: "deposit" }),
  });

  const txHash = await redeemDelegations(sessionWallet, publicClient, environment.DelegationManager as Address, [
    {
      permissionContext: [session.delegation],
      executions: [execution],
      mode: ExecutionMode.SingleDefault,
    },
  ]);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const wrappedBalance = (await publicClient.readContract({
    address: getAddress(MONAD_WMON_ADDRESS),
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [hybridDelegator],
  })) as bigint;

  console.log(
    chalk.green(
      `${prefix}Wrapped ${formatUnits(amount, 18)} ${MONAD_NATIVE_TOKEN_SYMBOL ?? "MON"} -> ${formatUnits(wrappedBalance, 18)} ${MONAD_WRAPPED_TOKEN_SYMBOL ?? "WMON"} (tx: ${txHash}, block: ${receipt.blockNumber})`,
    ),
  );

  return { txHash, amount };
};

export const unwrapNativeWithSession = async ({
  session,
  environment,
  hybridDelegator,
  amountInput,
  logPrefix,
}: UnwrapConfig) => {
  const prefix = logPrefix ? `${logPrefix} ` : "";
  const amount = parseUnits(amountInput, 18);
  if (amount <= 0n) {
    throw new Error("Unwrap amount must be greater than zero.");
  }

  const publicClient = createMonadPublicClient();
  const wrappedBalance = (await publicClient.readContract({
    address: getAddress(MONAD_WMON_ADDRESS),
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [hybridDelegator],
  })) as bigint;

  if (wrappedBalance < amount) {
    throw new Error(
      `HybridDelegator ${hybridDelegator} has insufficient ${MONAD_WRAPPED_TOKEN_SYMBOL ?? "WMON"} balance (${formatUnits(wrappedBalance, 18)}).`,
    );
  }

  const sessionWallet = createSessionWallet(session);
  const execution = createExecution({
    target: getAddress(MONAD_WMON_ADDRESS),
    value: 0n,
    callData: encodeFunctionData({ abi: WMON_ABI, functionName: "withdraw", args: [amount] }),
  });

  const txHash = await redeemDelegations(sessionWallet, publicClient, environment.DelegationManager as Address, [
    {
      permissionContext: [session.delegation],
      executions: [execution],
      mode: ExecutionMode.SingleDefault,
    },
  ]);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const nativeBalance = await publicClient.getBalance({ address: hybridDelegator });

  console.log(
    chalk.green(
      `${prefix}Unwrapped ${formatUnits(amount, 18)} ${MONAD_WRAPPED_TOKEN_SYMBOL ?? "WMON"} -> ${formatUnits(nativeBalance, 18)} ${MONAD_NATIVE_TOKEN_SYMBOL ?? "MON"} (tx: ${txHash}, block: ${receipt.blockNumber})`,
    ),
  );

  return { txHash, amount };
};

export const logDisabledFeature = (feature: string) => {
  console.log(
    chalk.yellow(`${feature} is disabled while the Monad integration is incomplete. Please retry soon.`),
  );
};

export const runSwapTest = async (mode: "safe" | "normal" = "safe") => {
  const context = await setupHybridDelegatorTest(mode, { logSessionSummaries: true });
  const session = context.sessionDelegations.find((entry) => entry.mode === mode);
  if (!session) {
    throw new Error(`No session delegation generated for mode ${mode}.`);
  }

  const tokens = session.allowedTokens ?? [];
  if (tokens.length < 2) {
    throw new Error(
      "Swap test requires at least two tokens in the delegation allowlist. Update the delegation configuration and retry.",
    );
  }

  const fromToken = tokens.find((token) => isNativeToken(token)) ?? tokens[0];
  if (!isNativeToken(fromToken)) {
    throw new Error(
      "Swap test currently requires the delegation to include native MON. Reissue the test delegation with MON selected as a token.",
    );
  }

  const toToken = tokens.find((token) => token.address.toLowerCase() !== fromToken.address.toLowerCase());
  if (!toToken) {
    throw new Error("Unable to find a destination token distinct from the source token for swap test.");
  }

  if (!PRAGMA_ADMIN_TEST_PK) {
    throw new Error("PRAGMA_ADMIN_TEST_PK is required to fund the swap test delegator. Set it in the environment.");
  }

  const adminAccount = privateKeyToAccount(PRAGMA_ADMIN_TEST_PK as Hex);
  const adminWallet = createWalletClient({
    chain: monadChain,
    transport: http(MONAD_RPC_URL),
    account: adminAccount,
  });
  const publicClient = createMonadPublicClient();

  const fundAmount = parseUnits("0.05", fromToken.decimals ?? 18);
  const fundTx = await adminWallet.sendTransaction({
    to: context.hybridDelegator,
    value: fundAmount,
  });
  await publicClient.waitForTransactionReceipt({ hash: fundTx });
  console.log(
    chalk.green(
      `[dev/${mode}] Funded ${context.hybridDelegator} with ${formatUnits(fundAmount, fromToken.decimals)} ${
        fromToken.symbol ?? MONAD_NATIVE_TOKEN_SYMBOL ?? "MON"
      } (tx: ${fundTx})`,
    ),
  );

  const intent: SwapIntent = { from: fromToken as SwapToken, to: toToken as SwapToken };
  const swapAmount = "0.01";
  const slippageBps = 50;

  await executeSwapWithSession({
    session,
    environment: context.environment,
    hybridDelegator: context.hybridDelegator as Address,
    intent,
    amountInput: swapAmount,
    slippageBps,
    logPrefix: `[dev/${mode}]`,
  });

  return {
    hybridDelegator: context.hybridDelegator,
    sessionKey: session.sessionKeyAddress,
    amount: swapAmount,
    fromToken,
    toToken,
  };
};
