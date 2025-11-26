/**
 * Get Swap Quote Tool (Read-Only)
 *
 * Fetches swap quote from Monorail DEX aggregator without executing.
 * Use this tool for price checks, market info, and "what if" scenarios.
 *
 * This tool DOES NOT execute swaps - it only returns quote information.
 * Call executeSwap tool after user confirms the quote.
 */

import { tool } from "langchain";
import { z } from "zod";
import { Address, getAddress, formatUnits, parseUnits } from "viem";

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

// ============================================================================
// Configuration
// ============================================================================

// TODO: Protocol fee disabled until FeeEnforcer caveat is implemented
// const PROTOCOL_FEE_BPS = 50; // 0.5% = 50 basis points
const QUOTE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Resolve token from allowlist with proxy-based fallback for browser context.
 * Uses /api/monorail/token proxy to avoid CORS issues with direct Monorail Data API calls.
 * @param fetchFn - Optional authenticated fetch function (for browser context with auth)
 */
async function resolveTokenWithProxy(
  input: string,
  allowedTokens: AllowedToken[],
  fetchFn: typeof fetch = fetch
): Promise<AllowedToken | undefined> {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();

  // 1. Check allowlist by symbol (fast path)
  let token = allowedTokens.find((t) => t.symbol?.toLowerCase() === lower);
  if (token) return token;

  // 2. Check allowlist by address
  if (trimmed.startsWith("0x")) {
    token = allowedTokens.find((t) => t.address.toLowerCase() === lower);
    if (token) return token;

    // 3. Fallback: Fetch from Monorail via proxy (avoids CORS)
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
  const appId = process.env.MONORAIL_APP_ID || "pragma-h2";
  const pathfinderUrl = process.env.MONORAIL_PATHFINDER_URL || "https://testnet-pathfinder.monorail.xyz/v4";
  const aggregatorAddress =
    (process.env.MONORAIL_AGGREGATOR_ADDRESS as Address) ||
    ("0x525B929fCd6a64AfF834f4eeCc6E860486cED700" as Address);

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

      // Resolve token symbols to addresses (uses proxy for unknown tokens to avoid CORS)
      const resolvedFromToken = await resolveTokenWithProxy(fromToken, allowedTokens, fetchFn);
      const resolvedToToken = await resolveTokenWithProxy(toToken, allowedTokens, fetchFn);

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

      // Prepare quote request with NET amount (after fee deduction)
      // This ensures the quote reflects what we're actually swapping
      const quoteParams: QuoteRequestParams = {
        fromToken: fromTokenAddress,
        toToken: toTokenAddress,
        amountDecimal: netSwapAmountFormatted,  // Use net amount for quote
        sender: senderAddress,
        destination: senderAddress,
        maxSlippageBps: validatedSlippageBps,
      };

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

      // Progress: Requesting quote (with signature for routing, description for parent display)
      emitProgress(`Requesting quote from Monorail...`, "getSwapQuote", signature, resolvedDescription);

      // Fetch quote from Monorail with net swap amount
      const monorailConfig = getMonorailConfig();

      emitProgress(`Comparing routes across DEXs...`, "getSwapQuote", signature);
      const monorailQuote = await fetchMonorailQuote(quoteParams, monorailConfig);

      // Final output (no fee deduction from output - fee is charged separately on input)
      const finalOutputAmount = monorailQuote.rawOutput;

      // Format amounts for display
      const toTokenDecimals = resolvedToToken.decimals || 18;
      const finalOutputFormatted = formatUnits(finalOutputAmount, toTokenDecimals);
      const protocolFeeFormatted = formatUnits(protocolFeeAmount, fromTokenDecimals);
      const netSwapFormatted = formatUnits(netSwapAmount, fromTokenDecimals);

      // Generate and store quote
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
        monorailQuote: {
          quoteId: monorailQuote.quoteId,
          aggregator: monorailQuote.aggregator,
          transactionData: monorailQuote.transactionData,
          transactionValue: monorailQuote.transactionValue || 0n,
          rawInput: monorailQuote.rawInput,
          rawOutput: monorailQuote.rawOutput,
          rawMinOutput: monorailQuote.rawMinOutput,
          gasEstimate: monorailQuote.gasEstimate,
        },
        protocolFeeAmount,
        netSwapAmount,
        expectedOutputWei: finalOutputAmount,
        expectedOutput: finalOutputFormatted,
        createdAt: now,
        expiresAt: now + QUOTE_EXPIRY_MS,
        userAddress: senderAddress,
      };

      storeSwapQuote(quoteData);

      // Extract route names for display
      const routeNames = monorailQuote.routes?.map((r) => r.toSymbol || "unknown") || [];

      // Check if slippage was capped
      const slippageCappedWarning = slippageBps && slippageBps > MAX_SLIPPAGE_BPS
        ? `⚠️ Note: Slippage capped from ${(slippageBps / 100).toFixed(2)}% to maximum 15%\n\n`
        : '';

      // Build unverified warning if needed
      const unverifiedWarning = isUnverified
        ? `\n\n⚠️ WARNING: Token ${resolvedToToken.symbol || toToken} (${toTokenAddress}) is NOT verified by Monorail.\n\nThis token could be:\n- A scam or rug pull token\n- A honeypot (can buy but cannot sell)\n- A fee-on-transfer token\n- A malicious contract\n\nPragma is not responsible for losses from unverified tokens.`
        : '';

      // Return conversational quote
      return `${slippageCappedWarning}Swap quote ready:

• From: ${amount} ${fromToken} (${netSwapFormatted} ${fromToken} after 0.5% fee)
• To: ~${finalOutputFormatted} ${isUnverified ? '⚠️ ' : ''}${toToken}
• Protocol Fee: ${protocolFeeFormatted} ${fromToken} (0.5%)
• Price Impact: ${monorailQuote.compoundImpact || "unknown"}%
• Route: ${routeNames.join(" → ") || "Direct"}
• Gas Estimate: ${monorailQuote.gasEstimate ? formatUnits(monorailQuote.gasEstimate, 18) : "~0.002"} MON
• Slippage allowed: ${(validatedSlippageBps / 100).toFixed(2)}% (${validatedSlippageBps} bps)

Quote ID: ${quoteId}
Valid for: 5 minutes${unverifiedWarning}

This quote is ready to execute. Would you like me to proceed with the swap?`;
    } catch (error) {
      throw createErrorFromCode("QUOTE_RPC_ERROR", {
        message: `Failed to get swap quote: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "getSwapQuote",
    description: `Get a swap quote from Monorail DEX aggregator. Use this tool FIRST before executing swaps.

**IMPORTANT:** This tool does NOT execute swaps - it only fetches and stores a quote for user review.
After the user confirms, call executeSwap with the quote ID.

Use this tool when the user:
- Asks about prices: "what is the price of 1 MON in USDC?"
- Wants a quote: "quote me 0.5 ETH to USDC"
- Checks value: "how much USDC would I get for 1 MON?"
- Wants to see swap details before executing

Features:
- Best price aggregation across multiple DEXs on Monad
- Automatic routing optimization
- No protocol fee (FREE swaps during testing)
- Gas estimates
- Supports token symbols (ETH, USDC) and addresses (0x...)

Returns: Conversational quote with Quote ID for execution

Example inputs:
- fromToken: "MON" or "0x..." (symbol preferred)
- toToken: "USDC" or "0x..." (symbol preferred)
- amount: "1.5" (decimal string)
- slippageBps: 500 (optional, default 5% = 500 basis points)`,
    schema: z.object({
      fromToken: z.string().describe("Token to swap from (symbol like 'MON' or address like '0x...')"),
      toToken: z.string().describe("Token to swap to (symbol like 'USDC' or address like '0x...')"),
      amount: z.string().describe("Amount to swap (decimal string like '1.5')"),
      slippageBps: z.number().optional().describe("Max slippage in basis points (100 = 1%, default 500 = 5%)"),
    }),
  }
);
