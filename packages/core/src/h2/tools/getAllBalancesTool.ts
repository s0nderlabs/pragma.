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
import { formatUnits, parseUnits, getAddress, type Address, type PublicClient } from "viem";

import { normalizeBalances } from "../../monorail/balances.js";
import { createErrorFromCode } from "../../errors/index.js";
import { emitProgress } from "../progress/emitter.js";

// Native MON token address (0x0... represents native token)
const MON_ADDRESS = "0x0000000000000000000000000000000000000000";

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
      // Get user address and public client from config
      const userAddress = config?.configurable?.userAddress as Address | undefined;
      const publicClient = config?.configurable?.publicClient as PublicClient | undefined;

      if (!userAddress) {
        throw createErrorFromCode("SESSION_INCOMPLETE", {
          message: "User address not found in session. Cannot fetch balances.",
        });
      }

      // Progress: Fetching balances
      emitProgress("Fetching your portfolio from Monad...");

      // Fetch all balances via proxy (avoids CORS issues with direct Monorail calls)
      // Use authenticated fetch from configurable if available (browser context)
      const fetchFn = (config?.configurable?.fetch as typeof fetch) || fetch;
      const checksummedAddress = getAddress(userAddress);
      const response = await fetchFn(`/api/monorail/balances?address=${checksummedAddress}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`Failed to fetch balances: ${errorText}`);
      }

      const rawBalances = await response.json();
      const balances = normalizeBalances(rawBalances);

      // RPC fallback: Always fetch native MON balance directly from blockchain
      // This handles stale/empty Monorail API responses
      if (publicClient) {
        try {
          const rpcMonBalance = await publicClient.getBalance({
            address: checksummedAddress,
          });

          // Find MON in Monorail response
          const monTokenIndex = balances.findIndex(
            (bal) => bal.symbol === "MON" || bal.address.toLowerCase() === MON_ADDRESS.toLowerCase()
          );

          // If MON not in Monorail response but RPC shows balance, create synthetic entry
          if (monTokenIndex === -1 && rpcMonBalance > 0n) {
            // Fetch MON price for USD calculation
            let monPrice = 0;
            try {
              const priceResponse = await fetchFn("/api/monorail/price");
              if (priceResponse.ok) {
                const priceData = await priceResponse.json();
                monPrice = parseFloat(priceData.price || "0");
              }
            } catch {
              // Price fetch failed, continue without USD value
            }

            balances.push({
              address: MON_ADDRESS,
              symbol: "MON",
              name: "Monad",
              decimals: 18,
              balance: rpcMonBalance.toString(),
              usdPerToken: monPrice > 0 ? monPrice.toString() : undefined,
              monValue: undefined,
              categories: ["verified", "native"],
            });
          } else if (monTokenIndex !== -1 && rpcMonBalance > 0n) {
            // MON exists in Monorail but update with fresh RPC balance
            balances[monTokenIndex] = {
              ...balances[monTokenIndex],
              balance: rpcMonBalance.toString(),
            };
          }
        } catch (rpcError) {
          // RPC failed, continue with Monorail data only
          console.warn("[getAllBalances] RPC MON balance fetch failed:", rpcError);
        }
      }

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
            address: bal.address, // Include address for agent reference
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

      const balanceLines = nonZeroBalances
        .map((b) => `  • ${b!.formatted} [${b!.address}]`)
        .join("\n");

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
    description: "Get complete portfolio with all token balances and USD values. Use for 'show my balances'. For single token use getBalance. Call search_tool_docs('getAllBalances') for detailed usage.",
    schema: z.object({}),
  }
);
