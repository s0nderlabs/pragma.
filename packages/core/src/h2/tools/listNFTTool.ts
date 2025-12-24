/**
 * List NFT Tool
 *
 * Lists an NFT for sale on OpenSea via Seaport protocol.
 *
 * Flow:
 * 1. Verify NFT ownership
 * 2. Check/execute Seaport conduit approval (delegation)
 * 3. Build Seaport order
 * 4. Sign order with Web3Auth EOA
 * 5. Validate order on-chain via Seaport.validate()
 * 6. Submit listing to OpenSea API
 *
 * Note: On-chain validation ensures the order is fillable directly on Seaport,
 * even if OpenSea API indexing fails due to smart account signature limitations.
 */

import { tool } from "langchain";
import { z } from "zod";
import type { Address, Hex, PublicClient, Transport } from "viem";
import { formatEther, getAddress, isAddress, parseEther } from "viem";
import { emitProgress } from "../progress/emitter.js";
import { executeNFTList } from "../execution/executeNFTList.js";

// ============================================================================
// Constants
// ============================================================================

/** Default listing duration: 7 days in seconds */
const DEFAULT_DURATION_DAYS = 7;

// ============================================================================
// Tool Schema
// ============================================================================

const listNFTSchema = z.object({
  contract: z
    .string()
    .describe(
      "NFT contract address (must be a valid 0x address). " +
        "Example: '0x6919f8b7e312d5d7c374e679de8c728e474e1557'. " +
        "If you only have the collection name, use getTopCollections first to find the contract."
    ),
  tokenId: z
    .string()
    .describe("Token ID to list. Example: '42'"),
  price: z
    .string()
    .describe("Listing price in MON. Examples: '1.5', '10', '0.1'"),
  duration: z
    .string()
    .optional()
    .describe("Listing duration in days. Default: 7"),
});

// ============================================================================
// Tool Implementation
// ============================================================================

export const listNFTTool = tool(
  async (input, config) => {
    try {
      const userAddress = config?.configurable?.userAddress as Address | undefined;
      const sessionData = config?.configurable?.sessionData as {
        ownerAddress?: Address;
        chainId?: number;
        sessionKeyAddress?: Address;
        sessionKeyPrivateKey?: Hex;
      } | undefined;
      const ownerAddress = sessionData?.ownerAddress;
      const chainId = sessionData?.chainId || 143;
      const sessionKeyAddress = sessionData?.sessionKeyAddress;
      const sessionKeyPrivateKey = sessionData?.sessionKeyPrivateKey;
      const publicClient = config?.configurable?.publicClient as PublicClient | undefined;
      const web3authBridge = config?.configurable?.web3authBridge;
      const transport = config?.configurable?.transport as Transport | undefined;
      const sessionWallet = config?.configurable?.sessionWallet;
      const fetchFn = (config?.configurable?.fetch as typeof fetch) || fetch;
      const origin = (config?.configurable?.origin as string) || "";

      if (!userAddress) {
        return "Error: No account session found. Please connect wallet first.";
      }

      if (!ownerAddress) {
        return "Error: Owner address not available. Please reconnect your wallet.";
      }

      if (!publicClient) {
        return "Error: No blockchain client available.";
      }

      if (!web3authBridge) {
        return "Error: Web3Auth bridge not available. Please reconnect your wallet.";
      }

      const { contract, tokenId, price, duration } = input;

      // Validate contract address
      if (!isAddress(contract)) {
        return `Error: Invalid contract address "${contract}".`;
      }
      const contractAddress = getAddress(contract);

      // Validate price
      let priceWei: bigint;
      try {
        priceWei = parseEther(price);
        if (priceWei <= 0n) {
          return "Error: Price must be greater than 0.";
        }
      } catch {
        return `Error: Invalid price "${price}". Use a valid number like '1.5' or '10'.`;
      }

      // Parse duration
      let durationDays = DEFAULT_DURATION_DAYS;
      if (duration) {
        const parsed = parseInt(duration, 10);
        if (isNaN(parsed) || parsed < 1 || parsed > 365) {
          return `Error: Invalid duration "${duration}". Use a number between 1 and 365 days.`;
        }
        durationDays = parsed;
      }
      const durationSeconds = durationDays * 24 * 60 * 60;

      emitProgress(`Creating listing for NFT #${tokenId}...`, "listNFT", "listNFT", `List NFT #${tokenId}`);

      // Execute listing (with auto-approval via delegation if needed)
      const result = await executeNFTList({
        nftContract: contractAddress,
        tokenId,
        priceWei,
        durationSeconds,
        userAddress,
        ownerAddress,
        publicClient,
        web3authBridge,
        fetchFn,
        origin,
        chainId,
        // Delegation params for auto-approval
        sessionKeyAddress,
        sessionKeyPrivateKey,
        sessionWallet,
        transport,
      });

      // Format expiry date
      const expiryDate = new Date(result.expiresAt * 1000).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      // Build transaction info
      const txInfo: string[] = [];
      if (result.approvalTxHash) {
        txInfo.push(`**Approval:** [View on Explorer](https://monadvision.com/tx/${result.approvalTxHash})`);
      }
      if (result.validateTxHash) {
        txInfo.push(`**Validation:** [View on Explorer](https://monadvision.com/tx/${result.validateTxHash})`);
      }
      const txInfoStr = txInfo.length > 0 ? "\n" + txInfo.join("\n") : "";

      // Different success messages based on OpenSea indexing status
      if (result.indexedOnOpenSea) {
        return `**NFT Listed Successfully!**

**NFT:** #${tokenId}
**Contract:** \`${contractAddress}\`
**Price:** ${result.priceFormatted}
**Duration:** ${durationDays} days
**Expires:** ${expiryDate}
**Order Hash:** \`${result.orderHash}\`${txInfoStr}
**View Listing:** [OpenSea](${result.listingUrl})

Your NFT is now listed for sale on OpenSea. Buyers can purchase it directly at the listed price.`;
      } else {
        return `**NFT Listed On-Chain!**

**NFT:** #${tokenId}
**Contract:** \`${contractAddress}\`
**Price:** ${result.priceFormatted}
**Duration:** ${durationDays} days
**Expires:** ${expiryDate}${txInfoStr}

**Status:** Order validated on Seaport (on-chain). OpenSea API indexing was not successful, but the order is still fillable directly on Seaport.

**Check Listing:** [OpenSea](${result.listingUrl}) - may take a few minutes to appear if OpenSea indexes validated orders.

**Note:** Anyone can fill this order directly on Seaport using the validation transaction.`;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[listNFTTool] Error:", errorMessage);

      // Handle specific error types with user-friendly messages
      if (errorMessage.includes("not approved")) {
        // Return the approval guidance from the error
        return errorMessage;
      }

      if (errorMessage.includes("don't own")) {
        return errorMessage;
      }

      return `Error listing NFT: ${errorMessage}`;
    }
  },
  {
    name: "listNFT",
    description: "List NFT for sale on OpenSea via Seaport. Price in MON. Optional duration in days (default 7). NOTE: Lists on-chain only - may not appear in OpenSea UI (known limitation). Use for 'list NFT for [price]', 'sell my NFT'. Normal mode: confirm with user first. Quick mode: execute without asking.",
    schema: listNFTSchema,
  }
);
