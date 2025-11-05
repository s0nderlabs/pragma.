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
import { resolveTokenFromAllowlist, type AllowedToken } from "../../monorail/tokens.js";
import { createErrorFromCode } from "../../errors/index.js";
import { generateQuoteId, storeSwapQuote } from "../execution/quoteStore.js";
import type { SwapQuoteData } from "../execution/types.js";

// ============================================================================
// Configuration
// ============================================================================

// TODO: Protocol fee disabled until FeeEnforcer caveat is implemented
// const PROTOCOL_FEE_BPS = 50; // 0.5% = 50 basis points
const QUOTE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get Monorail configuration from environment
 */
function getMonorailConfig(): MonorailPathfinderConfig {
  const appId = process.env.MONORAIL_APP_ID || "pragma-h2";
  const pathfinderUrl = process.env.MONORAIL_PATHFINDER_URL || "https://testnet-pathfinder.monorail.xyz/v4";
  const aggregatorAddress =
    (process.env.MONORAIL_AGGREGATOR_ADDRESS as Address) ||
    ("0x525B929fCd6a64AfF834f4eeCc6E860486cED700" as Address);
  const apiKey = process.env.MONORAIL_API_KEY;

  return {
    appId,
    pathfinderUrl,
    aggregatorAddress,
    apiKey,
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
      const DEFAULT_SLIPPAGE_BPS = 100; // 1%
      let validatedSlippageBps = slippageBps || DEFAULT_SLIPPAGE_BPS;

      if (validatedSlippageBps > MAX_SLIPPAGE_BPS) {
        validatedSlippageBps = MAX_SLIPPAGE_BPS;
      }

      // Resolve token symbols to addresses
      const resolvedFromToken = resolveTokenFromAllowlist(fromToken, allowedTokens);
      const resolvedToToken = resolveTokenFromAllowlist(toToken, allowedTokens);

      if (!resolvedFromToken) {
        throw createErrorFromCode("TOKEN_NOT_IN_ALLOWLIST", {
          message: `Token "${fromToken}" not found in allowlist. Please provide a valid token symbol or address.`,
          context: { token: fromToken },
        });
      }

      if (!resolvedToToken) {
        throw createErrorFromCode("TOKEN_NOT_IN_ALLOWLIST", {
          message: `Token "${toToken}" not found in allowlist. Please provide a valid token symbol or address.`,
          context: { token: toToken },
        });
      }

      // Normalize addresses and get decimals
      const fromTokenAddress = resolvedFromToken.address;
      const toTokenAddress = resolvedToToken.address;
      const senderAddress = getAddress(userAddress as Address);
      const fromTokenDecimals = resolvedFromToken.decimals || 18;

      // Prepare quote request
      const quoteParams: QuoteRequestParams = {
        fromToken: fromTokenAddress,
        toToken: toTokenAddress,
        amountDecimal: amount,
        sender: senderAddress,
        destination: senderAddress,
        maxSlippageBps: validatedSlippageBps,
      };

      // Fetch quote from Monorail
      const monorailConfig = getMonorailConfig();
      const monorailQuote = await fetchMonorailQuote(quoteParams, monorailConfig);

      // TODO: Protocol fee calculation removed until FeeEnforcer caveat is implemented
      // Using full Monorail output (no fee subtraction)
      const finalOutputAmount = monorailQuote.rawOutput;

      // Format amounts for display
      const toTokenDecimals = resolvedToToken.decimals || 18;
      const finalOutputFormatted = formatUnits(finalOutputAmount, toTokenDecimals);

      // Generate and store quote
      const quoteId = generateQuoteId();
      const now = Date.now();

      const quoteData: SwapQuoteData = {
        quoteId,
        fromToken: fromTokenAddress,
        toToken: toTokenAddress,
        fromTokenSymbol: resolvedFromToken.symbol || fromToken,
        toTokenSymbol: resolvedToToken.symbol || toToken,
        fromTokenDecimals,
        toTokenDecimals,
        amount,
        amountWei: parseUnits(amount, fromTokenDecimals),
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
        // TODO: Add protocolFeeAmount when FeeEnforcer is implemented
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

      // Return conversational quote
      return `${slippageCappedWarning}Swap quote ready:

• From: ${amount} ${fromToken}
• To: ~${finalOutputFormatted} ${toToken}
• Price Impact: ${monorailQuote.compoundImpact || "unknown"}%
• Route: ${routeNames.join(" → ") || "Direct"}
• Gas Estimate: ${monorailQuote.gasEstimate ? formatUnits(monorailQuote.gasEstimate, 18) : "~0.002"} MON
• Slippage allowed: ${(validatedSlippageBps / 100).toFixed(2)}% (${validatedSlippageBps} bps)

Quote ID: ${quoteId}
Valid for: 5 minutes

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
- slippageBps: 100 (optional, default 1% = 100 basis points)`,
    schema: z.object({
      fromToken: z.string().describe("Token to swap from (symbol like 'MON' or address like '0x...')"),
      toToken: z.string().describe("Token to swap to (symbol like 'USDC' or address like '0x...')"),
      amount: z.string().describe("Amount to swap (decimal string like '1.5')"),
      slippageBps: z.number().optional().describe("Max slippage in basis points (100 = 1%, default 100)"),
    }),
  }
);
