/**
 * Get Wrap Quote Tool (Read-Only)
 *
 * Prepares a MON → WMON wrap without executing.
 * Use this tool for wrap preparation and validation.
 *
 * This tool DOES NOT execute wraps - it only validates and stores quote data.
 * Call executeWrap tool after user confirms.
 */

import { tool } from "langchain";
import { z } from "zod";
import { Address, getAddress, formatUnits, parseUnits, type PublicClient } from "viem";

import { createErrorFromCode } from "../../errors/index.js";
import { generateQuoteId, storeWrapQuote } from "../execution/quoteStore.js";
import type { WrapQuoteData } from "../execution/types.js";

// ============================================================================
// Constants
// ============================================================================

const QUOTE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_GAS_ESTIMATE = 50000n; // Wrap gas estimate
const WMON_ADDRESS = (process.env.MONAD_WMON_ADDRESS || "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701") as Address;

// ============================================================================
// Get Wrap Quote Tool Implementation
// ============================================================================

export const getWrapQuoteTool = tool(
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

      // Parse amount (MON has 18 decimals)
      const amountWei = parseUnits(amount, 18);
      const amountFormatted = formatUnits(amountWei, 18);

      // Check user's MON balance
      const balance = await publicClient.getBalance({ address: getAddress(userAddress) });

      if (balance < amountWei) {
        throw createErrorFromCode("INSUFFICIENT_BALANCE", {
          message: `Insufficient MON balance. ` +
                  `Required: ${amountFormatted}, Available: ${formatUnits(balance, 18)}`,
          context: {
            token: "MON",
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

      const quoteData: WrapQuoteData = {
        quoteId,
        amount: amountFormatted,
        amountWei,
        wmonAddress: getAddress(WMON_ADDRESS),
        gasEstimate: gasEstimateWei,
        createdAt: now,
        expiresAt: now + QUOTE_EXPIRY_MS,
        userAddress: getAddress(userAddress),
      };

      storeWrapQuote(quoteData);

      // Return conversational quote
      return `Wrap prepared:

• From: ${amountFormatted} MON
• To: ${amountFormatted} WMON
• Fee: FREE (only gas: ~${gasEstimateFormatted} MON)
• Your Balance: ${formatUnits(balance, 18)} MON

Quote ID: ${quoteId}
Valid for: 5 minutes

Ready to wrap?`;
    } catch (error) {
      throw createErrorFromCode("QUOTE_PREPARATION_ERROR", {
        message: `Failed to prepare wrap: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "getWrapQuote",
    description: `Prepare a MON → WMON wrap. Use this tool FIRST before executing wraps.

**IMPORTANT:** This tool does NOT execute wraps - it only validates and prepares the wrap.
After the user confirms, call executeWrap with the quote ID.

Use this tool when the user:
- Wants to wrap MON: "wrap 1 MON", "convert MON to WMON"
- Asks about wrapping: "how do I wrap MON?"
- Needs WMON for DeFi protocols

Features:
- FREE operation (no protocol fee, only gas)
- Balance validation
- Gas estimates

Returns: Conversational quote with Quote ID for execution

Example inputs:
- amount: "1.0" (decimal string, amount of MON to wrap)`,
    schema: z.object({
      amount: z.string().describe("Amount of MON to wrap (decimal string like '1.0')"),
    }),
  }
);
