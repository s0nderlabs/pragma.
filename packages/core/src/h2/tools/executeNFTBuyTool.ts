/**
 * Execute NFT Buy Tool
 *
 * Execute an NFT purchase using a stored quote from getNFTBuyQuote.
 * Uses ephemeral delegation execution with 1% protocol fee.
 *
 * **CRITICAL:** Only call this tool AFTER:
 * 1. User has seen the quote (from getNFTBuyQuote)
 * 2. User has explicitly confirmed execution
 *
 * This tool will:
 * - Retrieve fulfillment data from OpenSea
 * - Create ephemeral delegation with fee enforcement
 * - Sign delegation with Web3Auth
 * - Submit transaction via session key
 * - Wait for confirmation
 * - Return detailed receipt
 */

import { tool } from "langchain";
import { z } from "zod";
import type { Address, Hex, PublicClient, Transport } from "viem";
import { formatUnits } from "viem";
import { getNFTBuyQuote, deleteNFTBuyQuote } from "../execution/quoteStore.js";
import { executeNFTBuy } from "../execution/executeNFTBuy.js";
import { createErrorFromCode } from "../../errors/index.js";
import { emitProgress } from "../progress/emitter.js";

// ============================================================================
// Tool Schema
// ============================================================================

const executeNFTBuySchema = z.object({
  quoteId: z
    .string()
    .describe("Quote ID from getNFTBuyQuote. Exact ID from previous response."),
});

// ============================================================================
// Tool Implementation
// ============================================================================

export const executeNFTBuyTool = tool(
  async (input, config) => {
    try {
      // Get execution context from config
      const userAddress = config?.configurable?.userAddress as Address | undefined;
      const sessionData = config?.configurable?.sessionData as any;
      const publicClient = config?.configurable?.publicClient as PublicClient | undefined;
      const web3authBridge = config?.configurable?.web3authBridge;
      const smartAccount = config?.configurable?.smartAccount;
      const bundlerClient = config?.configurable?.bundlerClient;
      const sessionWallet = config?.configurable?.sessionWallet;
      const transport = config?.configurable?.transport as Transport | undefined;
      const fetchFn = (config?.configurable?.fetch as typeof fetch) || fetch;
      const origin = config?.configurable?.origin as string || "";

      // Validate context
      if (!userAddress || !sessionData || !publicClient || !web3authBridge) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Execution context is incomplete. Required: userAddress, sessionData, publicClient, web3authBridge.",
          context: {
            hasUserAddress: !!userAddress,
            hasSessionData: !!sessionData,
            hasPublicClient: !!publicClient,
            hasWeb3authBridge: !!web3authBridge,
          },
        });
      }

      if (!transport) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Transport is required for RPC calls",
        });
      }

      // Validate session data completeness
      const missingFields = [
        !sessionData.sessionKeyAddress && "sessionKeyAddress",
        !sessionData.sessionKeyPrivateKey && "sessionKeyPrivateKey",
        !sessionData.ownerAddress && "ownerAddress",
        !sessionData.chainId && "chainId",
      ].filter(Boolean);

      if (missingFields.length > 0) {
        throw createErrorFromCode("SESSION_INCOMPLETE", {
          message: `Session data is incomplete. Missing required fields: ${missingFields.join(", ")}`,
        });
      }

      const { quoteId } = input;
      const toolSignature = `executeNFTBuy:${quoteId}`;

      // Retrieve quote
      emitProgress("Retrieving NFT buy quote...", "executeNFTBuy", toolSignature);

      const quote = getNFTBuyQuote(quoteId);

      // Get fulfillment data from OpenSea
      emitProgress("Getting fulfillment data from OpenSea...", "executeNFTBuy", toolSignature);

      const fulfillmentResponse = await fetchFn(`${origin}/api/opensea/fulfillment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderHash: quote.orderHash,
          chain: quote.listingChain,
          protocolAddress: quote.protocolAddress,
          fulfillerAddress: userAddress,
        }),
      });

      if (!fulfillmentResponse.ok) {
        const errorText = await fulfillmentResponse.text().catch(() => fulfillmentResponse.statusText);
        throw createErrorFromCode("EXTERNAL_API_ERROR", {
          message: `Failed to get fulfillment data from OpenSea: ${errorText}`,
        });
      }

      const fulfillmentData = await fulfillmentResponse.json() as {
        calldata: Hex;
        value: string; // BigInt as string from API
      };

      // Execute the purchase via delegation
      const result = await executeNFTBuy({
        quoteId,
        fulfillmentData: {
          calldata: fulfillmentData.calldata,
          value: BigInt(fulfillmentData.value),
        },
        userAddress,
        sessionKeyAddress: sessionData.sessionKeyAddress,
        sessionKeyPrivateKey: sessionData.sessionKeyPrivateKey,
        ownerAddress: sessionData.ownerAddress,
        publicClient,
        web3authBridge,
        transport,
        chainId: sessionData.chainId,
        sessionWallet,
        signature: toolSignature,
      });

      // Format message for LLM
      const message = `**NFT Purchase Successful!**

**NFT:** ${quote.nftName} from ${quote.collectionSlug}
**Token ID:** ${quote.tokenId}
**Price:** ${quote.priceFormatted}
**Status:** ${result.status}
**Block:** ${result.blockNumber.toString()}
**Transaction:** [View on Explorer](https://monadvision.com/tx/${result.txHash})

The NFT has been transferred to your wallet. It may take a few minutes to appear in your collection.`;

      // Prepare metadata for activity extraction
      const metadata = {
        txHash: result.txHash,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
        status: result.status,
        nftName: quote.nftName,
        collectionSlug: quote.collectionSlug,
        tokenId: quote.tokenId,
        price: quote.priceFormatted,
        contractAddress: quote.contractAddress,
        delegationMetadata: result.delegationMetadata ? {
          delegator: result.delegationMetadata.delegator,
          sessionKey: result.delegationMetadata.sessionKey,
          nonce: result.delegationMetadata.nonce.toString(),
          delegationCount: result.delegationMetadata.delegationCount,
          delegationTypes: result.delegationMetadata.delegationTypes,
          expiresAt: result.delegationMetadata.expiresAt,
          feeEnforced: result.delegationMetadata.feeEnforced,
        } : undefined,
      };

      // Return message with embedded metadata
      return `${message}\n\n<!--PRAGMA_METADATA:${JSON.stringify(metadata)}-->`;

    } catch (error) {
      const err = error as Error;

      if (err.name === "QuoteNotFoundError" || err.name === "QuoteExpiredError") {
        throw createErrorFromCode("QUOTE_ERROR", {
          message: `${err.message}\n\nPlease request a new quote using getNFTBuyQuote.`,
          cause: error,
        });
      }

      if (err.name === "SessionKeyLowBalanceError" || err.message.includes("Session key balance")) {
        throw createErrorFromCode("SESSION_KEY_LOW_BALANCE", {
          message: `${err.message}\n\nPlease fund your session key using fundSessionKey tool.`,
          cause: error,
        });
      }

      throw createErrorFromCode("EXECUTION_FAILED", {
        message: `NFT purchase execution failed: ${err.message}`,
        cause: error,
      });
    }
  },
  {
    name: "executeNFTBuy",
    description: "Execute NFT purchase using quoteId from getNFTBuyQuote. Pass exact quoteId - never construct manually. Quote expires after 5 min. Normal mode: wait for user 'yes'. Quick mode: execute immediately.",
    schema: executeNFTBuySchema,
  }
);
