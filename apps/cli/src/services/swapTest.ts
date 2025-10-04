import chalk from "chalk";
import {
  Address,
  Hex,
  encodeFunctionData,
  formatEther,
  formatUnits,
  parseEther,
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
} from "./config.js";
import { createSepoliaPublicClient } from "./web3authClients.js";
import {
  ROUTER,
  WETH_SEPOLIA,
  UNI_SEPOLIA,
  setupHybridDelegatorTest,
  SessionDelegationInfo,
  Mode,
  DeleGatorEnv,
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

export type SwapAssetId = "eth" | "weth" | "uni";
type SwapAssetKind = "native" | "erc20";

export interface SwapAsset {
  id: SwapAssetId;
  symbol: string;
  kind: SwapAssetKind;
  address?: Address;
}

const NATIVE_ASSET: SwapAsset = { id: "eth", symbol: "ETH", kind: "native" };
const WETH_ASSET: SwapAsset = { id: "weth", symbol: "WETH", kind: "erc20", address: WETH_SEPOLIA };
const UNI_ASSET: SwapAsset = { id: "uni", symbol: "UNI", kind: "erc20", address: UNI_SEPOLIA };

const ASSET_MAP: Record<SwapAssetId, SwapAsset> = {
  eth: NATIVE_ASSET,
  weth: WETH_ASSET,
  uni: UNI_ASSET,
};

export const resolveSwapAsset = (raw: string): SwapAsset => {
  const normalized = raw.toLowerCase();
  if (normalized === "eth" || normalized === "native") return NATIVE_ASSET;
  if ((normalized as SwapAssetId) in ASSET_MAP) return ASSET_MAP[normalized as SwapAssetId];
  throw new Error(`Unsupported asset '${raw}'. Supported assets: eth, weth, uni.`);
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

export const computeWethUniQuote = async (
  client: SepoliaClient,
  amountIn: bigint,
  tokenIn: Address,
  tokenOut: Address,
): Promise<{ amountOut: bigint; fee: number } | undefined> => {
  try {
    const poolAddress = getAddress(SEPOLIA_WETH_UNI_POOL_ADDRESS);
    const [slot0Raw, feeRaw, token0Address, token1Address] = await Promise.all([
      client.readContract({ address: poolAddress, abi: UNISWAP_POOL_ABI, functionName: "slot0" }),
      client.readContract({ address: poolAddress, abi: UNISWAP_POOL_ABI, functionName: "fee" }),
      client.readContract({ address: poolAddress, abi: UNISWAP_POOL_ABI, functionName: "token0" }),
      client.readContract({ address: poolAddress, abi: UNISWAP_POOL_ABI, functionName: "token1" }),
    ]);

    const token0 = getAddress(token0Address as Address);
    const token1 = getAddress(token1Address as Address);

    const wethAddress = getAddress(WETH_SEPOLIA);
    const uniAddress = getAddress(UNI_SEPOLIA);

    const tokenInNormalized = getAddress(tokenIn);
    const tokenOutNormalized = getAddress(tokenOut);

    const isExpectedPool =
      (token0 === wethAddress && token1 === uniAddress) || (token0 === uniAddress && token1 === wethAddress);

    if (!isExpectedPool) {
      throw new Error("Configured pool is not the expected WETH/UNI pair");
    }

    const directionWethToUni = tokenInNormalized === wethAddress && tokenOutNormalized === uniAddress;
    const directionUniToWeth = tokenInNormalized === uniAddress && tokenOutNormalized === wethAddress;

    if (!directionWethToUni && !directionUniToWeth) {
      throw new Error("Quote helper only supports WETH↔UNI pairs");
    }

    const [sqrtPriceX96] = slot0Raw as unknown as [bigint, number, ...unknown[]];
    const fee = BigInt(feeRaw as number);

    const amountAfterFee = (amountIn * (FEE_DENOMINATOR - fee)) / FEE_DENOMINATOR;
    const priceX192 = (sqrtPriceX96 as bigint) * (sqrtPriceX96 as bigint);

    if (priceX192 === 0n) {
      throw new Error("Invalid pool price returned zero");
    }

    let amountOut: bigint;
    if (directionWethToUni) {
      amountOut = (amountAfterFee * Q192) / priceX192;
    } else {
      amountOut = (amountAfterFee * priceX192) / Q192;
    }

    return { amountOut, fee: Number(feeRaw) };
  } catch (error) {
    onboardingLogger.warn({ err: error }, "Failed to compute WETH↔UNI quote from pool state");
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

  const wethAddress = getAddress(WETH_SEPOLIA);
  const uniAddress = getAddress(UNI_SEPOLIA);
  const tokenInNormalized = getAddress(swapTokenIn);
  const tokenOutNormalized = getAddress(swapTokenOut);

  const isSupportedPair =
    (tokenInNormalized === wethAddress && tokenOutNormalized === uniAddress) ||
    (tokenInNormalized === uniAddress && tokenOutNormalized === wethAddress);

  if (!isSupportedPair) {
    throw new Error("Swap command currently supports WETH ↔ UNI pairs only");
  }

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
    if (!autoApprove) {
      throw new Error(
        `Allowance for token ${token} is insufficient (${formatEther(allowance)}). Approve the router before swapping.`,
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
        `${prefix}Approved router to spend ${formatEther(requiredAmount)} of token ${token} (tx: ${approveTxHash}, block: ${approveReceipt.blockNumber})`,
      ),
    );
  };

  let wethBalanceBeforeSwap = 0n;
  const ethBalanceBeforeSwap = currentEthBalance;

  if (!isFromNative) {
    const tokenBalance = await readTokenBalance(tokenInNormalized);
    if (tokenBalance < amountIn) {
      throw new Error(
        `HybridDelegator ${hybridDelegator} has insufficient ${fromAsset.symbol} (${formatUnits(tokenBalance, 18)}).`,
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

  const quote = await computeWethUniQuote(publicClient, amountIn, tokenInNormalized, tokenOutNormalized);
  if (!quote) {
    console.log(chalk.yellow(`${prefix}Unable to compute pool-based quote — proceeding without slippage guard.`));
  }

  const { amountOut: quotedAmountOut, fee: selectedFee } = quote ?? { amountOut: 0n, fee: 3_000 };
  const amountOutMinimum = quote
    ? (quotedAmountOut * (10_000n - slippageBps)) / 10_000n
    : 0n;

  if (quote) {
    console.log(
      chalk.blue(
        `${prefix}Quoter estimates ${formatUnits(quotedAmountOut, 18)} ${toAsset.symbol} for ${formatUnits(amountIn, 18)} ${fromAsset.symbol} (fee tier ${selectedFee})`,
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
        `${prefix}Swap executed: ${formatUnits(amountIn, 18)} ${fromAsset.symbol} -> ${formatUnits(ethDelta, 18)} ${toAsset.symbol} (tx: ${swapTxHash}, block: ${swapReceipt.blockNumber})`,
      ),
    );
    return;
  }

  const outputBalanceAfter = await readTokenBalance(tokenOutNormalized);
  const outputDelta = outputBalanceAfter - outputTokenBalanceBefore;
  console.log(
    chalk.green(
      `${prefix}Swap executed: ${formatUnits(amountIn, 18)} ${fromAsset.symbol} -> ${formatUnits(outputDelta, 18)} ${toAsset.symbol} (tx: ${swapTxHash}, block: ${swapReceipt.blockNumber})`,
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

  const seedWethTx = await adminWallet.writeContract({
    address: WETH_SEPOLIA,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [context.hybridDelegator, TEST_SWAP_INPUT],
  });
  await publicClient.waitForTransactionReceipt({ hash: seedWethTx });
  console.log(
    chalk.green(
      `Seeded HybridDelegator with ${formatEther(TEST_SWAP_INPUT)} WETH (tx: ${seedWethTx})`,
    ),
  );

  await executeSwapWithSession({
    publicClient,
    hybridDelegator: context.hybridDelegator,
    session: sessionDelegation,
    environment: context.environment,
    amountIn: TEST_SWAP_INPUT,
    slippageBps: 50n,
    intent: {
      from: resolveSwapAsset("weth"),
      to: resolveSwapAsset("uni"),
    },
    logPrefix: "[dev]",
  });

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
