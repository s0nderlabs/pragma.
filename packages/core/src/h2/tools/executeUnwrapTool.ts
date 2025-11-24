/**
 * Execute Unwrap Tool
 *
 * Executes a confirmed WMON → MON unwrap using a quote ID.
 *
 * This tool MUST only be called after:
 * 1. getUnwrapQuote has been called
 * 2. User has confirmed the unwrap
 *
 * This tool WILL execute the blockchain transaction.
 */

import { tool } from "langchain";
import { z } from "zod";
import { type Address, type Hex } from "viem";

import { executeUnwrap } from "../execution/executeUnwrap.js";
import { getUnwrapQuote } from "../execution/quoteStore.js";
import { createErrorFromCode } from "../../errors/index.js";

export const executeUnwrapTool = tool(
  async ({ quoteId }, config) => {
    try {
      // Get execution context
      const userAddress = config?.configurable?.userAddress as Address;
      const sessionKeyAddress = config?.configurable?.sessionKeyAddress as Address;
      const sessionKeyPrivateKey = config?.configurable?.sessionKeyPrivateKey as Hex;
      const ownerAddress = config?.configurable?.ownerAddress as Address;
      const publicClient = config?.configurable?.publicClient;
      const web3authBridge = config?.configurable?.web3authBridge;
      const transport = config?.configurable?.transport;
      const chainId = config?.configurable?.chainId as number;

      // Validate required context
      if (!userAddress || !sessionKeyAddress || !sessionKeyPrivateKey || !ownerAddress) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Missing required execution context.",
        });
      }

      if (!publicClient || !web3authBridge || !transport || !chainId) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Missing public client, web3authBridge, transport, or chainId.",
        });
      }

      // Retrieve quote
      const quote = getUnwrapQuote(quoteId);

      // Execute unwrap
      const result = await executeUnwrap({
        quoteId,
        userAddress,
        sessionKeyAddress,
        sessionKeyPrivateKey,
        ownerAddress,
        publicClient,
        web3authBridge,
        transport,
        chainId,
      });

      // Format message for LLM (clean, human-readable)
      const message = `Unwrap executed successfully! 🎉

📊 Receipt:
• Unwrapped: ${quote.amount} WMON
• Received: ${result.actualOutputFormatted} MON
• Tx Hash: ${result.txHash}
• Block: ${result.blockNumber}
• Status: ${result.status}

Your WMON has been unwrapped back to MON!`;

      // Prepare metadata for activity extraction
      const metadata = {
        txHash: result.txHash,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
        status: result.status,
        fromToken: 'WMON',
        toToken: 'MON',
        fromAmount: quote.amount,
        toAmount: result.actualOutputFormatted,
        delegationMetadata: result.delegationMetadata ? {
          delegator: result.delegationMetadata.delegator,
          sessionKey: result.delegationMetadata.sessionKey,
          nonce: result.delegationMetadata.nonce.toString(), // Convert BigInt to string
          delegationCount: result.delegationMetadata.delegationCount,
          delegationTypes: result.delegationMetadata.delegationTypes,
          expiresAt: result.delegationMetadata.expiresAt,
          feeEnforced: result.delegationMetadata.feeEnforced,
        } : undefined,
      };

      // Return message with embedded metadata (hidden from LLM via HTML comment)
      return `${message}\n\n<!--PRAGMA_METADATA:${JSON.stringify(metadata)}-->`;
    } catch (error) {
      throw createErrorFromCode("EXECUTION_ERROR", {
        message: `Failed to execute unwrap: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "executeUnwrap",
    description: `Execute a confirmed WMON → MON unwrap transaction.

**CRITICAL:** ONLY call this tool after:
1. getUnwrapQuote has been called and returned a quote ID
2. User has explicitly confirmed the unwrap (e.g., "yes", "unwrap it", "execute")

This tool WILL execute a real blockchain transaction using ephemeral delegation.

Returns: Conversational receipt with transaction details`,
    schema: z.object({
      quoteId: z.string().describe("Quote ID from getUnwrapQuote"),
    }),
  }
);
