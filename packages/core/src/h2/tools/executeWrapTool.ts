/**
 * Execute Wrap Tool
 *
 * Executes a confirmed MON → WMON wrap using a quote ID.
 *
 * This tool MUST only be called after:
 * 1. getWrapQuote has been called
 * 2. User has confirmed the wrap
 *
 * This tool WILL execute the blockchain transaction.
 */

import { tool } from "langchain";
import { z } from "zod";
import { type Address, type Hex } from "viem";

import { executeWrap } from "../execution/executeWrap.js";
import { getWrapQuote } from "../execution/quoteStore.js";
import { createErrorFromCode } from "../../errors/index.js";

export const executeWrapTool = tool(
  async ({ quoteId }, config) => {
    try {
      // Get execution context
      const userAddress = config?.configurable?.userAddress as Address;
      const sessionKeyAddress = config?.configurable?.sessionKeyAddress as Address;
      const sessionKeyPrivateKey = config?.configurable?.sessionKeyPrivateKey as Hex;
      const ownerAddress = config?.configurable?.ownerAddress as Address;
      const publicClient = config?.configurable?.publicClient;
      const web3authBridge = config?.configurable?.web3authBridge;
      const chainId = config?.configurable?.chainId as number;

      // Validate required context
      if (!userAddress || !sessionKeyAddress || !sessionKeyPrivateKey || !ownerAddress) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Missing required execution context.",
        });
      }

      if (!publicClient || !web3authBridge || !chainId) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Missing public client, web3authBridge, or chainId.",
        });
      }

      // Retrieve quote
      const quote = getWrapQuote(quoteId);

      // Execute wrap
      const result = await executeWrap({
        quoteId,
        userAddress,
        sessionKeyAddress,
        sessionKeyPrivateKey,
        ownerAddress,
        publicClient,
        web3authBridge,
        chainId,
      });

      // Return receipt
      return `Wrap executed successfully! 🎉

📊 Receipt:
• Wrapped: ${quote.amount} MON
• Received: ${result.actualOutputFormatted} WMON
• Tx Hash: ${result.txHash}
• Block: ${result.blockNumber}
• Status: ${result.status}

Your MON has been wrapped into WMON!`;
    } catch (error) {
      throw createErrorFromCode("EXECUTION_ERROR", {
        message: `Failed to execute wrap: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "executeWrap",
    description: `Execute a confirmed MON → WMON wrap transaction.

**CRITICAL:** ONLY call this tool after:
1. getWrapQuote has been called and returned a quote ID
2. User has explicitly confirmed the wrap (e.g., "yes", "wrap it", "execute")

This tool WILL execute a real blockchain transaction using ephemeral delegation.

Returns: Conversational receipt with transaction details`,
    schema: z.object({
      quoteId: z.string().describe("Quote ID from getWrapQuote"),
    }),
  }
);
