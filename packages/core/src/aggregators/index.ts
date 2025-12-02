/**
 * Multi-Aggregator System
 *
 * Provides a unified interface for fetching quotes from multiple DEX aggregators
 * (Monorail, 0x, OKX) and selecting the best quote.
 */

export * from "./types.js";
export * from "./monorail.js";
export * from "./0x.js";
export * from "./okx.js";

import type { Address } from "viem";

import type {
  AggregatorClient,
  AggregatorName,
  MultiAggregatorQuoteResult,
  QuoteRequest,
  StandardQuote,
} from "./types.js";
import { MonorailClient, type MonorailClientConfig } from "./monorail.js";
import { ZeroXClient, type ZeroXClientConfig } from "./0x.js";
import { OkxClient, type OkxClientConfig } from "./okx.js";

/**
 * Configuration for the multi-aggregator system
 */
export interface MultiAggregatorConfig {
  monorail?: MonorailClientConfig;
  zeroX?: ZeroXClientConfig;
  okx?: OkxClientConfig;
}

/**
 * Create aggregator clients based on provided configuration
 */
export function createAggregatorClients(config: MultiAggregatorConfig): AggregatorClient[] {
  const clients: AggregatorClient[] = [];

  if (config.monorail) {
    clients.push(new MonorailClient(config.monorail));
  }

  if (config.zeroX) {
    clients.push(new ZeroXClient(config.zeroX));
  }

  if (config.okx) {
    clients.push(new OkxClient(config.okx));
  }

  return clients;
}

/**
 * Fetch quotes from all configured aggregators in parallel
 *
 * @param request - Quote request parameters
 * @param clients - Array of aggregator clients to use
 * @returns Quotes sorted by output amount (best first) and failure info
 */
export async function fetchAllQuotes(
  request: QuoteRequest,
  clients: AggregatorClient[]
): Promise<MultiAggregatorQuoteResult> {
  const startTime = Date.now();

  const results = await Promise.allSettled(
    clients.map(async (client) => {
      try {
        const quote = await client.fetchQuote(request);
        return { name: client.name, quote };
      } catch (error) {
        return {
          name: client.name,
          quote: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );

  const quotes: StandardQuote[] = [];
  const failedAggregators: Array<{ name: AggregatorName; error: string }> = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value.quote) {
        quotes.push(result.value.quote);
      } else if ("error" in result.value && result.value.error) {
        failedAggregators.push({
          name: result.value.name,
          error: result.value.error,
        });
      } else {
        failedAggregators.push({
          name: result.value.name,
          error: "No liquidity or route available",
        });
      }
    } else {
      // Promise rejected (should be rare since we catch internally)
      const clientIndex = results.indexOf(result);
      const clientName = clients[clientIndex]?.name ?? "unknown";
      failedAggregators.push({
        name: clientName as AggregatorName,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  // Sort quotes by output amount (highest first = best price)
  quotes.sort((a, b) => {
    const diff = b.rawOutput - a.rawOutput;
    if (diff > 0n) return 1;
    if (diff < 0n) return -1;
    return 0;
  });

  const fetchDurationMs = Date.now() - startTime;

  return {
    quotes,
    failedAggregators,
    fetchDurationMs,
  };
}

/**
 * Select the best quote from a list of quotes
 */
export function selectBestQuote(quotes: StandardQuote[]): StandardQuote | null {
  return quotes[0] ?? null;
}

/**
 * Get the aggregator address for a given aggregator name
 */
export function getAggregatorAddress(name: AggregatorName): Address {
  const { AGGREGATOR_CONFIGS } = require("./types.js");
  return AGGREGATOR_CONFIGS[name].address;
}

/**
 * Log a summary of multi-aggregator quote results
 */
export function logQuoteSummary(result: MultiAggregatorQuoteResult): void {
  console.log(`[MultiAggregator] Fetched ${result.quotes.length} quotes in ${result.fetchDurationMs}ms`);

  if (result.quotes.length > 0) {
    console.log("[MultiAggregator] Quote ranking:");
    for (let i = 0; i < result.quotes.length; i++) {
      const quote = result.quotes[i];
      console.log(`  ${i + 1}. ${quote.aggregator}: ${quote.rawOutput.toString()} (via ${quote.routeInfo ?? "unknown"})`);
    }
  }

  if (result.failedAggregators.length > 0) {
    console.log("[MultiAggregator] Failed aggregators:");
    for (const failed of result.failedAggregators) {
      console.log(`  - ${failed.name}: ${failed.error}`);
    }
  }
}
