/**
 * Swap Tool
 *
 * Implements token swaps using Monorail DEX aggregator. No protocol fee (FREE during testing).
 */

import { tool } from "langchain";
import { z } from "zod";
import { Address, getAddress, formatUnits } from "viem";

import {
  fetchMonorailQuote,
  type QuoteRequestParams,
  type MonorailPathfinderConfig,
} from "../../monorail/pathfinder.js";
import { type AllowedToken } from "../../monorail/tokens.js";
import { createErrorFromCode } from "../../errors/index.js";

// ============================================================================
// Configuration
// ============================================================================

// TODO: Protocol fee disabled until FeeEnforcer caveat is implemented
// const PROTOCOL_FEE_BPS = 50; // 0.5% = 50 basis points

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

      // TODO: Protocol fee calculation removed until FeeEnforcer caveat is implemented
      // Using full Monorail output (no fee subtraction)
      const finalOutputAmount = quote.rawOutput;

      // Format amounts for display using actual token decimals
      const toTokenDecimals = resolvedToToken.decimals || 18;
      const outputFormatted = quote.outputFormatted || formatUnits(quote.rawOutput, toTokenDecimals);
      const finalOutputFormatted = formatUnits(finalOutputAmount, toTokenDecimals);

      // Extract route names for display
      const routeNames = quote.routes?.map((r) => r.toSymbol || "unknown") || [];

      // Build unverified warning if needed
      const unverifiedWarning = isUnverified
        ? `\n\n⚠️ WARNING: Token ${resolvedToToken.symbol || toToken} (${toTokenAddress}) is NOT verified by Monorail.\n\nThis token could be:\n- A scam or rug pull token\n- A honeypot (can buy but cannot sell)\n- A fee-on-transfer token\n- A malicious contract\n\nPragma is not responsible for losses from unverified tokens.`
        : '';

      // Return both human-readable content (no structured artifact to avoid BigInt serialization issues)
      return `Swap quote ready:
• From: ${amount} ${fromToken} (${fromTokenAddress})
• To: ~${finalOutputFormatted} ${isUnverified ? '⚠️ ' : ''}${toToken} (${toTokenAddress})
• Price Impact: ${quote.compoundImpact || "unknown"}%
• Route: ${routeNames.join(" → ") || "Direct"}
• Gas Estimate: ${quote.gasEstimate ? formatUnits(quote.gasEstimate, 18) : "unknown"} MON
• Quote ID: ${quote.quoteId}${unverifiedWarning}`;
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
- No protocol fee (FREE swaps during testing)
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
