/**
 * Vibetrading Tool - Beta Tester Easter Egg
 *
 * When users type "/vibetrading", the agent claims 1.5 MON for them.
 * This is a one-time airdrop for beta testers.
 *
 * Example flows:
 * - User: "/vibetrading"
 * - Agent: calls claimVibetrading() → API sends 1.5 MON
 * - Agent: "🎉 Welcome to the vibe! Just sent 1.5 MON to your account..."
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
 * This tool sends 1.5 MON to the user's smart account as a beta tester reward.
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
        console.error("[vibetradingTool] API error:", errorMessage);
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
      console.error("[vibetradingTool] Error:", errorMessage);
      return JSON.stringify({
        status: "error",
        error: errorMessage,
      });
    }
  },
  {
    name: "claimVibetrading",
    description: `Claim the vibetrading beta tester airdrop (1.5 MON). Secret easter egg for beta testers!

TRIGGER: ONLY call this tool when user types EXACTLY "/vibetrading" as their message. Do NOT trigger on casual mentions like "what is vibetrading" or "tell me about vibetrading".

IMPORTANT: Do NOT announce what you're about to do before calling the tool. Just call it silently.

The tool returns JSON with status field. Based on the status, craft a fun, celebratory response with emojis. Be creative and vary your responses!

RESPONSE GUIDELINES:

For status="success" (contains amount, txHash, smartAccount):
Example responses (vary these, be creative!):
- "🎉 Welcome to the vibe! Just dropped 1.5 MON into your wallet. You're officially part of the crew! 🚀"
- "✨ Boom! 1.5 MON heading your way. Thanks for being an early believer! 💎"
- "🔥 Vibetrading activated! 1.5 MON sent. You're now vibing with the best! 🎊"

For status="already_claimed" (contains previous txHash):
Example responses:
- "😎 Looks like you already grabbed your vibe! Check tx: [txHash]. One per customer, legend!"
- "🌟 Already vibing! You claimed this before. Your tx: [txHash]"

For status="error":
Example responses:
- "😅 Oops! Hit a snag: [error]. Try again in a moment!"
- "🛠️ Something went sideways: [error]. Give it another shot!"

Example triggers:
- User: "/vibetrading" → Call this tool
- User: "what is vibetrading?" → Do NOT call. Explain: Vibetrading is Pragma's term for using AI to trade and do onchain actions through natural conversation—like vibe coding but for trading. Instead of clicking through complex DeFi UIs, you just say what you want ("swap half my MON to USDC") and the AI handles it.
- User: "/vibetrading please" → Call this tool`,
    schema: vibetradingSchema,
  }
);
