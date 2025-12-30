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
import { getNameForAddress } from "../utils/nameResolution.js";

// Native MON token address (0x0... represents native token)
const MON_ADDRESS = "0x0000000000000000000000000000000000000000";

// Wrapped MON (WMON) contract address - mainnet
const WMON_ADDRESS = "0x3bd359c1119da7da1d913d1c4d2b7c461115433a";

// ERC20 ABI for balanceOf
const ERC20_BALANCE_ABI = [{
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ name: "", type: "uint256" }]
}] as const;

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
  async ({ address: inputAddress }, config) => {
    try {
      // Get user address and public client from config
      const userAddress = config?.configurable?.userAddress as Address | undefined;
      const publicClient = config?.configurable?.publicClient as PublicClient | undefined;

      // Use provided address or fall back to user's address
      const targetAddress = (inputAddress as Address) || userAddress;

      if (!targetAddress) {
        throw createErrorFromCode("SESSION_INCOMPLETE", {
          message: "No address provided and user address not found in session. Cannot fetch balances.",
        });
      }

      // Try to resolve NAD/ENS name (optional enhancement)
      let resolvedName: Awaited<ReturnType<typeof getNameForAddress>> = null;
      if (publicClient) {
        try {
          resolvedName = await getNameForAddress(targetAddress, publicClient);
        } catch {
          // Name resolution failed, continue without name
        }
      }

      // Generate tool signature for progress routing
      // Must match generateSignatureFromInput() in browserAgentRunner.ts
      const toolSignature = 'getAllBalances';

      // Progress: Fetching balances (with description for parent display)
      emitProgress("Getting Your Portfolio from Monad...", "getAllBalances", toolSignature, "Getting All Balances");

      // Fetch all balances via proxy (avoids CORS issues with direct Monorail calls)
      // Use authenticated fetch from configurable if available (browser context)
      const fetchFn = (config?.configurable?.fetch as typeof fetch) || fetch;
      const checksummedAddress = getAddress(targetAddress);
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
        } catch (_rpcError) {
          // RPC failed, continue with Monorail data only
        }

        // WMON RPC Fallback: Check if WMON is missing from API response
        const wmonTokenIndex = balances.findIndex(
          (bal) => bal.symbol === "WMON" || bal.address.toLowerCase() === WMON_ADDRESS.toLowerCase()
        );

        if (wmonTokenIndex === -1) {
          // WMON not in API response - fetch directly from contract
          try {
            const wmonBalance = await publicClient.readContract({
              address: getAddress(WMON_ADDRESS),
              abi: ERC20_BALANCE_ABI,
              functionName: "balanceOf",
              args: [checksummedAddress],
            });

            if (wmonBalance > 0n) {
              // Fetch WMON price (same as MON since it's wrapped)
              let wmonPrice = 0;
              try {
                const priceResponse = await fetchFn("/api/monorail/price");
                if (priceResponse.ok) {
                  const priceData = await priceResponse.json();
                  wmonPrice = parseFloat(priceData.price || "0");
                }
              } catch {
                // Price fetch failed, continue without USD value
              }

              balances.push({
                address: getAddress(WMON_ADDRESS),
                symbol: "WMON",
                name: "Wrapped Monad",
                decimals: 18,
                balance: wmonBalance.toString(),
                usdPerToken: wmonPrice > 0 ? wmonPrice.toString() : undefined,
                monValue: undefined,
                categories: ["verified", "wrapped"],
              });
            }
          } catch (_wmonError) {
            // WMON RPC balance fetch failed, continue
          }
        }
      }

      // Progress: Calculating values
      emitProgress("Calculating USD Values...", "getAllBalances", toolSignature);

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

      // Format address display (with name if available)
      const addressDisplay = resolvedName
        ? `${resolvedName.name} (${targetAddress})`
        : targetAddress;

      // Build response
      if (nonZeroBalances.length === 0) {
        return `**Portfolio Balance**

No tokens found. Your wallet appears empty.

Address: ${addressDisplay}`;
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

Address: ${addressDisplay}
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
    description: "Get complete portfolio with all token balances and USD values. Shows total portfolio value. Use for 'show my balances', 'portfolio', 'what do I have'. For single token balance, use getBalance instead.",
    schema: z.object({
      address: z
        .string()
        .optional()
        .describe(
          "Address to fetch portfolio for. If not provided, uses user's smart account. " +
          "Use when user asks about another wallet, e.g., 'show 0x123's portfolio' or 'what tokens does vitalik have'."
        ),
    }),
  }
);
