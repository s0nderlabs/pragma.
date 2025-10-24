import { decodeFunctionData, encodeFunctionData, type Hex, type Abi } from "viem";

/**
 * Embedded Monorail Aggregator ABI (aggregate function only)
 * Source: internal-docs/monad/monorail/monorail_aggregator_abi.json
 * Embedded directly to avoid importing from gitignored directory
 */
const MONORAIL_AGGREGATE_ABI = [
  {
    type: "function",
    name: "aggregate",
    inputs: [
      { name: "tokenIn", type: "address", internalType: "address" },
      { name: "tokenOut", type: "address", internalType: "address" },
      { name: "amountIn", type: "uint256", internalType: "uint256" },
      { name: "minAmountOut", type: "uint256", internalType: "uint256" }, // ← Parameter #4 (index 3)
      { name: "destination", type: "address", internalType: "address" },
      { name: "deadline", type: "uint256", internalType: "uint256" },
      { name: "referrer", type: "uint64", internalType: "uint64" },
      { name: "quote", type: "uint64", internalType: "uint64" },
      {
        name: "trades",
        type: "tuple[]",
        internalType: "struct MonorailAggregator.Trade[]",
        components: [
          { name: "minAmountOut", type: "uint256", internalType: "uint256" }, // ← Patch this too
          { name: "weight", type: "uint32", internalType: "uint32" },
          { name: "routerType", type: "uint8", internalType: "enum MonorailAggregator.RouterType" },
          { name: "router", type: "address", internalType: "address" },
          { name: "tokenIn", type: "address", internalType: "address" },
          { name: "tokenOut", type: "address", internalType: "address" },
          { name: "params", type: "bytes", internalType: "bytes" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const satisfies Abi;

export interface TradeChange {
  index: number;
  fromMinOutput: bigint;
  toMinOutput: bigint;
}

export interface PatchResult {
  originalCalldata: Hex;
  patchedCalldata: Hex;
  originalMinOutput: bigint;
  patchedMinOutput: bigint;
  tradesPatched: number;
  changes: {
    globalMinOutput: { from: bigint; to: bigint };
    trades: TradeChange[];
  };
}

/**
 * Patches Monorail aggregate() calldata to fix the slippage bug.
 *
 * @param originalCalldata - The transaction calldata from Monorail API
 * @param expectedOutput - The expected output amount (rawOutput from quote)
 * @param slippageBps - User's desired slippage in basis points (e.g., 500 = 5%)
 * @returns Patch result with original and patched calldata
 *
 * @example
 * const result = patchMonorailMinOutput(
 *   quote.transactionData,
 *   quote.rawOutput,
 *   500 // 5% slippage
 * );
 * // Use result.patchedCalldata for execution
 */
export function patchMonorailMinOutput(
  originalCalldata: Hex,
  expectedOutput: bigint,
  slippageBps: number
): PatchResult {
  // Calculate correct minAmountOut based on user's slippage tolerance
  // Formula: minOutput = expectedOutput * (10000 - slippageBps) / 10000
  const correctMinOutput =
    expectedOutput > 0n ? (expectedOutput * BigInt(10_000 - slippageBps)) / 10_000n : 0n;

  // Decode the calldata using viem
  const decoded = decodeFunctionData({
    abi: MONORAIL_AGGREGATE_ABI,
    data: originalCalldata,
  });

  // Verify this is an aggregate() call
  if (decoded.functionName !== "aggregate") {
    throw new Error(`Expected aggregate() call, got ${decoded.functionName}`);
  }

  // Extract arguments (make mutable copy for patching)
  const args = [...decoded.args] as any[];
  const originalMinOutput = args[3] as bigint; // Parameter #4 (index 3)
  const trades = [...(args[8] as any[])] as any[]; // Parameter #9 (index 8)

  // Track changes for reporting
  const tradeChanges: TradeChange[] = [];

  // Patch global minAmountOut (parameter #4, index 3)
  args[3] = correctMinOutput;

  // Patch each Trade's minAmountOut (first field in Trade struct)
  const patchedTrades = trades.map((trade, i) => {
    const originalTradeMin = trade.minAmountOut as bigint;

    tradeChanges.push({
      index: i,
      fromMinOutput: originalTradeMin,
      toMinOutput: correctMinOutput,
    });

    return {
      ...trade,
      minAmountOut: correctMinOutput,
    };
  });

  // Update args with patched trades
  args[8] = patchedTrades;

  // Re-encode the calldata with patched values
  const patchedCalldata = encodeFunctionData({
    abi: MONORAIL_AGGREGATE_ABI,
    functionName: "aggregate",
    args: args as any,
  });

  return {
    originalCalldata,
    patchedCalldata,
    originalMinOutput,
    patchedMinOutput: correctMinOutput,
    tradesPatched: trades.length,
    changes: {
      globalMinOutput: {
        from: originalMinOutput,
        to: correctMinOutput,
      },
      trades: tradeChanges,
    },
  };
}
