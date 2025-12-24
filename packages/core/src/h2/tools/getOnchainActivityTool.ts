/**
 * Get On-chain Activity Tool
 *
 * Fetches on-chain transaction history for the user's smart account.
 * Uses HyperSync for efficient indexed blockchain queries.
 *
 * Use this tool when:
 * - User asks "show my activity", "what did I do", "transaction history"
 * - User wants to see recent swaps, transfers, stakes
 * - User asks "show my onchain activity for the last X days/hours"
 *
 * Output: Paginated table with Time | Type | In | Out | Tx Hash | Gas
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getAddress, type Address } from "viem";

import { createErrorFromCode } from "../../errors/index.js";
import { emitProgress } from "../progress/emitter.js";

// ============================================================================
// Types
// ============================================================================

interface ActivityItem {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  type: string;
  tokenIn?: {
    address: string;
    symbol: string;
    amount: string;
    amountFormatted: string;
    valueUsd?: string;
  };
  tokenOut?: {
    address: string;
    symbol: string;
    amount: string;
    amountFormatted: string;
    valueUsd?: string;
  };
  gasFee?: string;
  gasFeeFormatted?: string;
  protocol?: string;
  counterparty?: string;
}

interface ActivityResponse {
  activities: ActivityItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  fromBlock: number;
  toBlock: number;
  timeRange: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

export const getOnchainActivityTool = tool(
  async (input, config) => {
    try {
      // Get user address from config (fallback if no address provided)
      const userAddress = config?.configurable?.userAddress as Address | undefined;
      const { address: inputAddress, timeRange, page } = input;

      // Use provided address or fall back to user's address
      const targetAddress = inputAddress || userAddress;

      if (!targetAddress) {
        throw createErrorFromCode("SESSION_INCOMPLETE", {
          message: "No address provided and user address not found in session.",
        });
      }

      // Generate tool signature for progress routing
      // Use timeRange for signature to match UI-generated signature in browserAgentRunner.ts
      const toolSignature = `getOnchainActivity:${timeRange}`;

      // Progress: Fetching activity
      emitProgress(
        "Querying blockchain history...",
        "getOnchainActivity",
        toolSignature,
        "Getting Onchain Activity"
      );

      // Use authenticated fetch from configurable
      const fetchFn = (config?.configurable?.fetch as typeof fetch) || fetch;
      const checksummedAddress = getAddress(targetAddress);

      // Call the API route
      const response = await fetchFn(
        `/api/hypersync/activity?address=${checksummedAddress}&timeRange=${encodeURIComponent(timeRange)}&page=${page}&limit=15`
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`Failed to fetch activity: ${errorText}`);
      }

      const data: ActivityResponse = await response.json();

      // Progress: Formatting results
      emitProgress("Building activity view...", "getOnchainActivity", toolSignature);

      // Build response with activity table marker for UI rendering
      // The marker format is parsed by AIMessage.tsx to render ActivityTable component
      const activityTableData = {
        activities: data.activities,
        totalCount: data.totalCount,
        page: data.page,
        totalPages: data.totalPages,
        timeRange,
        address: checksummedAddress,
      };

      // Return marker + JSON for rich UI, with fallback text for CLI
      return `__activity_table__
${JSON.stringify(activityTableData)}`;
    } catch (error) {
      throw createErrorFromCode("RPC_UNAVAILABLE", {
        message: `Failed to fetch on-chain activity: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "getOnchainActivity",
    description:
      "Get on-chain transaction history. Shows swaps, transfers, stakes, etc. Use for 'show my activity', 'transaction history', 'what did I do'. Can query ANY address, not just user's smart account.",
    schema: z.object({
      address: z
        .string()
        .optional()
        .describe(
          "Address to fetch activity for. If not provided, uses user's smart account. Use for 'show activity for 0x...'"
        ),
      timeRange: z
        .string()
        .default("7 days")
        .describe(
          "Time range to fetch activity for. Examples: '2 days', '6 hours', '1 week', '30 minutes'. Default: '7 days'"
        ),
      page: z
        .number()
        .default(1)
        .describe("Page number for pagination (default: 1)"),
    }),
  }
);
