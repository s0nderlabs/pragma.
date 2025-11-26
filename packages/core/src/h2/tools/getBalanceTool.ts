/**
 * Get Balance Tool - Fetch user token balances
 *
 * Enables the agent to fetch balances when user uses amount keywords
 * like "all", "half", "quarter", "max".
 *
 * Example flows:
 * - User: "swap all my MON to USDC"
 * - Agent: calls getBalance({ token: "MON" }) → gets "3.5"
 * - Agent: calls swap({ fromToken: "MON", toToken: "USDC", amount: "3.5" })
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { formatUnits, parseUnits, getAddress, type Address } from "viem";

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
 * Prioritizes USD display over MON value for clarity
 *
 * @param balanceFormatted - Formatted token amount (e.g., "10.5")
 * @param symbol - Token symbol (e.g., "MON")
 * @param usdPerToken - USD price per token (optional)
 * @param monValue - MON value (fallback if USD not available)
 * @returns Formatted string with USD or MON value
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

// ============================================================================
// Tool Implementation
// ============================================================================

const getBalanceSchema = z.object({
  token: z
    .string()
    .describe(
      "Token symbol or address to check balance for. Use 'all' to show all token balances. Examples: 'MON', 'USDC', 'DAK', 'WMON', 'all', or contract address '0x760...'"
    ),
});

/**
 * Get user's balance for a specific token
 *
 * This tool allows the agent to fetch balances when users use amount keywords.
 * The agent should call this BEFORE executing swaps/transfers when user says
 * "all", "half", "max", "quarter", etc.
 *
 * @param token - Token symbol (MON, USDC, DAK, WMON) or address
 * @returns Formatted balance string with symbol and amount
 *
 * @example
 * ```typescript
 * // User says "swap all my MON to USDC"
 * const balance = await getBalance({ token: "MON" });
 * // Returns: "3.5 MON"
 * // Agent then calls swap with amount="3.5"
 * ```
 */
export const getBalanceTool = tool(
  async ({ token }, config) => {
    try {
      // Get user address and public client from config
      const userAddress = config?.configurable?.userAddress as Address | undefined;
      const publicClient = config?.configurable?.publicClient;

      if (!userAddress) {
        throw createErrorFromCode("SESSION_INCOMPLETE", {
          message: "User address not found in session. Cannot fetch balances.",
        });
      }

      // Progress: Checking balance
      const tokenNormalized = token.toUpperCase().trim();
      emitProgress(`Checking ${tokenNormalized === "ALL" ? "all token" : tokenNormalized} balance...`);

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
      let rpcMonBalance = 0n;
      let rpcMonFormatted = "0";
      if (publicClient) {
        try {
          rpcMonBalance = await publicClient.getBalance({
            address: checksummedAddress,
          });
          rpcMonFormatted = formatUnits(rpcMonBalance, 18);
        } catch (rpcError) {
          // RPC failed, continue with Monorail data only
          console.warn("[getBalance] RPC MON balance fetch failed:", rpcError);
        }
      }

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

        const monBalanceNum = parseFloat(rpcMonFormatted);
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
        const existingMon = balances[monTokenIndex];
        const monPrice = existingMon.usdPerToken ? parseFloat(existingMon.usdPerToken) : 0;
        balances[monTokenIndex] = {
          ...existingMon,
          balance: rpcMonBalance.toString(),
        };
      }

      // Check if user wants all balances
      if (tokenNormalized === "ALL") {
        // Helper function to safely convert balance to BigInt
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

        // Format all non-zero balances with USD values
        let totalPortfolioUsd = 0;
        const nonZeroBalances = balances
          .map((bal) => {
            const balanceBigInt = safeBalanceToBigInt(bal.balance || "0", bal.decimals);
            const balanceFormatted = formatUnits(balanceBigInt, bal.decimals);
            const balanceFloat = parseFloat(balanceFormatted);

            if (balanceFloat === 0) return null;

            const symbol = bal.symbol || "UNKNOWN";

            // Calculate USD value for portfolio total
            let usdValue = 0;
            if (bal.usdPerToken) {
              usdValue = balanceFloat * parseFloat(bal.usdPerToken);
              totalPortfolioUsd += usdValue;
            }

            // Format with USD helper
            const formattedLine = formatBalanceWithUsd(
              balanceFormatted,
              symbol,
              bal.usdPerToken,
              bal.monValue
            );

            return {
              line: formattedLine,
              sortValue: usdValue > 0 ? usdValue : balanceFloat, // Sort by USD value if available
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .sort((a, b) => b.sortValue - a.sortValue);

        if (nonZeroBalances.length === 0) {
          return "You don't have any tokens in your wallet. Your wallet balance is empty.";
        }

        const balanceLines = nonZeroBalances.map((item) => `• ${item.line}`);

        // Add total portfolio value if we have USD prices
        const totalLine = totalPortfolioUsd > 0
          ? `\n**Total Portfolio Value: $${totalPortfolioUsd.toFixed(2)}**`
          : "";

        return `📊 Your Token Balances (${nonZeroBalances.length} tokens):\n\n${balanceLines.join("\n")}${totalLine}`;
      }

      // Find the requested token by symbol or address
      const targetBalance = balances.find((balance) => {
        // Check symbol match
        if (balance.symbol?.toUpperCase() === tokenNormalized) return true;

        // Check address match
        if (token.startsWith("0x")) {
          try {
            return getAddress(balance.address) === getAddress(token as Address);
          } catch {
            return false;
          }
        }

        // Special case: MON is the native token
        if (tokenNormalized === "MON" && balance.address.toLowerCase() === MON_ADDRESS.toLowerCase()) {
          return true;
        }

        return false;
      });

      if (!targetBalance) {
        // Special handling for WMON - fetch directly from contract if not in Monorail data
        if (tokenNormalized === "WMON") {
          const WMON_ADDRESS = "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701";
          const ERC20_ABI = [{
            type: "function",
            name: "balanceOf",
            stateMutability: "view",
            inputs: [{ name: "account", type: "address" }],
            outputs: [{ name: "", type: "uint256" }]
          }] as const;

          if (!publicClient) {
            return `You have 0 WMON. Unable to fetch WMON balance (public client not available).`;
          }

          try {
            const wmonBalance = await publicClient.readContract({
              address: getAddress(WMON_ADDRESS),
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [getAddress(userAddress)],
            }) as bigint;

            // Blockchain balances should never be negative, but validate anyway
            if (wmonBalance < 0n) {
              return `Unable to fetch valid WMON balance (blockchain returned invalid value).`;
            }

            const balanceFormatted = formatUnits(wmonBalance, 18);
            return `You have ${balanceFormatted} WMON`;
          } catch (error) {
            console.error("[getBalance] Failed to fetch WMON balance directly:", error);
            return `Unable to fetch WMON balance from blockchain. Error: ${(error as Error).message}`;
          }
        }

        // Token not found - return zero balance
        return `You have 0 ${token}. This token was not found in your wallet. You may not own any ${token}, or it may not be a valid token on Monad.`;
      }

      // Format balance - handle both wei strings and decimal strings safely
      const balanceWei = targetBalance.balance || "0";
      let balanceBigInt: bigint;

      try {
        // Try direct BigInt conversion (for wei strings like "1000000000000000000")
        balanceBigInt = BigInt(balanceWei);
        // Validate non-negative (ERC20 uint256 cannot be negative) - clamp to 0
        if (balanceBigInt < 0n) {
          balanceBigInt = 0n;
        }
      } catch {
        // If it fails (decimal string like "3.5"), use parseUnits to preserve full precision
        try {
          balanceBigInt = parseUnits(balanceWei, targetBalance.decimals);
          if (balanceBigInt < 0n) {
            balanceBigInt = 0n;
          }
        } catch {
          // If parseUnits also fails (invalid format), default to 0
          balanceBigInt = BigInt(0);
        }
      }

      const balanceFormatted = formatUnits(balanceBigInt, targetBalance.decimals);
      const symbol = targetBalance.symbol || token;

      // Format with USD value using helper function
      const formattedBalance = formatBalanceWithUsd(
        balanceFormatted,
        symbol,
        targetBalance.usdPerToken,
        targetBalance.monValue
      );

      // Include address in brackets for agent reference (user won't see this in UI)
      return `You have ${formattedBalance} [${targetBalance.address}]`;
    } catch (error) {
      // More specific error logging
      const errorMessage = (error as Error).message;
      const errorName = (error as Error).name;

      console.error(`[getBalance] Error fetching balance for ${token}:`, {
        error: errorName,
        message: errorMessage,
      });

      throw createErrorFromCode("RPC_UNAVAILABLE", {
        message: `Failed to fetch balance for ${token}: ${errorMessage}`,
        cause: error,
      });
    }
  },
  {
    name: "getBalance",
    description:
      "Get user's balance for a specific token OR display complete portfolio with USD values. Pass token='all' when user asks 'show my balances', 'what's my portfolio', 'show all my tokens', 'what do I have', etc. Returns all non-zero token balances with USD values and total portfolio value. Pass specific token symbol when user asks about one token ('show my MON balance', 'how much USDC do I have') or uses amount keywords ('swap all my MON'). Always call this BEFORE executing swaps/transfers when user uses amount keywords like 'all', 'max', 'half', 'quarter'. Balances include USD values when available for better clarity.",
    schema: getBalanceSchema,
  }
);
