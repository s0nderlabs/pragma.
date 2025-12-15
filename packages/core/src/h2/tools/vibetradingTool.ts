/**
 * Vibetrading Tool - Beta Tester Easter Egg
 *
 * When users type "/vibetrading", the agent claims 5 MON for them.
 * This is a one-time airdrop for beta testers.
 *
 * Example flows:
 * - User: "/vibetrading"
 * - Agent: calls claimVibetrading() → API sends 5 MON
 * - Agent: "🎉 Welcome to the vibe! Just sent 5 MON to your account..."
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { Address } from "viem";

// ============================================================================
// Tool Implementation
// ============================================================================

const vibetradingSchema = z.object({
  // No parameters needed - uses session context for user address
});

/**
 * Claim vibetrading beta tester airdrop
 *
 * This tool sends 5 MON to the user's smart account as a beta tester reward.
 * Each user can only claim once.
 *
 * @returns Status message about the claim
 */
export const vibetradingTool = tool(
  async (_input, config) => {
    try {
      // Get user's smart account from session config
      const userAddress = config?.configurable?.userAddress as Address | undefined;
      const apiBaseUrl = config?.configurable?.apiBaseUrl as string | undefined;

      if (!userAddress) {
        return JSON.stringify({
          status: "error",
          error: "No account session found. Please connect wallet first.",
        });
      }

      // Get authenticated fetch from configurable (for browser context with auth)
      const fetchFn = (config?.configurable?.fetch as typeof fetch) || fetch;

      // Call the vibetrading API
      const baseUrl = apiBaseUrl || "";
      const response = await fetchFn(`${baseUrl}/api/vibetrading`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          smartAccount: userAddress,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `HTTP ${response.status}`;
        return JSON.stringify({
          status: "error",
          error: errorMessage,
        });
      }

      const result = await response.json();

      if (result.success) {
        return JSON.stringify({
          status: "success",
          amount: result.amount,
          txHash: result.txHash,
          smartAccount: result.smartAccount,
        });
      } else if (result.reason === "already_claimed") {
        return JSON.stringify({
          status: "already_claimed",
          txHash: result.txHash,
        });
      } else {
        return JSON.stringify({
          status: "error",
          error: result.error || result.message || "Unknown error",
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return JSON.stringify({
        status: "error",
        error: errorMessage,
      });
    }
  },
  {
    name: "claimVibetrading",
    description: "Claim 5 MON beta tester airdrop. ONLY call when user types EXACTLY '/vibetrading' command. Do NOT call for questions like 'what is vibetrading?' - those should be answered from context or webSearch. One-time claim per user.",
    schema: vibetradingSchema,
  }
);
