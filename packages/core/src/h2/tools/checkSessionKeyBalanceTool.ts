/**
 * Check Session Key Balance Tool
 *
 * Checks session key balance to determine if funding is needed before operations.
 * FREE operation (read-only, no transaction).
 *
 * Use this tool before executing batch operations to ensure the session key
 * has sufficient balance to cover gas costs.
 */

import { tool } from "langchain";
import { z } from "zod";
import type { Address, PublicClient } from "viem";
import { formatEther } from "viem";

import {
  checkSessionKeyBalance,
  shouldFundForBatch,
  MIN_SESSION_KEY_BALANCE
} from "../execution/sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";

// ============================================================================
// Check Session Key Balance Tool Implementation
// ============================================================================

export const checkSessionKeyBalanceTool = tool(
  async (input, config) => {
    try {
      const sessionKeyAddress = config?.configurable?.sessionData?.sessionKeyAddress as Address;
      const publicClient = config?.configurable?.publicClient as PublicClient;
      const estimatedOperations = input.estimatedOperations || 0;

      if (!sessionKeyAddress || !publicClient) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Missing session key address or public client",
        });
      }

      // Check balance (batch-aware if estimatedOperations provided)
      const { balance, recommendedFundingAmount } = await checkSessionKeyBalance(
        sessionKeyAddress,
        publicClient
      );

      // Use batch-aware logic if operation count provided, otherwise use simple threshold
      const needsFunding = estimatedOperations > 0
        ? shouldFundForBatch(balance, estimatedOperations)
        : balance < MIN_SESSION_KEY_BALANCE;

      // Build response message
      const balanceFormatted = formatEther(balance);
      const thresholdFormatted = formatEther(MIN_SESSION_KEY_BALANCE);
      const fundingAmountFormatted = formatEther(recommendedFundingAmount);

      if (needsFunding) {
        return `**Session Key Balance Check**

Current Balance: ${balanceFormatted} MON
Status: ⚠️ LOW (below ${thresholdFormatted} MON threshold)

**Action Required:**
Call fundSessionKey to add ${fundingAmountFormatted} MON to the session key.
This ensures gas costs are covered for upcoming operations.

Session Key Address: ${sessionKeyAddress}`;
      }

      return `**Session Key Balance Check**

Current Balance: ${balanceFormatted} MON
Status: ✅ SUFFICIENT (above ${thresholdFormatted} MON threshold)

No funding needed. Session key has enough balance for operations.

Session Key Address: ${sessionKeyAddress}`;
    } catch (error) {
      throw createErrorFromCode("RPC_UNAVAILABLE", {
        message: `Failed to check session key balance: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "checkSessionKeyBalance",
    description: `Check session key balance to determine if funding is needed. FREE operation (read-only).

⚡ **WHEN TO CALL THIS TOOL:**
- At the START when user FIRST requests a batch operation (2+ swaps/transfers)
- After fundSessionKey completes (to verify funding succeeded)
- When execution fails with low balance error
- When user explicitly asks "check my session key balance" or "do I have enough gas?"

⚡ **WHEN NOT TO CALL THIS TOOL:**
- After showing quotes to user (balance doesn't change during quote fetch)
- After user confirms with "yes"/"execute"/"proceed" (still same operation, already checked)
- Between multiple tool calls in the same operation (unless funding just occurred)

**Reasoning:** Balance only changes when funding occurs. Checking repeatedly wastes time and doesn't add value.

Returns:
- Current session key balance
- Whether funding is needed (smart calculation: uses batch requirements if estimatedOperations provided, otherwise 0.1 MON threshold)
- Recommended funding amount if needed
- Session key address for reference

If needsFunding = true, call fundSessionKey before proceeding with operations.

Example: User says "swap to USDC, USDT, USDM" → Call checkSessionKeyBalance ONCE at start`,
    schema: z.object({
      estimatedOperations: z.number().optional().describe(
        "Number of operations planned (swaps, transfers, etc.). " +
        "If provided, tool calculates required balance: (N × 0.095 MON) + 0.20 MON buffer. " +
        "Examples: 2 swaps = 0.39 MON needed, 3 swaps = 0.485 MON needed, 4 swaps = 0.58 MON needed"
      ),
    }),
  }
);
