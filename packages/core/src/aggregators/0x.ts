/**
 * 0x DEX Aggregator Client
 *
 * Fetches swap quotes from 0x API for Monad mainnet (chainId: 143).
 * Uses the allowance-holder/quote endpoint which returns transaction calldata.
 */

import type { Address, Hex } from "viem";
import { getAddress } from "viem";

import type {
  AggregatorClient,
  QuoteRequest,
  StandardQuote,
} from "./types.js";
import { AGGREGATOR_CONFIGS } from "./types.js";

/**
 * 0x API response types
 */
interface ZeroXTransaction {
  to: string;
  data: string;
  gas: string;
  gasPrice: string;
  value: string;
}

interface ZeroXRouteFill {
  source: string;
  proportion: string;
}

interface ZeroXRoute {
  fills: ZeroXRouteFill[];
}

interface ZeroXQuoteResponse {
  liquidityAvailable: boolean;
  sellAmount: string;
  buyAmount: string;
  minBuyAmount: string;
  transaction: ZeroXTransaction;
  route?: ZeroXRoute;
}

/**
 * Configuration for the 0x client
 */
export interface ZeroXClientConfig {
  /** 0x API key */
  apiKey: string;
  /** Custom fetch function (for proxy routing) */
  fetch?: typeof fetch;
  /** Chain ID (default: 143 for Monad) */
  chainId?: number;
}

/**
 * 0x DEX Aggregator Client
 */
export class ZeroXClient implements AggregatorClient {
  readonly name = "0x" as const;

  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;
  private readonly chainId: number;
  private readonly baseUrl = "https://api.0x.org/swap/allowance-holder/quote";

  constructor(config: ZeroXClientConfig) {
    this.apiKey = config.apiKey;
    this.fetchFn = config.fetch ?? fetch;
    this.chainId = config.chainId ?? 143; // Monad mainnet
  }

  /**
   * Fetch a quote from 0x
   */
  async fetchQuote(request: QuoteRequest): Promise<StandardQuote | null> {
    // Convert slippage from bps to decimal (100 bps = 0.01)
    const slippageDecimal = request.slippageBps / 10000;

    const url = new URL(this.baseUrl);
    url.searchParams.set("chainId", this.chainId.toString());
    url.searchParams.set("sellToken", request.fromToken);
    url.searchParams.set("buyToken", request.toToken);
    url.searchParams.set("sellAmount", request.amountWei.toString());
    url.searchParams.set("taker", request.sender);
    url.searchParams.set("slippagePercentage", slippageDecimal.toString());

    try {
      const response = await this.fetchFn(url.toString(), {
        method: "GET",
        headers: {
          "0x-api-key": this.apiKey,
          "0x-version": "v2",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[0x] Quote request failed (${response.status}):`, errorText);
        return null;
      }

      const data = (await response.json()) as ZeroXQuoteResponse;

      if (!data.liquidityAvailable) {
        console.log("[0x] No liquidity available for this pair");
        return null;
      }

      if (!data.transaction?.data) {
        console.error("[0x] Quote response missing transaction data");
        return null;
      }

      // Extract route info from the first fill source
      const routeInfo = data.route?.fills?.[0]?.source;

      return {
        aggregator: "0x",
        aggregatorAddress: getAddress(data.transaction.to) as Address,
        transactionData: data.transaction.data as Hex,
        transactionValue: BigInt(data.transaction.value || "0"),
        rawInput: BigInt(data.sellAmount),
        rawOutput: BigInt(data.buyAmount),
        rawMinOutput: BigInt(data.minBuyAmount),
        gasEstimate: data.transaction.gas ? BigInt(data.transaction.gas) : undefined,
        routeInfo,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      console.error("[0x] Failed to fetch quote:", error);
      return null;
    }
  }
}

/**
 * Create a 0x client with the given config
 */
export function createZeroXClient(config: ZeroXClientConfig): ZeroXClient {
  return new ZeroXClient(config);
}

/**
 * Get the expected 0x router address for Monad
 */
export function getZeroXRouterAddress(): Address {
  return AGGREGATOR_CONFIGS["0x"].address;
}
