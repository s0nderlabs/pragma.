/**
 * Get Unwrap Quote Tool (Read-Only)
 *
 * Prepares a WMON → MON unwrap without executing.
 * Use this tool for unwrap preparation and validation.
 *
 * This tool DOES NOT execute unwraps - it only validates and stores quote data.
 * Call executeUnwrap tool after user confirms.
 */

import { tool } from "langchain";
import { z } from "zod";
import { Address, getAddress, formatUnits, parseUnits, getContract, erc20Abi, type PublicClient } from "viem";

import { createErrorFromCode } from "../../errors/index.js";
import { generateQuoteId, storeUnwrapQuote } from "../execution/quoteStore.js";
import type { UnwrapQuoteData } from "../execution/types.js";

// ============================================================================
// Constants
// ============================================================================

const QUOTE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_GAS_ESTIMATE = 50000n; // Unwrap gas estimate
const WMON_ADDRESS = (process.env.MONAD_WMON_ADDRESS || "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701") as Address;

// ============================================================================
// Get Unwrap Quote Tool Implementation
// ============================================================================

export const getUnwrapQuoteTool = tool(
  async ({ amount }, config) => {
    try {
      // Get context
      const userAddress = config?.configurable?.userAddress as string;
      const publicClient = config?.configurable?.publicClient as PublicClient;

      if (!userAddress) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "User address is required but not provided in context.",
          context: { field: "userAddress" },
        });
      }

      if (!publicClient) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Public client is required but not provided in context.",
          context: { field: "publicClient" },
        });
      }

      const wmonAddress = getAddress(WMON_ADDRESS);

      // Parse amount (WMON has 18 decimals)
      const amountWei = parseUnits(amount, 18);
      const amountFormatted = formatUnits(amountWei, 18);

      // Check user's WMON balance
      const wmonContract = getContract({
        address: wmonAddress,
        abi: erc20Abi,
        client: publicClient,
      });

      const balance = await wmonContract.read.balanceOf([getAddress(userAddress)]);

      if (balance < amountWei) {
        throw createErrorFromCode("INSUFFICIENT_BALANCE", {
          message: `Insufficient WMON balance. ` +
                  `Required: ${amountFormatted}, Available: ${formatUnits(balance, 18)}`,
          context: {
            token: "WMON",
            required: amountFormatted,
            available: formatUnits(balance, 18),
          },
        });
      }

      // Estimate gas
      const gasEstimateWei = DEFAULT_GAS_ESTIMATE * 1_000_000_000n; // 1 gwei
      const gasEstimateFormatted = formatUnits(gasEstimateWei, 18);

      // Generate and store quote
      const quoteId = generateQuoteId();
      const now = Date.now();

      const quoteData: UnwrapQuoteData = {
        quoteId,
        amount: amountFormatted,
        amountWei,
        wmonAddress,
        gasEstimate: gasEstimateWei,
        createdAt: now,
        expiresAt: now + QUOTE_EXPIRY_MS,
        userAddress: getAddress(userAddress),
      };

      storeUnwrapQuote(quoteData);

      // Return conversational quote
      return `Unwrap prepared:

• From: ${amountFormatted} WMON
• To: ${amountFormatted} MON
• Fee: FREE (only gas: ~${gasEstimateFormatted} MON)
• Your Balance: ${formatUnits(balance, 18)} WMON

Quote ID: ${quoteId}
Valid for: 5 minutes

Ready to unwrap?`;
    } catch (error) {
      throw createErrorFromCode("QUOTE_PREPARATION_ERROR", {
        message: `Failed to prepare unwrap: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "getUnwrapQuote",
    description: `Prepare a WMON → MON unwrap. Use this tool FIRST before executing unwraps.

**IMPORTANT:** This tool does NOT execute unwraps - it only validates and prepares the unwrap.
After the user confirms, call executeUnwrap with the quote ID.

Use this tool when the user:
- Wants to unwrap WMON: "unwrap 1 WMON", "convert WMON to MON"
- Asks about unwrapping: "how do I unwrap WMON?"
- Wants native MON back from wrapped version

Features:
- FREE operation (no protocol fee, only gas)
- Balance validation
- Gas estimates

Returns: Conversational quote with Quote ID for execution

Example inputs:
- amount: "1.0" (decimal string, amount of WMON to unwrap)`,
    schema: z.object({
      amount: z.string().describe("Amount of WMON to unwrap (decimal string like '1.0')"),
    }),
  }
);
