/**
 * Execute Transfer Tool
 *
 * Executes a confirmed token transfer using a quote ID.
 *
 * This tool MUST only be called after:
 * 1. getTransferQuote has been called
 * 2. User has confirmed the transfer
 *
 * This tool WILL execute the blockchain transaction.
 */

import { tool } from "langchain";
import { z } from "zod";
import { type Address, type Hex } from "viem";

import { executeTransfer } from "../execution/executeTransfer.js";
import { getTransferQuote } from "../execution/quoteStore.js";
import { createErrorFromCode } from "../../errors/index.js";

// ============================================================================
// Execute Transfer Tool Implementation
// ============================================================================

export const executeTransferTool = tool(
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
      const smartAccount = config?.configurable?.smartAccount;
      const bundlerClient = config?.configurable?.bundlerClient;

      // Validate required context
      if (!userAddress || !sessionKeyAddress || !sessionKeyPrivateKey || !ownerAddress) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Missing required execution context (userAddress, sessionKeyAddress, sessionKeyPrivateKey, or ownerAddress).",
          context: {
            hasUserAddress: !!userAddress,
            hasSessionKeyAddress: !!sessionKeyAddress,
            hasSessionKeyPrivateKey: !!sessionKeyPrivateKey,
            hasOwnerAddress: !!ownerAddress,
          },
        });
      }

      if (!publicClient) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Public client is required but not provided in context.",
          context: { field: "publicClient" },
        });
      }

      if (!web3authBridge) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Web3Auth bridge is required but not provided in context.",
          context: { field: "web3authBridge" },
        });
      }

      if (!chainId) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Chain ID is required but not provided in context.",
          context: { field: "chainId" },
        });
      }

      // Retrieve quote (for display in success message)
      const quote = getTransferQuote(quoteId);

      // Execute transfer
      const result = await executeTransfer({
        quoteId,
        userAddress,
        sessionKeyAddress,
        sessionKeyPrivateKey,
        ownerAddress,
        publicClient,
        web3authBridge,
        chainId,
        smartAccount,
        bundlerClient,
      });

      // Return conversational receipt
      return `Transfer executed successfully! 🎉

📊 Receipt:
• Sent: ${quote.amount} ${quote.tokenSymbol}
• To: ${quote.recipient}
• Fee: FREE (gas only: ~${result.gasUsed} units)
• Tx Hash: ${result.txHash}
• Block: ${result.blockNumber}
• Status: ${result.status}

The transfer has been confirmed on-chain!`;
    } catch (error) {
      throw createErrorFromCode("EXECUTION_ERROR", {
        message: `Failed to execute transfer: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "executeTransfer",
    description: `Execute a confirmed token transfer transaction.

**CRITICAL:** ONLY call this tool after:
1. getTransferQuote has been called and returned a quote ID
2. User has explicitly confirmed the transfer (e.g., "yes", "send it", "execute")

This tool WILL execute a real blockchain transaction using ephemeral delegation.

Flow:
1. Retrieves quote by ID
2. Checks session key balance
3. Creates ephemeral delegation
4. Signs with Web3Auth
5. Submits transaction
6. Returns receipt with tx hash

Returns: Conversational receipt with transaction details

Example usage:
User: "send 100 USDC to 0x..."
You: [Call getTransferQuote] "Transfer ready. Quote ID: abc123. Proceed?"
User: "yes"
You: [Call executeTransfer with quoteId="abc123"]`,
    schema: z.object({
      quoteId: z.string().describe("Quote ID from getTransferQuote"),
    }),
  }
);
