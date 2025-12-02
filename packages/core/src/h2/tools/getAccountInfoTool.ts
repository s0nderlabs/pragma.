/**
 * Get Account Info Tool - Fetch user's session and account information
 *
 * Enables the agent to retrieve and display account details when users ask
 * "what account am I using?", "show my address", "whoami", etc.
 *
 * Example flows:
 * - User: "what account am I using?"
 * - Agent: calls getAccountInfo() → returns session details
 * - Agent: "You're using smart account 0x4C6C..."
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { Address, PublicClient } from "viem";

import { createErrorFromCode } from "../../errors/index.js";
import { getNameForAddress, formatAddressWithName } from "../utils/nameResolution.js";

// ============================================================================
// Tool Implementation
// ============================================================================

const getAccountInfoSchema = z.object({
  // No parameters needed - retrieves from session context
});

/**
 * Get user's account and session information
 *
 * This tool allows the agent to fetch account details when users ask about
 * their wallet address, smart account, or session information.
 *
 * @returns Formatted string with account and session details
 *
 * @example
 * ```typescript
 * // User asks "what account am I using?"
 * const info = await getAccountInfo({});
 * // Returns detailed account information
 * ```
 */
export const getAccountInfoTool = tool(
  async (_input, config) => {
    try {
      // Get user address, session data, and publicClient from config
      const userAddress = config?.configurable?.userAddress as Address | undefined;
      const sessionData = config?.configurable?.sessionData as any;
      const publicClient = config?.configurable?.publicClient as PublicClient | undefined;

      if (!userAddress) {
        return "No account session found. Please login with `/login` to connect your wallet.";
      }

      // Try to resolve user's NAD/ENS name (optional enhancement)
      let resolvedName: Awaited<ReturnType<typeof getNameForAddress>> = null;
      if (publicClient) {
        try {
          resolvedName = await getNameForAddress(userAddress, publicClient);
        } catch {
          // Name resolution failed, continue without name
        }
      }

      // Build account info response
      const lines: string[] = [];

      lines.push("📋 Your Account Information:");
      lines.push("");

      // Smart Account (HybridDelegator) - show name if available
      lines.push(`**Smart Account** (HybridDelegator)`);
      if (resolvedName) {
        lines.push(`  ${resolvedName.name} (${userAddress})`);
      } else {
        lines.push(`  ${userAddress}`);
      }
      lines.push("");

      // Additional session details if available
      if (sessionData) {
        // Owner Address (Web3Auth root account)
        if (sessionData.ownerAddress) {
          lines.push(`**Owner Address** (Web3Auth)`);
          lines.push(`  ${sessionData.ownerAddress}`);
          lines.push("");
        }

        // Session Key (for gas-less transactions)
        if (sessionData.sessionKeyAddress) {
          lines.push(`**Session Key** (Ephemeral)`);
          lines.push(`  ${sessionData.sessionKeyAddress}`);
          lines.push("");
        }

        // Chain Info
        if (sessionData.chainId) {
          const chainName = sessionData.chainId === 143 ? "Monad" : sessionData.chainId === 10143 ? "Monad Testnet" : `Chain ${sessionData.chainId}`;
          lines.push(`**Network**`);
          lines.push(`  ${chainName} (Chain ID: ${sessionData.chainId})`);
          lines.push("");
        }
      }

      lines.push("---");
      lines.push("");
      lines.push("💡 **About Your Account:**");
      lines.push("• Smart Account: Your main wallet address for all transactions");
      lines.push("• Owner Address: Your Web3Auth account that controls the smart account");
      lines.push("• Session Key: Temporary key used for gas-less transactions");
      lines.push("");
      lines.push("All swaps, transfers, and other operations execute from your Smart Account.");

      return lines.join("\n");
    } catch (error) {
      const errorMessage = (error as Error).message;

      throw createErrorFromCode("SESSION_INCOMPLETE", {
        message: `Failed to retrieve account information: ${errorMessage}`,
        cause: error,
      });
    }
  },
  {
    name: "getAccountInfo",
    description:
      "Get user's account and session information including smart account address, owner address, and session key. Call this when user asks 'what account am I using?', 'show my address', 'what is my wallet?', 'whoami', or similar account-related questions.",
    schema: getAccountInfoSchema,
  }
);
