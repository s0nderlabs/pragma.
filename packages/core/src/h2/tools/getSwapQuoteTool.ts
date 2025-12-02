/**
 * Get Swap Quote Tool (Read-Only)
 *
 * Fetches swap quotes from DEX aggregators (Monorail, 0x) in parallel.
 * Automatically selects the best quote by output amount.
 *
 * This tool DOES NOT execute swaps - it only returns quote information.
 * Call executeSwap tool after user confirms the quote.
 */

import { tool } from "langchain";
import { z } from "zod";
import { Address, getAddress, formatUnits, parseUnits, type Hex } from "viem";

import {
  fetchMonorailQuote,
  type QuoteRequestParams,
  type MonorailPathfinderConfig,
} from "../../monorail/pathfinder.js";
import { type AllowedToken } from "../../monorail/tokens.js";
import { createErrorFromCode } from "../../errors/index.js";
import { generateQuoteId, storeSwapQuote } from "../execution/quoteStore.js";
import type { SwapQuoteData } from "../execution/types.js";
import { calculateProtocolFee } from "../delegation/withFeeEnforcer.js";
import { PROTOCOL_FEES } from "../config.js";
import { emitProgress } from "../progress/emitter.js";
import type { StandardQuote, AggregatorName } from "../../aggregators/types.js";
import { AGGREGATOR_CONFIGS } from "../../aggregators/types.js";

// ============================================================================
// Configuration
// ============================================================================

// TODO: Protocol fee disabled until FeeEnforcer caveat is implemented
// const PROTOCOL_FEE_BPS = 50; // 0.5% = 50 basis points
const QUOTE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// Native token address representations
const NATIVE_TOKEN_ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const NATIVE_TOKEN_EIP7528_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address;

/**
 * Convert native token address from our internal format (zero address)
 * to the EIP-7528 format expected by external aggregators like 0x.
 * Monorail accepts zero address, but 0x requires 0xEeee...
 */
function toExternalNativeAddress(address: Address): Address {
  if (address.toLowerCase() === NATIVE_TOKEN_ZERO_ADDRESS.toLowerCase()) {
    return NATIVE_TOKEN_EIP7528_ADDRESS;
  }
  return address;
}

// ============================================================================
// Multi-Aggregator Helpers
// ============================================================================

/**
 * Fetch quote from 0x via API proxy route
 */
async function fetch0xQuote(
  fromToken: Address,
  toToken: Address,
  amountWei: bigint,
  sender: Address,
  slippageBps: number,
  fetchFn: typeof fetch
): Promise<StandardQuote | null> {
  try {
    const response = await fetchFn("/api/0x/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromToken,
        toToken,
        amountWei: amountWei.toString(),
        sender,
        slippageBps,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as {
      liquidityAvailable?: boolean;
      sellAmount?: string;
      buyAmount?: string;
      minBuyAmount?: string;
      transaction?: { to: string; data: string; gas?: string; value?: string };
      route?: { fills?: Array<{ source: string }> };
    };

    if (!data.liquidityAvailable || !data.transaction?.data) {
      return null;
    }

    return {
      aggregator: "0x",
      aggregatorAddress: getAddress(data.transaction.to) as Address,
      transactionData: data.transaction.data as Hex,
      transactionValue: BigInt(data.transaction.value || "0"),
      rawInput: BigInt(data.sellAmount || "0"),
      rawOutput: BigInt(data.buyAmount || "0"),
      rawMinOutput: BigInt(data.minBuyAmount || "0"),
      gasEstimate: data.transaction.gas ? BigInt(data.transaction.gas) : undefined,
      routeInfo: data.route?.fills?.[0]?.source,
      fetchedAt: Date.now(),
    };
  } catch (_error) {
    return null;
  }
}

/**
 * Convert Monorail quote to StandardQuote format
 */
function monorailToStandardQuote(
  monorailQuote: Awaited<ReturnType<typeof fetchMonorailQuote>>
): StandardQuote {
  return {
    aggregator: "monorail",
    aggregatorAddress: monorailQuote.aggregator,
    transactionData: monorailQuote.transactionData,
    transactionValue: monorailQuote.transactionValue || 0n,
    rawInput: monorailQuote.rawInput,
    rawOutput: monorailQuote.rawOutput,
    rawMinOutput: monorailQuote.rawMinOutput,
    gasEstimate: monorailQuote.gasEstimate,
    routeInfo: monorailQuote.routes?.[0]?.toSymbol,
    fetchedAt: Date.now(),
  };
}

/**
 * Fetch quotes from all aggregators in parallel (Monorail + 0x)
 * OKX removed due to constant 429 rate limit errors
 */
async function fetchAllAggregatorQuotes(
  fromToken: Address,
  toToken: Address,
  amountWei: bigint,
  fromTokenDecimals: number,
  sender: Address,
  slippageBps: number,
  fetchFn: typeof fetch,
  monorailConfig: MonorailPathfinderConfig
): Promise<{
  quotes: StandardQuote[];
  failedAggregators: Array<{ name: AggregatorName; error: string }>;
}> {
  const quoteParams: QuoteRequestParams = {
    fromToken,
    toToken,
    amountDecimal: formatUnits(amountWei, fromTokenDecimals), // Use actual token decimals
    sender,
    destination: sender,
    maxSlippageBps: slippageBps,
  };

  // Convert native token addresses for 0x (expects 0xEeee... format)
  const externalFromToken = toExternalNativeAddress(fromToken);
  const externalToToken = toExternalNativeAddress(toToken);

  const results = await Promise.allSettled([
    // Monorail - direct API call (no auth needed) - accepts zero address
    fetchMonorailQuote(quoteParams, monorailConfig)
      .then(monorailToStandardQuote)
      .catch((e) => { throw new Error(`Monorail: ${e.message}`); }),
    // 0x - via API proxy - requires 0xEeee... for native token
    fetch0xQuote(externalFromToken, externalToToken, amountWei, sender, slippageBps, fetchFn),
  ]);

  const quotes: StandardQuote[] = [];
  const failedAggregators: Array<{ name: AggregatorName; error: string }> = [];
  const aggregatorNames: AggregatorName[] = ["monorail", "0x"];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const name = aggregatorNames[i];

    if (result.status === "fulfilled" && result.value) {
      quotes.push(result.value);
    } else if (result.status === "rejected") {
      failedAggregators.push({ name, error: result.reason?.message || "Unknown error" });
    } else {
      failedAggregators.push({ name, error: "No liquidity or route available" });
    }
  }

  // Sort by rawOutput (highest first = best price)
  quotes.sort((a, b) => {
    const diff = b.rawOutput - a.rawOutput;
    if (diff > 0n) return 1;
    if (diff < 0n) return -1;
    return 0;
  });

  return { quotes, failedAggregators };
}

/**
 * User balance data interface (minimal, from Monorail balances API)
 */
interface UserBalanceToken {
  address: string;
  symbol?: string;
  name?: string;
  decimals: number;
  categories?: string[];
}

/**
 * Resolve token from allowlist with multi-tier fallback for browser context.
 *
 * Resolution order (4-tier fallback):
 * 1. Verified allowlist (fast, ~19 tokens on mainnet)
 * 2. User balance data (fast, tokens user owns - enables unverified token swaps)
 * 3. Monorail symbol search (API call, ALL tokens on Monad by symbol)
 * 4. Monorail address lookup (API call, direct address resolution)
 *
 * @param input - Token symbol or address
 * @param allowedTokens - Verified token allowlist
 * @param fetchFn - Authenticated fetch function (for browser context with auth)
 * @param userBalances - User's balance data (for unverified token symbol resolution)
 */
async function resolveTokenWithProxy(
  input: string,
  allowedTokens: AllowedToken[],
  fetchFn: typeof fetch = fetch,
  userBalances?: UserBalanceToken[]
): Promise<AllowedToken | undefined> {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();

  // 1. Check allowlist by symbol (fast path - verified tokens)
  let token = allowedTokens.find((t) => t.symbol?.toLowerCase() === lower);
  if (token) return token;

  // 2. Check allowlist by address
  if (trimmed.startsWith("0x")) {
    token = allowedTokens.find((t) => t.address.toLowerCase() === lower);
    if (token) return token;
  }

  // 3. Check user's balance data by symbol (unverified tokens user owns)
  if (userBalances && !trimmed.startsWith("0x")) {
    const balanceMatch = userBalances.find(
      (b) => b.symbol?.toLowerCase() === lower
    );
    if (balanceMatch) {
      return {
        address: getAddress(balanceMatch.address as Address),
        symbol: balanceMatch.symbol,
        name: balanceMatch.name,
        decimals: balanceMatch.decimals,
        categories: balanceMatch.categories,
      };
    }
  }

  // 4. Search Monorail API by symbol (any token on Monad)
  if (!trimmed.startsWith("0x")) {
    try {
      const searchResponse = await fetchFn(
        `/api/monorail/search?q=${encodeURIComponent(trimmed)}`
      );
      if (searchResponse.ok) {
        const results = await searchResponse.json() as UserBalanceToken[];
        // Find exact symbol match (case-insensitive)
        const match = results.find(
          (r) => r.symbol?.toLowerCase() === lower
        );
        if (match) {
          return {
            address: getAddress(match.address as Address),
            symbol: match.symbol,
            name: match.name,
            decimals: match.decimals,
            categories: match.categories,
          };
        }
      }
    } catch {
      // Search failed, continue to address lookup
    }
  }

  // 5. Fallback: Fetch from Monorail by address via proxy (avoids CORS)
  if (trimmed.startsWith("0x")) {
    try {
      const checksumAddress = getAddress(trimmed as Address);
      const response = await fetchFn(`/api/monorail/token?address=${checksumAddress}`);

      if (response.ok) {
        return await response.json() as AllowedToken;
      }
      // 404 = token not found, return undefined
    } catch {
      // Proxy error, return undefined
    }
  }

  return undefined;
}

/**
 * Get Monorail configuration from environment
 */
function getMonorailConfig(): MonorailPathfinderConfig {
  // Check both prefixed (Next.js) and non-prefixed env vars for compatibility
  const appId = process.env.MONORAIL_APP_ID || process.env.NEXT_PUBLIC_MONORAIL_APP_ID || "4101175973046541";
  const pathfinderUrl = process.env.MONORAIL_PATHFINDER_URL || process.env.NEXT_PUBLIC_MONORAIL_PATHFINDER_URL || "https://pathfinder.monorail.xyz/v4";
  const aggregatorAddress =
    (process.env.MONORAIL_AGGREGATOR_ADDRESS as Address) ||
    (process.env.NEXT_PUBLIC_MONORAIL_AGGREGATOR_ADDRESS as Address) ||
    ("0xA68A7F0601effDc65C64d9C47cA1b18D96B4352c" as Address);

  return {
    appId,
    pathfinderUrl,
    aggregatorAddress,
  };
}

// ============================================================================
// Get Swap Quote Tool Implementation
// ============================================================================

export const getSwapQuoteTool = tool(
  async ({ fromToken, toToken, amount, slippageBps }, config) => {
    try {
      // Get context
      const allowedTokens = (config?.configurable?.allowedTokens as AllowedToken[]) || [];
      const userAddress = config?.configurable?.userAddress as string;

      if (!userAddress) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "User address is required but not provided in context.",
          context: { field: "userAddress" },
        });
      }

      // Validate and cap slippage at 15% (1500 bps)
      const MAX_SLIPPAGE_BPS = 1500; // 15%
      const DEFAULT_SLIPPAGE_BPS = 500; // 5%
      let validatedSlippageBps = slippageBps || DEFAULT_SLIPPAGE_BPS;

      if (validatedSlippageBps > MAX_SLIPPAGE_BPS) {
        validatedSlippageBps = MAX_SLIPPAGE_BPS;
      }

      // Get authenticated fetch from configurable (for browser context with auth)
      const fetchFn = (config?.configurable?.fetch as typeof fetch) || fetch;

      // Get user balances for unverified token symbol resolution
      const userBalances = config?.configurable?.userBalances as UserBalanceToken[] | undefined;

      // Resolve token symbols to addresses (multi-tier fallback: allowlist → balance → search → address)
      const resolvedFromToken = await resolveTokenWithProxy(fromToken, allowedTokens, fetchFn, userBalances);
      const resolvedToToken = await resolveTokenWithProxy(toToken, allowedTokens, fetchFn, userBalances);

      if (!resolvedFromToken) {
        throw createErrorFromCode("TOKEN_NOT_IN_ALLOWLIST", {
          message: `Token "${fromToken}" not found.`,
          context: { token: fromToken },
        });
      }

      if (!resolvedToToken) {
        throw createErrorFromCode("TOKEN_NOT_IN_ALLOWLIST", {
          message: `Token "${toToken}" not found.`,
          context: { token: toToken },
        });
      }

      // Detect unverified status (only check destination token)
      const isUnverified = !resolvedToToken.categories?.includes('verified');

      // Normalize addresses and get decimals
      const fromTokenAddress = resolvedFromToken.address;
      const toTokenAddress = resolvedToToken.address;
      const senderAddress = getAddress(userAddress as Address);
      const fromTokenDecimals = resolvedFromToken.decimals || 18;

      // Calculate protocol fee FIRST (charged on input amount)
      const amountWei = parseUnits(amount, fromTokenDecimals);
      const protocolFeeAmount = calculateProtocolFee(amountWei, PROTOCOL_FEES.swap);

      // Calculate net swap amount (input minus fee)
      // This is the actual amount that will be swapped via Monorail
      const netSwapAmount = amountWei - protocolFeeAmount;
      const netSwapAmountFormatted = formatUnits(netSwapAmount, fromTokenDecimals);

      // Create signature from RAW input for matching with browserAgentRunner
      // browserAgentRunner uses raw LLM input (may be addresses), so we must match exactly
      // Prefix with toolName to prevent collisions with executeSwap
      const signature = `getSwapQuote:${fromToken.toUpperCase()}-${toToken.toUpperCase()}`;

      // Helper to get display symbol with proper fallbacks
      const getDisplaySymbol = (token: { symbol?: string; address: string }, rawInput: string): string => {
        // 1. Use resolved symbol if available
        if (token.symbol) return token.symbol;

        // 2. Check for native token address (0x000...0) - this is MON on Monad
        const nativeAddress = "0x0000000000000000000000000000000000000000";
        if (token.address.toLowerCase() === nativeAddress || rawInput.toLowerCase() === nativeAddress) {
          return "MON";
        }

        // 3. Fallback to truncated address for unknown tokens
        const addr = token.address || rawInput;
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
      };

      // Build resolved description for parent tool display (uses actual symbols with fallbacks)
      const fromDisplaySymbol = getDisplaySymbol(resolvedFromToken, fromToken);
      const toDisplaySymbol = getDisplaySymbol(resolvedToToken, toToken);
      const resolvedDescription = `Swap ${amount} ${fromDisplaySymbol} → ${toDisplaySymbol}`;

      // Progress: Requesting quotes from all aggregators
      emitProgress(`Fetching Quotes from DEX Aggregators...`, "getSwapQuote", signature, resolvedDescription);

      // Fetch quotes from aggregators in parallel (Monorail + 0x)
      const monorailConfig = getMonorailConfig();

      emitProgress(`Comparing Routes Across Monorail, 0x...`, "getSwapQuote", signature);
      const { quotes: rankedQuotes, failedAggregators } = await fetchAllAggregatorQuotes(
        fromTokenAddress,
        toTokenAddress,
        netSwapAmount,  // Use net amount (after fee deduction)
        fromTokenDecimals, // Pass actual token decimals for Monorail
        senderAddress,
        validatedSlippageBps,
        fetchFn,
        monorailConfig
      );

      // Require at least one successful quote
      if (rankedQuotes.length === 0) {
        const failureReasons = failedAggregators.map(f => `${f.name}: ${f.error}`).join(", ");
        throw createErrorFromCode("QUOTE_RPC_ERROR", {
          message: `No aggregators returned a valid quote. Failures: ${failureReasons}`,
          context: { failedAggregators },
        });
      }

      // Best quote is first in the sorted list
      const bestQuote = rankedQuotes[0];
      const finalOutputAmount = bestQuote.rawOutput;

      // Format amounts for display
      const toTokenDecimals = resolvedToToken.decimals || 18;
      const finalOutputFormatted = formatUnits(finalOutputAmount, toTokenDecimals);
      const protocolFeeFormatted = formatUnits(protocolFeeAmount, fromTokenDecimals);
      const netSwapFormatted = formatUnits(netSwapAmount, fromTokenDecimals);

      // Generate and store quote with ALL ranked quotes for fallback execution
      const quoteId = generateQuoteId();
      const now = Date.now();

      const quoteData: SwapQuoteData = {
        quoteId,
        fromToken: fromTokenAddress,
        toToken: toTokenAddress,
        fromTokenSymbol: fromDisplaySymbol,
        toTokenSymbol: toDisplaySymbol,
        fromTokenDecimals,
        toTokenDecimals,
        amount,
        amountWei,
        slippageBps: validatedSlippageBps,
        rankedQuotes,
        failedAggregators,
        currentAggregatorIndex: 0, // Start with best quote
        protocolFeeAmount,
        netSwapAmount,
        expectedOutputWei: finalOutputAmount,
        expectedOutput: finalOutputFormatted,
        createdAt: now,
        expiresAt: now + QUOTE_EXPIRY_MS,
        userAddress: senderAddress,
      };

      storeSwapQuote(quoteData);

      // Check if slippage was capped
      const slippageCappedWarning = slippageBps && slippageBps > MAX_SLIPPAGE_BPS
        ? `⚠️ Note: Slippage capped from ${(slippageBps / 100).toFixed(2)}% to maximum 15%\n\n`
        : '';

      // Build unverified warning if needed
      const unverifiedWarning = isUnverified
        ? `\n\n⚠️ WARNING: Token ${resolvedToToken.symbol || toToken} (${toTokenAddress}) is NOT verified by Monorail.\n\nThis token could be:\n- A scam or rug pull token\n- A honeypot (can buy but cannot sell)\n- A fee-on-transfer token\n- A malicious contract\n\nPragma is not responsible for losses from unverified tokens.`
        : '';

      // Return conversational quote (aggregator selection is automatic/hidden from user)
      return `${slippageCappedWarning}Swap quote ready:

• From: ${amount} ${fromToken} (${netSwapFormatted} ${fromToken} after 1% fee)
• To: ~${finalOutputFormatted} ${isUnverified ? '⚠️ ' : ''}${toToken}
• Protocol Fee: ${protocolFeeFormatted} ${fromToken} (1%)
• Route: ${bestQuote.routeInfo || "Best available"}
• Gas Estimate: ${bestQuote.gasEstimate ? formatUnits(bestQuote.gasEstimate, 18) : "~0.002"} MON
• Slippage allowed: ${(validatedSlippageBps / 100).toFixed(2)}% (${validatedSlippageBps} bps)
• Sources checked: ${rankedQuotes.length + failedAggregators.length} DEX aggregators

Quote ID: ${quoteId}
Valid for: 5 minutes${unverifiedWarning}

This quote is ready to execute. Would you like me to proceed with the swap?`;
    } catch (error) {
      const err = error as Error;

      throw createErrorFromCode("QUOTE_RPC_ERROR", {
        message: `Failed to get swap quote: ${err.message}`,
        cause: error,
      });
    }
  },
  {
    name: "getSwapQuote",
    description: "Get best swap quote from multiple DEX aggregators. Returns quote ID for executeSwap. Automatically selects best price with fallback support.",
    schema: z.object({
      fromToken: z.string().describe("Token to swap from (symbol like 'MON' or address like '0x...')"),
      toToken: z.string().describe("Token to swap to (symbol like 'USDC' or address like '0x...')"),
      amount: z.string().describe("Amount to swap (decimal string like '1.5')"),
      slippageBps: z.number().optional().describe("Max slippage in basis points (100 = 1%, default 500 = 5%, max 1500 = 15%)"),
    }),
  }
);
