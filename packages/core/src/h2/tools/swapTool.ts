/**
 * Swap Tool
 *
 * Implements token swaps using Monorail DEX aggregator with 0.5% protocol fee.
 */

import { tool } from "langchain";
import { z } from "zod";
import { Address, getAddress, formatUnits } from "viem";

import {
  fetchMonorailQuote,
  type QuoteRequestParams,
  type MonorailPathfinderConfig,
} from "../../monorail/pathfinder.js";
import { resolveTokenFromAllowlist, type AllowedToken } from "../../monorail/tokens.js";
import { createErrorFromCode } from "../../errors/index.js";

// ============================================================================
// Configuration
// ============================================================================

const PROTOCOL_FEE_BPS = 50; // 0.5% = 50 basis points

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
// Swap Tool Implementation
// ============================================================================

export const swapTool = tool(
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

      // Normalize token addresses
      const fromTokenAddress = resolvedFromToken.address;
      const toTokenAddress = resolvedToToken.address;
      const senderAddress = getAddress(userAddress as Address);

      // Prepare quote request
      const quoteParams: QuoteRequestParams = {
        fromToken: fromTokenAddress,
        toToken: toTokenAddress,
        amountDecimal: amount,
        sender: senderAddress,
        destination: senderAddress,
        maxSlippageBps: slippageBps || 100, // Default 1% slippage
      };

      // Fetch quote from Monorail
      const monorailConfig = getMonorailConfig();
      const quote = await fetchMonorailQuote(quoteParams, monorailConfig);

      // Calculate protocol fee (0.5% of output)
      const protocolFeeAmount = (quote.rawOutput * BigInt(PROTOCOL_FEE_BPS)) / BigInt(10000);
      const finalOutputAmount = quote.rawOutput - protocolFeeAmount;

      // Format amounts for display
      const outputFormatted = quote.outputFormatted || formatUnits(quote.rawOutput, 18);
      const feeFormatted = formatUnits(protocolFeeAmount, 18);
      const finalOutputFormatted = formatUnits(finalOutputAmount, 18);

      // Extract route names for display
      const routeNames = quote.routes?.map((r) => r.toSymbol || "unknown") || [];

      // Return both human-readable content (no structured artifact to avoid BigInt serialization issues)
      return `Swap quote ready:
• From: ${amount} ${fromToken} (${fromTokenAddress})
• To: ~${finalOutputFormatted} ${toToken} (${toTokenAddress})
• Price Impact: ${quote.compoundImpact || "unknown"}%
• Protocol Fee: ${feeFormatted} ${toToken} (0.5%)
• Route: ${routeNames.join(" → ") || "Direct"}
• Gas Estimate: ${quote.gasEstimate ? formatUnits(quote.gasEstimate, 18) : "unknown"} MON
• Quote ID: ${quote.quoteId}`;
    } catch (error) {
      throw createErrorFromCode("QUOTE_RPC_ERROR", {
        message: `Failed to get swap quote: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "swap",
    description: `Swap tokens using Monorail DEX aggregator. Automatically finds best prices across all DEXs on Monad.

Key Features:
- Best price aggregation across multiple DEXs
- Automatic routing optimization
- 0.5% Pragma protocol fee applies
- Gas-efficient execution
- Supports token symbols (ETH, USDC) and addresses (0x...)

Use this tool when the user wants to:
- Exchange one token for another
- Trade tokens
- Convert between assets

Example inputs:
- fromToken: "ETH" or "0x..." (token symbol or address, symbol preferred)
- toToken: "USDC" or "0x..." (token symbol or address, symbol preferred)
- amount: "1.5" (decimal string, amount of fromToken to swap)
- slippageBps: 100 (optional, default 1% = 100 basis points)

Note: userAddress is automatically provided from context - do not include it as a parameter.`,
    schema: z.object({
      fromToken: z.string().describe("Token to swap from (symbol like 'ETH' or address like '0x...')"),
      toToken: z.string().describe("Token to swap to (symbol like 'USDC' or address like '0x...')"),
      amount: z.string().describe("Amount to swap (decimal string like '1.5')"),
      slippageBps: z.number().optional().describe("Max slippage in basis points (100 = 1%, default 100)"),
    }),
  }
);
