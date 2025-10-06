import chalk from "chalk";
import {
  Address,
  Hex,
  encodeFunctionData,
  formatEther,
  formatUnits,
  parseEther,
  parseUnits,
  getAddress,
} from "viem";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createExecution, ExecutionMode, redeemDelegations } from "@metamask/delegation-toolkit";

import {
  PRAGMA_ADMIN_TEST_PK,
  SEPOLIA_RPC_URL,
  SEPOLIA_WETH_UNI_POOL_ADDRESS,
  SEPOLIA_WETH_USDC_POOL_ADDRESS,
  SEPOLIA_UNI_USDC_POOL_ADDRESS,
} from "./config.js";
import { createSepoliaPublicClient } from "./web3authClients.js";
import {
  ROUTER,
  WETH_SEPOLIA,
  UNI_SEPOLIA,
  USDC_SEPOLIA,
  setupHybridDelegatorTest,
  SessionDelegationInfo,
  Mode,
  DeleGatorEnv,
  normalizeAllowedTokensList,
  type AllowedToken,
} from "./onboarding4337.js";
import { onboardingLogger } from "../utils/logger.js";

export const SWAP_ROUTER_ABI = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

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

export const WETH_ABI = [
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
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export type SwapAssetId = string;
type SwapAssetKind = "native" | "erc20";

export interface SwapAsset {
  id: SwapAssetId;
  symbol: string;
  kind: SwapAssetKind;
  address?: Address;
  decimals: number;
}

const NATIVE_ASSET: SwapAsset = { id: "eth", symbol: "ETH", kind: "native", decimals: 18 };
const WETH_ASSET: SwapAsset = { id: "weth", symbol: "WETH", kind: "erc20", address: WETH_SEPOLIA, decimals: 18 };
const UNI_ASSET: SwapAsset = { id: "uni", symbol: "UNI", kind: "erc20", address: UNI_SEPOLIA, decimals: 18 };
const USDC_ASSET: SwapAsset = { id: "usdc", symbol: "USDC", kind: "erc20", address: USDC_SEPOLIA, decimals: 6 };

const ASSET_MAP: Record<string, SwapAsset> = {
  eth: NATIVE_ASSET,
  weth: WETH_ASSET,
  uni: UNI_ASSET,
  usdc: USDC_ASSET,
};

const optionalAddress = (value: string | undefined): Address | undefined => {
  if (!value) return undefined;
  try {
    return getAddress(value);
  } catch (error) {
    onboardingLogger.debug({ err: error, address: value }, "Skipping invalid pool address override");
    return undefined;
  }
};

const KNOWN_SINGLE_HOP_POOLS: Array<{ tokens: [Address, Address]; address?: Address }> = [
  {
    tokens: [WETH_SEPOLIA, UNI_SEPOLIA],
    address: getAddress(SEPOLIA_WETH_UNI_POOL_ADDRESS),
  },
  {
    tokens: [WETH_SEPOLIA, USDC_SEPOLIA],
    address: optionalAddress(SEPOLIA_WETH_USDC_POOL_ADDRESS),
  },
  {
    tokens: [UNI_SEPOLIA, USDC_SEPOLIA],
    address: optionalAddress(SEPOLIA_UNI_USDC_POOL_ADDRESS),
  },
];

const toSwapAssetFromToken = (token: AllowedToken): SwapAsset => ({
  id: (token.symbol ?? token.address).toLowerCase(),
  symbol: token.symbol ?? token.address,
  kind: "erc20",
  address: getAddress(token.address),
  decimals:
    typeof token.decimals === "number" && Number.isFinite(token.decimals)
      ? Number(token.decimals)
      : Number(token.decimals ?? 18),
});

export const resolveSwapAsset = (raw: string, allowedTokens?: AllowedToken[]): SwapAsset => {
  const input = raw.trim();
  const normalized = input.toLowerCase();
  if (normalized === "eth" || normalized === "native") return NATIVE_ASSET;
  const builtIn = ASSET_MAP[normalized];
  if (builtIn) return builtIn;

  const tokens = allowedTokens ?? [];
  const matchBySymbol = tokens.find((token) => token.symbol?.toLowerCase() === normalized);
  if (matchBySymbol) {
    return toSwapAssetFromToken(matchBySymbol);
  }

  try {
    const address = getAddress(input as Address);
    const matchByAddress = tokens.find((token) => token.address.toLowerCase() === address.toLowerCase());
    if (matchByAddress) {
      return toSwapAssetFromToken(matchByAddress);
    }
    return {
      id: address.toLowerCase(),
      symbol: address,
      kind: "erc20",
      address,
      decimals: 18,
    };
  } catch (error) {
    onboardingLogger.debug({ err: error, value: raw }, "Unable to treat asset as address");
  }

  const supported = ["eth", ...Object.keys(ASSET_MAP).filter((key) => key !== "eth")];
  const tokenSymbols = tokens
    .map((token) => token.symbol)
    .filter((value): value is string => Boolean(value))
    .map((symbol) => symbol.toLowerCase());
  const hint = tokenSymbols.length > 0 ? `, ${tokenSymbols.join(", ")}` : "";
  throw new Error(`Unsupported asset '${raw}'. Supported assets: ${supported.join(", ")}${hint}.`);
};

export interface SwapIntent {
  from: SwapAsset;
  to: SwapAsset;
}

const UNISWAP_POOL_ABI = [
  { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
  { type: "function", name: "tickSpacing", stateMutability: "view", inputs: [], outputs: [{ type: "int24" }] },
  { type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const DEFAULT_MODE: "safe" | "normal" = "safe";
export const SESSION_GAS_BUFFER = parseEther("0.002");
export const HYBRID_FUNDING = parseEther("0.005");
export const TEST_SWAP_INPUT = parseEther("0.005");
const Q96 = 2n ** 96n;
const Q192 = Q96 * Q96;
const FEE_DENOMINATOR = 1_000_000n;

type SepoliaClient = ReturnType<typeof createSepoliaPublicClient>;

const resolveSingleHopPool = (tokenIn: Address, tokenOut: Address): Address | undefined => {
  const lhs = tokenIn.toLowerCase();
  const rhs = tokenOut.toLowerCase();

  for (const pool of KNOWN_SINGLE_HOP_POOLS) {
    if (!pool.address) continue;
    const [a, b] = pool.tokens;
    const normalized = [a.toLowerCase(), b.toLowerCase()];
    const isMatch =
      (normalized[0] === lhs && normalized[1] === rhs) ||
      (normalized[0] === rhs && normalized[1] === lhs);
    if (isMatch) return pool.address;
  }

  return undefined;
};

const resolveDefaultFee = (tokenIn: Address, tokenOut: Address): number => {
  const lhs = tokenIn.toLowerCase();
  const rhs = tokenOut.toLowerCase();
  const weth = WETH_SEPOLIA.toLowerCase();
  const uni = UNI_SEPOLIA.toLowerCase();
  const usdc = USDC_SEPOLIA.toLowerCase();

  if ((lhs === weth && rhs === uni) || (lhs === uni && rhs === weth)) {
    return 3_000;
  }

  if ((lhs === weth && rhs === usdc) || (lhs === usdc && rhs === weth)) {
    return 500;
  }

  if ((lhs === uni && rhs === usdc) || (lhs === usdc && rhs === uni)) {
    return 3_000;
  }

  return 3_000;
};

export const computeSingleHopQuote = async (
  client: SepoliaClient,
  amountIn: bigint,
  tokenIn: Address,
  tokenOut: Address,
): Promise<{ amountOut: bigint; fee: number } | undefined> => {
  const poolAddress = resolveSingleHopPool(tokenIn, tokenOut);
  if (!poolAddress) {
    onboardingLogger.debug({ tokenIn, tokenOut }, "No configured single-hop pool for token pair");
    return undefined;
  }

  try {
    const [slot0Raw, feeRaw, token0Address, token1Address] = await Promise.all([
      client.readContract({ address: poolAddress, abi: UNISWAP_POOL_ABI, functionName: "slot0" }),
      client.readContract({ address: poolAddress, abi: UNISWAP_POOL_ABI, functionName: "fee" }),
      client.readContract({ address: poolAddress, abi: UNISWAP_POOL_ABI, functionName: "token0" }),
      client.readContract({ address: poolAddress, abi: UNISWAP_POOL_ABI, functionName: "token1" }),
    ]);

    const token0 = getAddress(token0Address as Address);
    const token1 = getAddress(token1Address as Address);

    const normalizedIn = getAddress(tokenIn);
    const normalizedOut = getAddress(tokenOut);

    const tokenInIsToken0 = token0 === normalizedIn;
    const tokenInIsToken1 = token1 === normalizedIn;
    const tokenOutIsToken0 = token0 === normalizedOut;
    const tokenOutIsToken1 = token1 === normalizedOut;

    const isExpectedPool = (tokenInIsToken0 && tokenOutIsToken1) || (tokenInIsToken1 && tokenOutIsToken0);

    if (!isExpectedPool) {
      onboardingLogger.debug(
        { token0, token1, tokenIn: normalizedIn, tokenOut: normalizedOut },
        "Configured pool tokens do not match requested pair",
      );
    }

    if (!tokenInIsToken0 && !tokenInIsToken1) {
      onboardingLogger.debug(
        { token0, token1, tokenIn: normalizedIn },
        "Input token not found in configured pool",
      );
      return undefined;
    }

    if (!tokenOutIsToken0 && !tokenOutIsToken1) {
      onboardingLogger.debug(
        { token0, token1, tokenOut: normalizedOut },
        "Output token not found in configured pool",
      );
      return undefined;
    }

    const [sqrtPriceX96] = slot0Raw as unknown as [bigint, number, ...unknown[]];
    const fee = BigInt(feeRaw as number);

    const amountAfterFee = (amountIn * (FEE_DENOMINATOR - fee)) / FEE_DENOMINATOR;
    const priceX192 = (sqrtPriceX96 as bigint) * (sqrtPriceX96 as bigint);

    if (priceX192 === 0n) {
      throw new Error("Invalid pool price returned zero");
    }

    let amountOut: bigint;
    if (tokenInIsToken0) {
      // token0 → token1 uses price (token1 per token0)
      amountOut = (amountAfterFee * priceX192) / Q192;
    } else {
      // token1 → token0 uses the inverse price
      amountOut = (amountAfterFee * Q192) / priceX192;
    }

    return { amountOut, fee: Number(feeRaw) };
  } catch (error) {
    onboardingLogger.warn({ err: error, tokenIn, tokenOut }, "Failed to compute single-hop quote from pool state");
    return undefined;
  }
};

interface SwapExecutionConfig {
  publicClient: ReturnType<typeof createSepoliaPublicClient>;
  hybridDelegator: Address;
  session: SessionDelegationInfo;
  environment: DeleGatorEnv;
  amountIn: bigint;
  slippageBps: bigint;
  intent: SwapIntent;
  autoApprove?: boolean;
  logPrefix?: string;
}
export const executeSwapWithSession = async ({
  publicClient,
  hybridDelegator,
  session,
  environment,
  amountIn,
  slippageBps,
  intent,
  autoApprove = true,
  logPrefix,
}: SwapExecutionConfig) => {
  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt <= now) {
    throw new Error(
      `Delegation expired at ${new Date(session.expiresAt * 1000).toISOString()} — renew before swapping.`,
    );
  }

  const sessionAccount = privateKeyToAccount(session.sessionKeyPrivateKey as Hex);
  const sessionWallet = createWalletClient({
    chain: sepolia,
    transport: http(SEPOLIA_RPC_URL),
    account: sessionAccount,
  });

  const allowedTokenMap = new Map(
    (session.allowedTokens ?? []).map((token) => [token.address.toLowerCase(), token]),
  );
  const getTokenDecimals = (address: Address): number => {
    const entry = allowedTokenMap.get(address.toLowerCase());
    if (entry) return entry.decimals ?? 18;
    if (address.toLowerCase() === WETH_SEPOLIA.toLowerCase()) return 18;
    if (address.toLowerCase() === UNI_SEPOLIA.toLowerCase()) return 18;
    if (address.toLowerCase() === USDC_SEPOLIA.toLowerCase()) return 6;
    return 18;
  };
  const getTokenSymbol = (address: Address, fallback: string) => {
    const entry = allowedTokenMap.get(address.toLowerCase());
    return entry?.symbol ?? fallback;
  };
  const isTokenAllowed = (address: Address) =>
    allowedTokenMap.size === 0 || allowedTokenMap.has(address.toLowerCase());

  const prefix = logPrefix ? `${logPrefix} ` : "";

  const fromAsset = intent.from;
  const toAsset = intent.to;
  const isFromNative = fromAsset.kind === "native";
  const isToNative = toAsset.kind === "native";

  const swapTokenIn = isFromNative ? WETH_SEPOLIA : (fromAsset.address as Address);
  const swapTokenOut = isToNative ? WETH_SEPOLIA : (toAsset.address as Address);

  if (!swapTokenIn || !swapTokenOut) {
    throw new Error("Swap asset addresses not resolved");
  }

  const tokenInDecimals = getTokenDecimals(swapTokenIn);
  const tokenOutDecimals = getTokenDecimals(swapTokenOut);
  const fromDecimals = isFromNative ? fromAsset.decimals : tokenInDecimals;
  const toDecimals = isToNative ? toAsset.decimals : tokenOutDecimals;

  if (!isTokenAllowed(swapTokenIn)) {
    throw new Error(
      `Delegation does not permit spending ${getTokenSymbol(swapTokenIn, fromAsset.symbol)} (${swapTokenIn}). Reissue the delegation with this token included.`,
    );
  }
  if (!isTokenAllowed(swapTokenOut)) {
    throw new Error(
      `Delegation does not permit receiving ${getTokenSymbol(swapTokenOut, toAsset.symbol)} (${swapTokenOut}). Reissue the delegation with this token included.`,
    );
  }
  if (isFromNative && !isTokenAllowed(WETH_SEPOLIA)) {
    throw new Error(
      "Delegation does not permit wrapping ETH → WETH. Include WETH in the token allowlist to swap native ETH.",
    );
  }
  if (isToNative && !isTokenAllowed(WETH_SEPOLIA)) {
    throw new Error(
      "Delegation does not permit unwrapping WETH → ETH. Include WETH in the token allowlist to receive native ETH.",
    );
  }

  const tokenInNormalized = getAddress(swapTokenIn);
  const tokenOutNormalized = getAddress(swapTokenOut);
  const tokenInLower = tokenInNormalized.toLowerCase();
  const tokenOutLower = tokenOutNormalized.toLowerCase();

  if (session.mode === "safe") {
    const allowedAddresses = new Set<string>(allowedTokenMap.keys());
    if (!allowedAddresses.has(tokenInLower) || !allowedAddresses.has(tokenOutLower)) {
      throw new Error(
        "Safe mode delegation only authorizes swaps within the originally selected pair. Reissue in normal mode to add more tokens.",
      );
    }
  }

  const wethAddress = getAddress(WETH_SEPOLIA);

  if (amountIn <= 0n) {
    throw new Error("Swap amount must be greater than zero");
  }

  const currentEthBalance = await publicClient.getBalance({ address: hybridDelegator });
  if (isFromNative && currentEthBalance < amountIn) {
    throw new Error(
      `HybridDelegator ${hybridDelegator} has insufficient ETH (${formatEther(currentEthBalance)}). Fund before swapping.`,
    );
  }

  const readTokenBalance = async (token: Address) =>
    (await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [hybridDelegator],
    })) as bigint;

  const ensureAllowance = async (token: Address, requiredAmount: bigint) => {
    const allowance = (await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [hybridDelegator, ROUTER],
    })) as bigint;

    if (allowance >= requiredAmount) return;
    const tokenDecimals = getTokenDecimals(token);
    const tokenSymbol = getTokenSymbol(token, fromAsset.symbol);
    if (!autoApprove) {
      throw new Error(
        `Allowance for token ${token} is insufficient (${formatUnits(allowance, tokenDecimals)} ${tokenSymbol}). Approve the router before swapping.`,
      );
    }

    const approveCallData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ROUTER, requiredAmount],
    });

    const approveExecution = createExecution({ target: token, value: 0n, callData: approveCallData });
    const approveTxHash = await redeemDelegations(
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
    const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
    console.log(
      chalk.green(
        `${prefix}Approved router to spend ${formatUnits(requiredAmount, tokenDecimals)} ${tokenSymbol} (tx: ${approveTxHash}, block: ${approveReceipt.blockNumber})`,
      ),
    );
  };

  let wethBalanceBeforeSwap = 0n;
  const ethBalanceBeforeSwap = currentEthBalance;

  if (!isFromNative) {
    const tokenBalance = await readTokenBalance(tokenInNormalized);
    if (tokenBalance < amountIn) {
      throw new Error(
        `HybridDelegator ${hybridDelegator} has insufficient ${fromAsset.symbol} (${formatUnits(tokenBalance, fromDecimals)}).`,
      );
    }
  }

  if (isFromNative) {
    await wrapNativeWithSession({
      publicClient,
      sessionWallet,
      session,
      environment,
      hybridDelegator,
      amount: amountIn,
      logPrefix,
    });
  }

  await ensureAllowance(tokenInNormalized, amountIn);

  const quote = await computeSingleHopQuote(publicClient, amountIn, tokenInNormalized, tokenOutNormalized);
  if (!quote) {
    console.log(chalk.yellow(`${prefix}Unable to compute pool-based quote — proceeding without slippage guard.`));
  }

  const { amountOut: quotedAmountOut, fee: selectedFee } = quote ?? {
    amountOut: 0n,
    fee: resolveDefaultFee(tokenInNormalized, tokenOutNormalized),
  };
  const amountOutMinimum = quote
    ? (quotedAmountOut * (10_000n - slippageBps)) / 10_000n
    : 0n;

  if (quote) {
    console.log(
      chalk.blue(
        `${prefix}Quoter estimates ${formatUnits(quotedAmountOut, toDecimals)} ${toAsset.symbol} for ${formatUnits(amountIn, fromDecimals)} ${fromAsset.symbol} (fee tier ${selectedFee})`,
      ),
    );
  }

  const swapCallData = encodeFunctionData({
    abi: SWAP_ROUTER_ABI,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: swapTokenIn,
        tokenOut: swapTokenOut,
        fee: selectedFee,
        recipient: hybridDelegator,
        amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  if (isToNative) {
    wethBalanceBeforeSwap = await readTokenBalance(wethAddress);
  }

  const outputTokenBalanceBefore = !isToNative ? await readTokenBalance(tokenOutNormalized) : 0n;

  const swapExecution = createExecution({ target: ROUTER, value: 0n, callData: swapCallData });

  const swapTxHash = await redeemDelegations(
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

  const swapReceipt = await publicClient.waitForTransactionReceipt({ hash: swapTxHash });

  if (isToNative) {
    const wethBalanceAfterSwap = await readTokenBalance(wethAddress);
    const wethDelta = wethBalanceAfterSwap - wethBalanceBeforeSwap;

    if (wethDelta > 0n) {
      await unwrapNativeWithSession({
        publicClient,
        sessionWallet,
        session,
        environment,
        hybridDelegator,
        amount: wethDelta,
        logPrefix,
      });
    }

    const ethBalanceAfter = await publicClient.getBalance({ address: hybridDelegator });
    const ethDelta = ethBalanceAfter - ethBalanceBeforeSwap;
    console.log(
      chalk.green(
        `${prefix}Swap executed: ${formatUnits(amountIn, fromDecimals)} ${fromAsset.symbol} -> ${formatUnits(ethDelta, 18)} ${toAsset.symbol} (tx: ${swapTxHash}, block: ${swapReceipt.blockNumber})`,
      ),
    );
    return;
  }

  const outputBalanceAfter = await readTokenBalance(tokenOutNormalized);
  const outputDelta = outputBalanceAfter - outputTokenBalanceBefore;
  console.log(
    chalk.green(
      `${prefix}Swap executed: ${formatUnits(amountIn, fromDecimals)} ${fromAsset.symbol} -> ${formatUnits(outputDelta, toDecimals)} ${toAsset.symbol} (tx: ${swapTxHash}, block: ${swapReceipt.blockNumber})`,
    ),
  );
};

interface WrapConfig {
  publicClient: SepoliaClient;
  sessionWallet: ReturnType<typeof createWalletClient>;
  session: SessionDelegationInfo;
  environment: DeleGatorEnv;
  hybridDelegator: Address;
  amount: bigint;
  logPrefix?: string;
}

export const wrapNativeWithSession = async ({
  publicClient,
  sessionWallet,
  session,
  environment,
  hybridDelegator,
  amount,
  logPrefix,
}: WrapConfig) => {
  if (amount === 0n) return;

  const prefix = logPrefix ? `${logPrefix} ` : "";

  const depositCallData = encodeFunctionData({ abi: WETH_ABI, functionName: "deposit" });
  const depositExecution = createExecution({ target: WETH_SEPOLIA, value: amount, callData: depositCallData });

  const txHash = await redeemDelegations(
    sessionWallet,
    publicClient,
    environment.DelegationManager as Address,
    [
      {
        permissionContext: [session.delegation],
        executions: [depositExecution],
        mode: ExecutionMode.SingleDefault,
      },
    ],
  );

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const wethBalance = (await publicClient.readContract({
    address: WETH_SEPOLIA,
    abi: WETH_ABI,
    functionName: "balanceOf",
    args: [hybridDelegator],
  })) as bigint;

  console.log(
    chalk.green(
      `${prefix}Wrapped ${formatEther(amount)} ETH into WETH for HybridDelegator ${hybridDelegator} (tx: ${txHash}, block: ${receipt.blockNumber}). New WETH balance: ${formatUnits(wethBalance, 18)}`,
    ),
  );
};

export const unwrapNativeWithSession = async ({
  publicClient,
  sessionWallet,
  session,
  environment,
  hybridDelegator,
  amount,
  logPrefix,
}: WrapConfig) => {
  if (amount === 0n) return;

  const prefix = logPrefix ? `${logPrefix} ` : "";

  const currentBalance = (await publicClient.readContract({
    address: WETH_SEPOLIA,
    abi: WETH_ABI,
    functionName: "balanceOf",
    args: [hybridDelegator],
  })) as bigint;

  if (currentBalance < amount) {
    throw new Error(
      `HybridDelegator ${hybridDelegator} has insufficient WETH (${formatUnits(currentBalance, 18)}) to unwrap ${formatUnits(amount, 18)}.`,
    );
  }

  const withdrawCallData = encodeFunctionData({ abi: WETH_ABI, functionName: "withdraw", args: [amount] });
  const withdrawExecution = createExecution({ target: WETH_SEPOLIA, value: 0n, callData: withdrawCallData });

  const txHash = await redeemDelegations(
    sessionWallet,
    publicClient,
    environment.DelegationManager as Address,
    [
      {
        permissionContext: [session.delegation],
        executions: [withdrawExecution],
        mode: ExecutionMode.SingleDefault,
      },
    ],
  );

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(
    chalk.green(
      `${prefix}Unwrapped ${formatUnits(amount, 18)} WETH to native ETH for HybridDelegator ${hybridDelegator} (tx: ${txHash}, block: ${receipt.blockNumber})`,
    ),
  );
};

export const runSwapTest = async (mode: Mode = DEFAULT_MODE) => {
  console.log(chalk.blue("Setting up HybridDelegator and session delegation for swap test..."));
  const context = await setupHybridDelegatorTest(mode, {
    logSessionSummaries: false,
  });

  const sessionDelegation =
    context.sessionDelegations.find((entry) => entry.mode === mode) ??
    context.sessionDelegations[0];

  if (!sessionDelegation) {
    throw new Error("No session delegation available for swap test");
  }

  const publicClient = context.publicClient ?? createSepoliaPublicClient();

  const adminAccount = privateKeyToAccount(PRAGMA_ADMIN_TEST_PK as Hex);
  const adminWallet = createWalletClient({
    chain: sepolia,
    transport: http(SEPOLIA_RPC_URL),
    account: adminAccount,
  });

  const hybridFundingTx = await adminWallet.sendTransaction({
    to: context.hybridDelegator,
    value: HYBRID_FUNDING,
  });
  await publicClient.waitForTransactionReceipt({ hash: hybridFundingTx });
  console.log(
    chalk.green(
      `Funded HybridDelegator ${context.hybridDelegator} with ${formatEther(HYBRID_FUNDING)} ETH for gas (tx: ${hybridFundingTx})`,
    ),
  );

  const sessionGasTx = await adminWallet.sendTransaction({
    to: sessionDelegation.sessionKeyAddress,
    value: SESSION_GAS_BUFFER,
  });
  await publicClient.waitForTransactionReceipt({ hash: sessionGasTx });
  console.log(
    chalk.green(
      `Provisioned session key ${
        sessionDelegation.sessionKeyAddress
      } with ${formatEther(SESSION_GAS_BUFFER)} ETH for gas (tx: ${sessionGasTx})`,
    ),
  );

  const swapLegs: Array<{ description: string; intent: SwapIntent; amountIn: bigint }> = [
    {
      description: "Swap WETH → UNI",
      intent: {
        from: resolveSwapAsset("weth"),
        to: resolveSwapAsset("uni"),
      },
      amountIn: TEST_SWAP_INPUT,
    },
  ];
  if (mode === "normal") {
    swapLegs.push(
      {
        description: "Swap WETH → USDC",
        intent: {
          from: resolveSwapAsset("weth"),
          to: resolveSwapAsset("usdc"),
        },
        amountIn: TEST_SWAP_INPUT,
      },
      {
        description: "Swap USDC → UNI",
        intent: {
          from: resolveSwapAsset("usdc"),
          to: resolveSwapAsset("uni"),
        },
        amountIn: parseUnits("10", USDC_ASSET.decimals),
      },
      {
        description: "Swap UNI → USDC",
        intent: {
          from: resolveSwapAsset("uni"),
          to: resolveSwapAsset("usdc"),
        },
        amountIn: parseUnits("0.001", UNI_ASSET.decimals),
      },
    );
  }

  const ensureDelegatorBalance = async (asset: SwapAsset, required: bigint) => {
    if (asset.kind === "native") {
      const currentBalance = await publicClient.getBalance({ address: context.hybridDelegator });
      if (currentBalance >= required) return;
      const missing = required - currentBalance;
      const txHash = await adminWallet.sendTransaction({ to: context.hybridDelegator, value: missing });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(
        chalk.green(
          `[dev] Seeded HybridDelegator with ${formatEther(missing)} ${asset.symbol} to cover swap input (tx: ${txHash})`,
        ),
      );
      return;
    }

    if (!asset.address) {
      throw new Error(`Swap asset ${asset.symbol} is missing an ERC-20 address`);
    }

    const tokenBalance = (await publicClient.readContract({
      address: asset.address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [context.hybridDelegator],
    })) as bigint;

    if (tokenBalance >= required) return;

    const missing = required - tokenBalance;
    const txHash = await adminWallet.writeContract({
      address: asset.address,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [context.hybridDelegator, missing],
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(
      chalk.green(
        `[dev] Seeded HybridDelegator with ${formatUnits(missing, asset.decimals)} ${asset.symbol} to cover swap input (tx: ${txHash})`,
      ),
    );
  };

  for (const [index, leg] of swapLegs.entries()) {
    console.log(chalk.blue(`\n[dev] ${leg.description} (leg ${index + 1} of ${swapLegs.length})`));
    await ensureDelegatorBalance(leg.intent.from, leg.amountIn);
    await executeSwapWithSession({
      publicClient,
      hybridDelegator: context.hybridDelegator,
      session: sessionDelegation,
      environment: context.environment,
      amountIn: leg.amountIn,
      slippageBps: 50n,
      intent: leg.intent,
      logPrefix: "[dev]",
    });
  }

  console.log(chalk.green("4337 test onboarding complete"));
  console.log(`Root signer: ${context.rootAccount.address}`);
  console.log(`Root private key: ${context.rootPrivateKey}`);
  console.log(`HybridDelegator: ${context.hybridDelegator}`);
  if (context.deploymentInfo) {
    console.log(`UserOperation hash: ${context.deploymentInfo.userOpHash}`);
    console.log(`Transaction hash: ${context.deploymentInfo.transactionHash}`);
  }

  console.log("Delegation explanations printed above. Artifacts are in-memory only for this test run.");
};
