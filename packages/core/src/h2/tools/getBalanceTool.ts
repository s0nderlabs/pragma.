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

import { fetchWalletBalances, normalizeBalances } from "../../monorail/balances.js";
import { createErrorFromCode } from "../../errors/index.js";

// ============================================================================
// Configuration
// ============================================================================

const MONORAIL_DATA_API_URL =
  process.env.MONORAIL_DATA_API_URL || "https://testnet-api.monorail.xyz/v1";
const MONORAIL_API_KEY = process.env.MONORAIL_API_KEY || process.env.MONORAIL_APP_ID;

// Native MON token address (0x0... represents native token)
const MON_ADDRESS = "0x0000000000000000000000000000000000000000";

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

      // Fetch all balances from Monorail
      const rawBalances = await fetchWalletBalances(getAddress(userAddress), {
        dataApiUrl: MONORAIL_DATA_API_URL,
        apiKey: MONORAIL_API_KEY,
      });

      const balances = normalizeBalances(rawBalances);

      // Check if user wants all balances
      const tokenNormalized = token.toUpperCase().trim();
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

        // Format all non-zero balances
        const nonZeroBalances = balances
          .map((bal) => {
            const balanceBigInt = safeBalanceToBigInt(bal.balance || "0", bal.decimals);
            const balanceFormatted = formatUnits(balanceBigInt, bal.decimals);
            const balanceFloat = parseFloat(balanceFormatted);

            if (balanceFloat === 0) return null;

            const symbol = bal.symbol || "UNKNOWN";
            const monValue = bal.monValue ? ` (~${bal.monValue} MON)` : "";

            return {
              symbol,
              balance: balanceFormatted,
              monValue,
              sortValue: balanceFloat,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .sort((a, b) => b.sortValue - a.sortValue);

        if (nonZeroBalances.length === 0) {
          return "You don't have any tokens in your wallet. Your wallet balance is empty.";
        }

        const balanceLines = nonZeroBalances.map(
          (item) => `• ${item.balance} ${item.symbol}${item.monValue}`
        );

        return `📊 Your Token Balances (${nonZeroBalances.length} tokens):\n\n${balanceLines.join("\n")}`;
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

      // Include value information if available
      const monValue = targetBalance.monValue ? ` (~${targetBalance.monValue} MON)` : "";

      return `You have ${balanceFormatted} ${symbol}${monValue}`;
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
      "Get user's balance for a specific token OR all tokens. Pass token='all' when user asks 'show my balances', 'list all tokens', 'what do I have', etc. Pass specific token symbol when user asks about one token ('show my MON balance') or uses amount keywords ('swap all my MON'). Always call this BEFORE executing swaps/transfers when user uses amount keywords like 'all', 'max', 'half', 'quarter'.",
    schema: getBalanceSchema,
  }
);
