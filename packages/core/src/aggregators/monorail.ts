/**
 * Monorail DEX Aggregator Client Adapter
 *
 * Wraps the existing Monorail pathfinder to implement the AggregatorClient interface.
 * Monorail uses decimal amounts (not wei) for input.
 */

import type { Address, Hex } from "viem";
import { formatUnits, getAddress } from "viem";

import type { MonorailQuote, QuoteRequestParams, MonorailPathfinderConfig } from "../monorail/pathfinder.js";
import { fetchMonorailQuote as coreFetchMonorailQuote } from "../monorail/pathfinder.js";
import type {
  AggregatorClient,
  QuoteRequest,
  StandardQuote,
} from "./types.js";
import { AGGREGATOR_CONFIGS } from "./types.js";

/**
 * Configuration for the Monorail client adapter
 */
export interface MonorailClientConfig {
  /** Monorail app ID */
  appId: string;
  /** Pathfinder URL */
  pathfinderUrl: string;
  /** Aggregator address */
  aggregatorAddress: Address;
  /** Custom fetch function (for proxy routing) */
  fetch?: typeof fetch;
}

/**
 * Monorail DEX Aggregator Client
 *
 * Adapts the existing Monorail pathfinder to the AggregatorClient interface.
 */
export class MonorailClient implements AggregatorClient {
  readonly name = "monorail" as const;

  private readonly config: MonorailPathfinderConfig;
  private readonly fromTokenDecimals: Map<string, number>;

  constructor(config: MonorailClientConfig) {
    this.config = {
      appId: config.appId,
      pathfinderUrl: config.pathfinderUrl,
      aggregatorAddress: config.aggregatorAddress,
      fetch: config.fetch,
    };
    this.fromTokenDecimals = new Map();
  }

  /**
   * Set the decimals for a token (needed for wei -> decimal conversion)
   */
  setTokenDecimals(tokenAddress: Address, decimals: number): void {
    this.fromTokenDecimals.set(tokenAddress.toLowerCase(), decimals);
  }

  /**
   * Fetch a quote from Monorail
   */
  async fetchQuote(request: QuoteRequest): Promise<StandardQuote | null> {
    // Get token decimals (default to 18 for native token)
    const fromTokenLower = request.fromToken.toLowerCase();
    const isNativeToken = fromTokenLower === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const decimals = isNativeToken ? 18 : (this.fromTokenDecimals.get(fromTokenLower) ?? 18);

    // Convert wei to decimal string for Monorail
    const amountDecimal = formatUnits(request.amountWei, decimals);

    const params: QuoteRequestParams = {
      fromToken: request.fromToken,
      toToken: request.toToken,
      amountDecimal,
      sender: request.sender,
      maxSlippageBps: request.slippageBps,
    };

    try {
      const quote = await coreFetchMonorailQuote(params, this.config);

      if (!quote?.transactionData) {
        console.error("[Monorail] Quote response missing transaction data");
        return null;
      }

      // Extract route info from the quote
      const routeInfo = quote.routes?.[0]?.splits?.[0]?.protocol;

      return {
        aggregator: "monorail",
        aggregatorAddress: getAddress(quote.aggregator) as Address,
        transactionData: quote.transactionData,
        transactionValue: quote.transactionValue,
        rawInput: quote.rawInput,
        rawOutput: quote.rawOutput,
        rawMinOutput: quote.rawMinOutput,
        gasEstimate: quote.gasEstimate,
        routeInfo,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      console.error("[Monorail] Failed to fetch quote:", error);
      return null;
    }
  }
}

/**
 * Create a Monorail client with the given config
 */
export function createMonorailClient(config: MonorailClientConfig): MonorailClient {
  return new MonorailClient(config);
}

/**
 * Get the expected Monorail router address for Monad
 */
export function getMonorailRouterAddress(): Address {
  return AGGREGATOR_CONFIGS.monorail.address;
}
