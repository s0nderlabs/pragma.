/**
 * Check Unstake Status Tool (aPriori - Read-Only)
 *
 * Checks the status of all withdrawal requests for the user.
 * FREE operation (read-only, no transaction).
 *
 * Shows:
 * - Request IDs
 * - aprMON shares to redeem
 * - MON amount to receive
 * - Claimable status (ready to claim or still waiting)
 * - Epoch unlock time
 * - Already claimed status
 *
 * Use this tool to:
 * - Check if withdrawal requests are ready to claim
 * - See how long until requests become claimable
 * - Get requestIds for batch claiming
 */

import { tool } from "langchain";
import { z } from "zod";
import {
  type Address,
  type PublicClient,
  formatUnits,
  getAddress,
} from "viem";

import { createErrorFromCode } from "../../errors/index.js";
import { APRIORI_ADDRESS } from "../config.js";
import { APRIORI_ABI, type RequestData } from "../../contracts/aprMonABI.js";

// ============================================================================
// Check Unstake Status Tool Implementation
// ============================================================================

export const checkUnstakeStatusTool = tool(
  async (_input, config) => {
    try {
      const userAddress = config?.configurable?.userAddress as Address;
      const publicClient = config?.configurable?.publicClient as PublicClient;

      if (!userAddress || !publicClient) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Missing required context",
        });
      }

      // Get all user requests (paginated - fetch first 100)
      const requestData = await publicClient.readContract({
        address: getAddress(APRIORI_ADDRESS),
        abi: APRIORI_ABI,
        functionName: "getUserRequestData",
        args: [getAddress(userAddress), 0n, 100n], // startIndex=0, pageSize=100
      }) as RequestData[];

      if (requestData.length === 0) {
        return `No unstake requests found.

You haven't created any withdrawal requests yet. To unstake aprMON, use the unstakeRequest tool first.`;
      }

      // Categorize requests
      const claimable: RequestData[] = [];
      const pending: RequestData[] = [];
      const claimed: RequestData[] = [];

      for (const request of requestData) {
        if (request.claimed) {
          claimed.push(request);
        } else if (request.claimable) {
          claimable.push(request);
        } else {
          pending.push(request);
        }
      }

      // Build formatted output
      let output = `**Unstake Status for ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}**\n\n`;

      output += `Total Requests: ${requestData.length}\n`;
      output += `• Claimable: ${claimable.length}\n`;
      output += `• Pending: ${pending.length}\n`;
      output += `• Already Claimed: ${claimed.length}\n\n`;

      // Show claimable requests
      if (claimable.length > 0) {
        output += `**✅ Ready to Claim (${claimable.length}):**\n`;
        for (const request of claimable) {
          output += `\n• Request ID: ${request.id}\n`;
          output += `  aprMON: ${formatUnits(request.shares, 18)}\n`;
          output += `  MON to receive: ${formatUnits(request.assets, 18)}\n`;
          output += `  Status: 🟢 CLAIMABLE - Use: "claim unstake ${request.id}"\n`;
        }
        output += "\n";

        // Add batch claim suggestion if multiple claimable
        if (claimable.length > 1) {
          const claimableIds = claimable.map(r => r.id).join(",");
          output += `💡 **Gas Saver:** Claim all at once: "claim unstake ${claimableIds}"\n\n`;
        }
      }

      // Show pending requests
      if (pending.length > 0) {
        output += `**⏳ Pending (${pending.length}):**\n`;
        for (const request of pending) {
          output += `\n• Request ID: ${request.id}\n`;
          output += `  aprMON: ${formatUnits(request.shares, 18)}\n`;
          output += `  MON to receive: ${formatUnits(request.assets, 18)}\n`;
          output += `  Unlock Epoch: ${request.unlockEpoch}\n`;
          output += `  Timestamp: ${new Date(Number(request.timestamp) * 1000).toLocaleString()}\n`;
          output += `  Status: ⏱️  WAITING - Check again in a few hours\n`;
        }
        output += "\n";
      }

      // Show claimed requests (last 3 only)
      if (claimed.length > 0) {
        const recentClaimed = claimed.slice(-3);
        output += `**✓ Already Claimed (showing last ${Math.min(3, claimed.length)} of ${claimed.length}):**\n`;
        for (const request of recentClaimed) {
          output += `\n• Request ID: ${request.id}\n`;
          output += `  aprMON: ${formatUnits(request.shares, 18)}\n`;
          output += `  MON received: ${formatUnits(request.assets, 18)}\n`;
          output += `  Status: ✅ CLAIMED\n`;
        }
        output += "\n";
      }

      // Add helpful tips
      if (pending.length > 0) {
        output += `**ℹ️ Tips:**\n`;
        output += `• TESTNET: Most withdrawals complete instantly (withdrawalDelay = 0)\n`;
        output += `• MAINNET: Pending requests typically become claimable after 12-18 hours\n`;
        output += `• Check status again with: "check unstake status"\n`;
        output += `• Epoch-based delays ensure fair processing for all users\n`;
      }

      return output;
    } catch (error) {
      throw createErrorFromCode("RPC_UNAVAILABLE", {
        message: `Failed to check unstake status: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "checkUnstakeStatus",
    description: `Check status of all aprMON withdrawal requests. FREE operation (read-only).

⚡ **TESTNET NOTE:** Most withdrawals complete instantly (withdrawalDelay = 0), so you
   likely already received your MON. This tool mainly useful on mainnet with delays.

Use when user wants to:
- Check if withdrawal requests are ready to claim
- See pending unstake requests
- Get requestIds for claiming
- Check how long until claimable

Returns:
- Summary of all requests (claimable, pending, claimed)
- Request details (ID, amounts, status, timestamps)
- Action suggestions ("claim unstake X" for ready requests)
- Batch claim suggestions for gas optimization
- Network-specific tips (testnet instant vs mainnet delayed)

No transaction required - this is a read-only query.

Example: "check unstake status" or "are my unstake requests ready?"`,
    schema: z.object({}),
  }
);
