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

import { checkSessionKeyBalance, MIN_SESSION_KEY_BALANCE } from "../execution/sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";

// ============================================================================
// Check Session Key Balance Tool Implementation
// ============================================================================

export const checkSessionKeyBalanceTool = tool(
  async (_input, config) => {
    try {
      const sessionKeyAddress = config?.configurable?.sessionData?.sessionKeyAddress as Address;
      const publicClient = config?.configurable?.publicClient as PublicClient;

      if (!sessionKeyAddress || !publicClient) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Missing session key address or public client",
        });
      }

      // Check balance
      const { balance, needsFunding, recommendedFundingAmount } = await checkSessionKeyBalance(
        sessionKeyAddress,
        publicClient
      );

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

⚡ **IMPORTANT:** Always call this tool BEFORE executing batch operations (2+ swaps/transfers)
   to ensure the session key has sufficient gas balance.

Use when:
- Before executing multiple operations in parallel
- User asks "do I have enough gas?"
- Planning batch swaps/transfers

Returns:
- Current session key balance
- Whether funding is needed (balance < 0.1 MON threshold)
- Recommended funding amount if needed
- Session key address for reference

If needsFunding = true, call fundSessionKey before proceeding with operations.

Example: "check session key balance" or before "swap to USDC, USDT, USDM"`,
    schema: z.object({}),
  }
);
