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
  estimateGasForOperations,
  calculateFundingAmount,
  type OperationType,
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
      const operationType = input.operationType as OperationType | undefined;

      if (!sessionKeyAddress || !publicClient) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Missing session key address or public client",
        });
      }

      // Simple read-only tool - no progress needed (parent name is sufficient)

      // Check balance (batch-aware if estimatedOperations provided)
      const { balance, recommendedFundingAmount } = await checkSessionKeyBalance(
        sessionKeyAddress,
        publicClient
      );

      // Calculate required balance based on operations
      let requiredBalance: bigint;
      let actualFundingAmount: bigint;

      if (operationType && estimatedOperations > 0) {
        // BEST: Use operation-specific costs (e.g., swap costs 0.14 MON, not 0.08 avg)
        const operations: OperationType[] = Array(estimatedOperations).fill(operationType);
        requiredBalance = estimateGasForOperations(operations);
        actualFundingAmount = calculateFundingAmount(balance, requiredBalance);
      } else if (estimatedOperations > 0) {
        // Fallback: Use average-based calculation (less accurate for swaps)
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
    description: "SOURCE OF TRUTH for gas funding needs. You CANNOT know if session key needs funding without calling this tool. Never guess funding status. Call BEFORE execution.",
    schema: z.object({
      operationType: z.enum(["swap", "transfer", "wrap", "unwrap", "stake", "unstake", "unstakeClaim"]).optional().describe(
        "Type of operation to check balance for. IMPORTANT: Always specify this for accurate gas calculation! " +
        "Each operation has different gas costs: swap=0.14 MON, transfer/wrap/unwrap=0.04 MON, stake=0.07 MON, unstake=0.075 MON"
      ),
      estimatedOperations: z.number().optional().describe(
        "Number of operations planned. Combined with operationType for accurate calculation. " +
        "Examples: 1 swap = 0.14 + 0.02 buffer = 0.16 MON needed, 3 swaps = 0.44 MON needed"
      ),
    }),
  }
);
