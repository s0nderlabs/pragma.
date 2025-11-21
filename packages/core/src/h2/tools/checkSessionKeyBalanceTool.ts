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
  MIN_SESSION_KEY_BALANCE,
  estimateGasForBatch,
  calculateFundingAmount,
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

      // Calculate required balance based on operations
      let requiredBalance: bigint;
      let actualFundingAmount: bigint;

      if (estimatedOperations > 0) {
        // Dynamic: Calculate based on operation count
        requiredBalance = estimateGasForBatch(estimatedOperations);
        actualFundingAmount = calculateFundingAmount(balance, requiredBalance);
      } else {
        // Fixed: Use traditional threshold
        requiredBalance = MIN_SESSION_KEY_BALANCE;
        actualFundingAmount = recommendedFundingAmount;
      }

      // CRITICAL FIX: Check against requiredBalance, not MIN_SESSION_KEY_BALANCE
      const needsFunding = balance < requiredBalance;

      // Build response message
      const balanceFormatted = formatEther(balance);
      const requiredFormatted = formatEther(requiredBalance);
      const fundingAmountFormatted = formatEther(actualFundingAmount);

      if (needsFunding) {
        return `**Session Key Balance Check**

Current Balance: ${balanceFormatted} MON
Required Balance: ${requiredFormatted} MON
Status: ⚠️ LOW (need ${fundingAmountFormatted} MON more)

**Action Required:**
Call fundSessionKey${estimatedOperations > 0 ? `({estimatedOperations: ${estimatedOperations}})` : "()"} to add ${fundingAmountFormatted} MON to the session key.
This ensures gas costs are covered for ${estimatedOperations > 0 ? `${estimatedOperations} operations` : "upcoming operations"}.

Session Key Address: ${sessionKeyAddress}`;
      }

      return `**Session Key Balance Check**

Current Balance: ${balanceFormatted} MON
Required Balance: ${requiredFormatted} MON
Status: ✅ SUFFICIENT

No funding needed. Session key has enough balance for ${estimatedOperations > 0 ? `${estimatedOperations} operations` : "operations"}.

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
- **For swaps:** AFTER user confirms with "yes"/"execute"/"proceed", IMMEDIATELY BEFORE calling executeSwap
  - DO NOT check before getSwapQuote (read-only operation, no gas needed)
  - Single swap → Call with {estimatedOperations: 1}
  - Batch swaps → Call with {estimatedOperations: N}
- **For direct operations (transfer/wrap/unwrap/stake/unstake):** IMMEDIATELY BEFORE calling the execution tool
  - Single operation → Call with {estimatedOperations: 1}
  - Batch operations → Call with {estimatedOperations: N}
- After fundSessionKey completes (to verify funding succeeded)
- When execution fails with low balance error
- When user explicitly asks "check my session key balance" or "do I have enough gas?"

⚡ **WHEN NOT TO CALL THIS TOOL:**
- Before getSwapQuote (read-only operation, doesn't require gas or session key balance)
- Before showing quotes to user (balance check happens AFTER user confirms, not before)
- Between multiple tool calls in the same operation (unless funding just occurred)

**Reasoning:** Only write operations (executeSwap, transfer, etc.) require gas. Read operations (getSwapQuote, getBalance) are FREE and don't need balance checks. Balance only changes when funding occurs.

Returns:
- Current session key balance
- Whether funding is needed (smart calculation: uses batch requirements if estimatedOperations provided, otherwise 0.1 MON threshold)
- Recommended funding amount if needed
- Session key address for reference

If needsFunding = true, call fundSessionKey before proceeding with operations.

Examples:
- User says "swap 1 MON to USDC" → getSwapQuote → show quote → user confirms "yes" → checkSessionKeyBalance({estimatedOperations: 1}) → executeSwap
- User says "transfer 10 USDC to 0x123..." → checkSessionKeyBalance({estimatedOperations: 1}) → transfer
- User says "swap to USDC, USDT, USDM" → getSwapQuote (3 quotes) → show quotes → user confirms → checkSessionKeyBalance({estimatedOperations: 3}) → executeSwap (batch)`,
    schema: z.object({
      estimatedOperations: z.number().optional().describe(
        "Number of operations planned (swaps, transfers, etc.). " +
        "If provided, tool calculates required balance: (N × 0.095 MON) + 0.20 MON buffer. " +
        "Examples: 2 swaps = 0.39 MON needed, 3 swaps = 0.485 MON needed, 4 swaps = 0.58 MON needed"
      ),
    }),
  }
);
