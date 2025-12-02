/**
 * Multi-Aggregator Types
 *
 * Shared types for the multi-aggregator swap system supporting
 * Monorail, 0x, and OKX DEX aggregators.
 */

import type { Address, Hex } from "viem";

/**
 * Supported aggregator names
 */
export type AggregatorName = "monorail" | "0x" | "okx";

/**
 * Aggregator contract configuration
 */
export interface AggregatorConfig {
  name: AggregatorName;
  address: Address;
  /** Function selector for the swap function */
  selector: Hex;
}

/**
 * Aggregator configurations (verified on Monad mainnet)
 */
export const AGGREGATOR_CONFIGS: Record<AggregatorName, AggregatorConfig> = {
  monorail: {
    name: "monorail",
    address: "0xA68A7F0601effDc65C64d9C47cA1b18D96B4352c",
    selector: "0xf99cae99",
  },
  "0x": {
    name: "0x",
    address: "0x0000000000001fF3684f28c67538d4D072C22734",
    selector: "0x2213bc0b",
  },
  okx: {
    name: "okx",
    address: "0xb1E4E25b1938c78Ec0b21cCb2D6a0Be60aA7E63f",
    selector: "0x0d5f0e3b",
  },
};

/**
 * Standardized quote format across all aggregators
 */
export interface StandardQuote {
  /** Which aggregator provided this quote */
  aggregator: AggregatorName;
  /** Router contract address for execution */
  aggregatorAddress: Address;
  /** Transaction calldata for execution */
  transactionData: Hex;
  /** Native token value to send (for native token swaps) */
  transactionValue: bigint;
  /** Input amount in wei */
  rawInput: bigint;
  /** Expected output amount in wei */
  rawOutput: bigint;
  /** Minimum output amount after slippage in wei */
  rawMinOutput: bigint;
  /** Estimated gas for the transaction */
  gasEstimate?: bigint;
  /** DEX/protocol used for routing (e.g., "Uniswap_V4", "capricorn-v3") */
  routeInfo?: string;
  /** Timestamp when quote was fetched */
  fetchedAt: number;
}

/**
 * Request parameters for fetching quotes
 */
export interface QuoteRequest {
  /** Token to sell */
  fromToken: Address;
  /** Token to buy */
  toToken: Address;
  /** Amount to swap in wei */
  amountWei: bigint;
  /** Sender/taker address */
  sender: Address;
  /** Slippage tolerance in basis points (e.g., 100 = 1%) */
  slippageBps: number;
}

/**
 * Aggregator client interface
 */
export interface AggregatorClient {
  /** Aggregator name */
  name: AggregatorName;
  /** Fetch a quote from this aggregator */
  fetchQuote(request: QuoteRequest): Promise<StandardQuote | null>;
}

/**
 * Result of fetching quotes from multiple aggregators
 */
export interface MultiAggregatorQuoteResult {
  /** All successful quotes, sorted by output (best first) */
  quotes: StandardQuote[];
  /** Aggregators that failed to provide quotes */
  failedAggregators: Array<{
    name: AggregatorName;
    error: string;
  }>;
  /** Time taken to fetch all quotes in ms */
  fetchDurationMs: number;
}
