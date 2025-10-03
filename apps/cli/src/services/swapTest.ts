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
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

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

    const isExpectedPool =
      (token0 === wethAddress && token1 === uniAddress) || (token0 === uniAddress && token1 === wethAddress);

    if (!isExpectedPool) {
      throw new Error("Configured pool is not the expected WETH/UNI pair");
    }

    const [sqrtPriceX96] = slot0Raw as unknown as [bigint, number, ...unknown[]];
    const fee = BigInt(feeRaw as number);

    const amountAfterFee = (amountIn * (FEE_DENOMINATOR - fee)) / FEE_DENOMINATOR;
    const priceX192 = (sqrtPriceX96 as bigint) * (sqrtPriceX96 as bigint);

    if (priceX192 === 0n) {
      throw new Error("Invalid pool price returned zero");
    }

    const amountOut = (amountAfterFee * Q192) / priceX192;

    return { amountOut, fee: Number(feeRaw) };
  } catch (error) {
    onboardingLogger.warn({ err: error }, "Failed to compute WETH→UNI quote from pool state");
    return undefined;
  }
};

interface SwapExecutionConfig {
  publicClient: ReturnType<typeof createSepoliaPublicClient>;
  hybridDelegator: Address;
  session: SessionDelegationInfo;
  environment: DeleGatorEnv;
}

export const executeSwapWithSession = async ({
  publicClient,
  hybridDelegator,
  session,
  environment,
}: SwapExecutionConfig) => {
  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt <= now) {
    throw new Error(
      `Delegation expired at ${new Date(session.expiresAt * 1000).toISOString()} — renew before swapping.`,
    );
  }

  const adminAccount = privateKeyToAccount(PRAGMA_ADMIN_TEST_PK as Hex);
  const adminWallet = createWalletClient({
    chain: sepolia,
    transport: http(SEPOLIA_RPC_URL),
    account: adminAccount,
  });

  const hybridFundingTx = await adminWallet.sendTransaction({
    to: hybridDelegator,
    value: HYBRID_FUNDING,
  });
  await publicClient.waitForTransactionReceipt({ hash: hybridFundingTx });
  console.log(
    chalk.green(
      `Funded HybridDelegator ${hybridDelegator} with ${formatEther(HYBRID_FUNDING)} ETH for gas (tx: ${hybridFundingTx})`,
    ),
  );

  const sessionGasTx = await adminWallet.sendTransaction({
    to: session.sessionKeyAddress,
    value: SESSION_GAS_BUFFER,
  });
  await publicClient.waitForTransactionReceipt({ hash: sessionGasTx });
  console.log(
    chalk.green(
      `Provisioned session key ${
        session.sessionKeyAddress
      } with ${formatEther(SESSION_GAS_BUFFER)} ETH for gas (tx: ${sessionGasTx})`,
    ),
  );

  const wethTransferTx = await adminWallet.writeContract({
    address: WETH_SEPOLIA,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [hybridDelegator, TEST_SWAP_INPUT],
  });
  await publicClient.waitForTransactionReceipt({ hash: wethTransferTx });
  console.log(
    chalk.green(
      `Seeded HybridDelegator with ${formatEther(TEST_SWAP_INPUT)} WETH (tx: ${wethTransferTx})`,
    ),
  );

  const sessionAccount = privateKeyToAccount(session.sessionKeyPrivateKey as Hex);
  const sessionWallet = createWalletClient({
    chain: sepolia,
    transport: http(SEPOLIA_RPC_URL),
    account: sessionAccount,
  });

  const quote = await computeWethUniQuote(publicClient, TEST_SWAP_INPUT);

  if (!quote || quote.amountOut === 0n) {
    console.log(
      chalk.yellow("Unable to compute a positive WETH→UNI quote on Sepolia — skipping delegated swap."),
    );
    return;
  }

  const { amountOut: quotedUni, fee: selectedFee } = quote;

  console.log(
    chalk.blue(
      `Quoter expects roughly ${formatUnits(quotedUni, 18)} UNI for ${formatEther(TEST_SWAP_INPUT)} WETH (fee tier ${selectedFee})`,
    ),
  );

  const swapCallData = encodeFunctionData({
    abi: SWAP_ROUTER_ABI,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: WETH_SEPOLIA,
        tokenOut: UNI_SEPOLIA,
        fee: selectedFee,
        recipient: hybridDelegator,
        amountIn: TEST_SWAP_INPUT,
        amountOutMinimum: 0n,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  const approveCallData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [ROUTER, TEST_SWAP_INPUT],
  });

  const approveExecution = createExecution({
    target: WETH_SEPOLIA,
    value: 0n,
    callData: approveCallData,
  });

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
      `Session key approved ${formatEther(TEST_SWAP_INPUT)} WETH for router (tx: ${approveTxHash}, block: ${approveReceipt.blockNumber})`,
    ),
  );

  const swapExecution = createExecution({
    target: ROUTER,
    value: 0n,
    callData: swapCallData,
  });

  const uniBalanceBefore = (await publicClient.readContract({
    address: UNI_SEPOLIA,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [hybridDelegator],
  })) as bigint;

  try {
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

    const uniBalanceAfter = (await publicClient.readContract({
      address: UNI_SEPOLIA,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [hybridDelegator],
    })) as bigint;
    const uniDelta = uniBalanceAfter - uniBalanceBefore;

    console.log(
      chalk.green(
        `Swap test executed: ${formatEther(TEST_SWAP_INPUT)} WETH -> ${formatUnits(uniDelta, 18)} UNI (tx: ${swapTxHash}, block: ${swapReceipt.blockNumber})`,
      ),
    );
  } catch (error) {
    const errAny = error as any;
    const revertData: Hex | undefined = errAny?.cause?.data ?? errAny?.data;
    if (revertData) {
      onboardingLogger.debug({ revertData }, "Router revert data captured");
    }
    onboardingLogger.error({ err: error }, "Swap execution failed");
    console.log(
      chalk.yellow(
        "Swap execution reverted. Inspect swapTest logs for details on the router failure (the approval succeeded).",
      ),
    );
  }
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

  await executeSwapWithSession({
    publicClient,
    hybridDelegator: context.hybridDelegator,
    session: sessionDelegation,
    environment: context.environment,
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
