/**
 * Get All Balances Tool
 *
 * Fetches ALL token balances for the user's portfolio via Monorail API.
 * Single API call returns complete portfolio with USD values.
 *
 * Use this tool when:
 * - User asks "show my balances", "what do I have", "my portfolio"
 * - Before batch operations (get all balances at once)
 * - When planning multiple swaps
 *
 * For single token queries, use getBalance tool instead.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { formatUnits, parseUnits, getAddress, type Address } from "viem";

import { fetchWalletBalances, normalizeBalances } from "../../monorail/balances.js";
import { createErrorFromCode } from "../../errors/index.js";
import { emitProgress } from "../progress/emitter.js";

// ============================================================================
// Configuration
// ============================================================================

const MONORAIL_DATA_API_URL =
  process.env.MONORAIL_DATA_API_URL || "https://testnet-api.monorail.xyz/v1";
const MONORAIL_API_KEY = process.env.MONORAIL_API_KEY || process.env.MONORAIL_APP_ID;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format balance with USD value
 */
const formatBalanceWithUsd = (
  balanceFormatted: string,
  symbol: string,
  usdPerToken?: string,
  monValue?: string
): string => {
  // Calculate and show USD value if price available
  if (usdPerToken) {
    const amount = parseFloat(balanceFormatted);
    const usdValue = amount * parseFloat(usdPerToken);
    return `${balanceFormatted} ${symbol} ($${usdValue.toFixed(2)})`;
  }

  // Fallback to MON value
  if (monValue) {
    return `${balanceFormatted} ${symbol} (~${monValue} MON)`;
  }

  // No value information available
  return `${balanceFormatted} ${symbol}`;
};

/**
 * Safely convert balance string to BigInt
 */
const safeBalanceToBigInt = (balanceStr: string, decimals: number): bigint => {
  try {
    const balance = BigInt(balanceStr);
    // ERC20 balances cannot be negative (uint256 is unsigned) - clamp to 0
    if (balance < 0n) {
      return 0n;
    }
    return balance;
  } catch {
    try {
      const balance = parseUnits(balanceStr, decimals);
      if (balance < 0n) {
        return 0n;
      }
      return balance;
    } catch {
      return BigInt(0);
    }
  }
};

// ============================================================================
// Tool Implementation
// ============================================================================

export const getAllBalancesTool = tool(
  async (_input, config) => {
    try {
      // Get user address from config
      const userAddress = config?.configurable?.userAddress as Address | undefined;

      if (!userAddress) {
        throw createErrorFromCode("SESSION_INCOMPLETE", {
          message: "User address not found in session. Cannot fetch balances.",
        });
      }

      // Progress: Fetching balances
      emitProgress("Fetching your portfolio from Monad...");

      // Fetch all balances from Monorail API (single call)
      const rawBalances = await fetchWalletBalances(getAddress(userAddress), {
        dataApiUrl: MONORAIL_DATA_API_URL,
        apiKey: MONORAIL_API_KEY,
      });

      const balances = normalizeBalances(rawBalances);

      // Progress: Calculating values
      emitProgress("Calculating USD values...");

      // Format all non-zero balances with USD values
      let totalPortfolioUsd = 0;
      const nonZeroBalances = balances
        .map((bal) => {
          const balanceBigInt = safeBalanceToBigInt(bal.balance || "0", bal.decimals);
          const balanceFormatted = formatUnits(balanceBigInt, bal.decimals);
          const balanceFloat = parseFloat(balanceFormatted);

          // Skip zero or dust balances
          if (balanceFloat < 0.000001) {
            return null;
          }

          // Track portfolio value
          if (bal.usdPerToken) {
            totalPortfolioUsd += balanceFloat * parseFloat(bal.usdPerToken);
          }

          return {
            symbol: bal.symbol || "UNKNOWN",
            balance: balanceFormatted,
            formatted: formatBalanceWithUsd(
              balanceFormatted,
              bal.symbol || "UNKNOWN",
              bal.usdPerToken,
              bal.monValue
            ),
          };
        })
        .filter((b) => b !== null);

      // Build response
      if (nonZeroBalances.length === 0) {
        return `**Portfolio Balance**

No tokens found. Your wallet appears empty.

Address: ${userAddress}`;
      }

      const balanceLines = nonZeroBalances.map((b) => `  • ${b!.formatted}`).join("\n");

      const portfolioValueLine =
        totalPortfolioUsd > 0
          ? `\n**Total Portfolio Value:** $${totalPortfolioUsd.toFixed(2)}`
          : "";

      return `**Portfolio Balance**

${balanceLines}${portfolioValueLine}

Address: ${userAddress}
Tokens: ${nonZeroBalances.length}

Source: Monorail API (cached)`;
    } catch (error) {
      throw createErrorFromCode("RPC_UNAVAILABLE", {
        message: `Failed to fetch balances: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "getAllBalances",
    description: `Fetch ALL token balances for user's portfolio. Single API call via Monorail.

⚡ **USE THIS TOOL WHEN:**
- User asks "show my balances", "what do I have", "my portfolio"
- Before batch operations (get all balances at once - more efficient)
- Planning multiple swaps ("swap all to MON")

**DO NOT USE FOR:**
- Single token queries → use getBalance instead
- Precision-critical operations → use getBalance for on-chain verification

**Returns:**
- Complete portfolio with all non-zero token balances
- USD values for each token (if available)
- Total portfolio value in USD
- Token count

**Performance:**
- Single Monorail API call (fast)
- Results cached for 30-60 seconds
- More efficient than calling getBalance multiple times

**Example usage:**
- "show my balances" → getAllBalances
- "what's my portfolio worth" → getAllBalances
- Before: "swap all to MON" → getAllBalances (get all tokens at once)

For single token: "what's my USDC balance" → use getBalance(USDC) instead`,
    schema: z.object({}),
  }
);
