/**
 * OKX DEX Aggregator Client
 *
 * Fetches swap quotes from OKX DEX API for Monad mainnet (chainIndex: 143).
 * Uses the /swap endpoint which returns both quote info and transaction calldata.
 * Requires HMAC-SHA256 authentication.
 */

import crypto from "crypto";
import type { Address, Hex } from "viem";
import { getAddress } from "viem";

import type {
  AggregatorClient,
  QuoteRequest,
  StandardQuote,
} from "./types.js";
import { AGGREGATOR_CONFIGS } from "./types.js";

/**
 * OKX API response types
 */
interface OkxTransaction {
  to: string;
  data: string;
  gas: string;
  gasPrice: string;
  value: string;
  from: string;
  minReceiveAmount: string;
  slippagePercent: string;
}

interface OkxDexProtocol {
  dexName: string;
  percent: string;
}

interface OkxDexRouter {
  dexProtocol: OkxDexProtocol;
}

interface OkxRouterResult {
  fromTokenAmount: string;
  toTokenAmount: string;
  dexRouterList?: OkxDexRouter[];
}

interface OkxSwapData {
  routerResult: OkxRouterResult;
  tx: OkxTransaction;
}

interface OkxSwapResponse {
  code: string;
  msg: string;
  data?: OkxSwapData[];
}

/**
 * Configuration for the OKX client
 */
export interface OkxClientConfig {
  /** OKX API key */
  apiKey: string;
  /** OKX secret key for HMAC signing */
  secretKey: string;
  /** OKX passphrase */
  passphrase: string;
  /** Custom fetch function (for proxy routing) */
  fetch?: typeof fetch;
  /** Chain index (default: "143" for Monad) */
  chainIndex?: string;
}

/**
 * OKX DEX Aggregator Client
 */
export class OkxClient implements AggregatorClient {
  readonly name = "okx" as const;

  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly passphrase: string;
  private readonly fetchFn: typeof fetch;
  private readonly chainIndex: string;
  private readonly baseUrl = "https://web3.okx.com";

  constructor(config: OkxClientConfig) {
    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
    this.passphrase = config.passphrase;
    this.fetchFn = config.fetch ?? fetch;
    this.chainIndex = config.chainIndex ?? "143"; // Monad mainnet
  }

  /**
   * Generate HMAC-SHA256 signature for OKX API authentication
   */
  private generateSignature(timestamp: string, method: string, requestPath: string, query: string): string {
    const stringToSign = `${timestamp}${method}${requestPath}${query}`;
    return crypto
      .createHmac("sha256", this.secretKey)
      .update(stringToSign)
      .digest("base64");
  }

  /**
   * Fetch a quote from OKX
   */
  async fetchQuote(request: QuoteRequest): Promise<StandardQuote | null> {
    // Convert slippage from bps to percentage (100 bps = 1%)
    const slippagePercent = request.slippageBps / 100;

    const timestamp = new Date().toISOString();
    const requestPath = "/api/v6/dex/aggregator/swap";
    const query = `?chainIndex=${this.chainIndex}&fromTokenAddress=${request.fromToken}&toTokenAddress=${request.toToken}&amount=${request.amountWei.toString()}&slippagePercent=${slippagePercent}&userWalletAddress=${request.sender}`;

    const signature = this.generateSignature(timestamp, "GET", requestPath, query);

    try {
      const response = await this.fetchFn(`${this.baseUrl}${requestPath}${query}`, {
        method: "GET",
        headers: {
          "OK-ACCESS-KEY": this.apiKey,
          "OK-ACCESS-SIGN": signature,
          "OK-ACCESS-TIMESTAMP": timestamp,
          "OK-ACCESS-PASSPHRASE": this.passphrase,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OKX] Quote request failed (${response.status}):`, errorText);
        return null;
      }

      const data = (await response.json()) as OkxSwapResponse;

      if (data.code !== "0") {
        console.error(`[OKX] API error (${data.code}):`, data.msg);
        return null;
      }

      const swapData = data.data?.[0];
      if (!swapData?.tx?.data) {
        console.error("[OKX] Quote response missing transaction data");
        return null;
      }

      const { routerResult, tx } = swapData;

      // Extract route info from the first DEX in the router list
      const routeInfo = routerResult.dexRouterList?.[0]?.dexProtocol?.dexName;

      // Calculate min output from slippage
      const toTokenAmount = BigInt(routerResult.toTokenAmount);
      const minReceiveAmount = tx.minReceiveAmount
        ? BigInt(tx.minReceiveAmount)
        : toTokenAmount * BigInt(10000 - request.slippageBps) / 10000n;

      return {
        aggregator: "okx",
        aggregatorAddress: getAddress(tx.to) as Address,
        transactionData: tx.data as Hex,
        transactionValue: BigInt(tx.value || "0"),
        rawInput: BigInt(routerResult.fromTokenAmount),
        rawOutput: toTokenAmount,
        rawMinOutput: minReceiveAmount,
        gasEstimate: tx.gas ? BigInt(tx.gas) : undefined,
        routeInfo,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      console.error("[OKX] Failed to fetch quote:", error);
      return null;
    }
  }
}

/**
 * Create an OKX client with the given config
 */
export function createOkxClient(config: OkxClientConfig): OkxClient {
  return new OkxClient(config);
}

/**
 * Get the expected OKX router address for Monad
 */
export function getOkxRouterAddress(): Address {
  return AGGREGATOR_CONFIGS.okx.address;
}
