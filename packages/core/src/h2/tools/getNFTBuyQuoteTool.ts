/**
 * Get NFT Buy Quote Tool
 *
 * Get a quote for purchasing an NFT via OpenSea.
 * Returns price, gas estimate, and stores quote for execution.
 */

import { tool } from "langchain";
import { z } from "zod";
import type { Address, Hex } from "viem";
import { formatUnits, getAddress } from "viem";
import { generateQuoteId, storeNFTBuyQuote } from "../execution/quoteStore.js";
import type { NFTBuyQuoteData } from "../execution/types.js";

// ============================================================================
// Configuration
// ============================================================================

const QUOTE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Tool Schema
// ============================================================================

const getNFTBuyQuoteSchema = z.object({
  collection: z
    .string()
    .describe("OpenSea collection slug. Example: 'monad-punks'"),
  tokenId: z
    .string()
    .describe("Token ID of the NFT. Example: '42'"),
});

// ============================================================================
// Tool Implementation
// ============================================================================

export const getNFTBuyQuoteTool = tool(
  async (input, config) => {
    try {
      const userAddress = config?.configurable?.userAddress as Address | undefined;
      const fetchFn = (config?.configurable?.fetch as typeof fetch) || fetch;
      const origin = config?.configurable?.origin as string || "";

      if (!userAddress) {
        return "Error: No account session found. Please connect wallet first.";
      }

      const { collection, tokenId } = input;

      // Get best listing for this NFT
      const listingResponse = await fetchFn(
        `${origin}/api/opensea/best-listing?collection=${collection}&tokenId=${tokenId}`
      );

      if (!listingResponse.ok) {
        if (listingResponse.status === 404) {
          return `NFT #${tokenId} from "${collection}" is not currently listed for sale.`;
        }
        const errorText = await listingResponse.text().catch(() => listingResponse.statusText);
        return `Error getting listing: ${errorText}`;
      }

      const listing = await listingResponse.json();

      // Extract contract address from listing (offer[0].token is the NFT contract)
      const listingContract = listing.protocol_data?.parameters?.offer?.[0]?.token;
      let contractAddress: Address = listingContract
        ? getAddress(listingContract)
        : "0x0000000000000000000000000000000000000000" as Address;

      // Get NFT details using contract address (collection slug endpoint doesn't exist in OpenSea v2)
      let nftName = `#${tokenId}`;

      if (contractAddress !== "0x0000000000000000000000000000000000000000") {
        const nftResponse = await fetchFn(
          `${origin}/api/opensea/nft?contract=${contractAddress}&tokenId=${tokenId}`
        );

        if (nftResponse.ok) {
          // Metadata endpoint returns { name, description, image, ... } directly (no .nft wrapper)
          const nftData = await nftResponse.json();
          nftName = nftData.name || nftName;
        }
      }

      // Parse price
      const priceWei = BigInt(listing.price.current.value);
      const decimals = listing.price.current.decimals;
      const currency = listing.price.current.currency;
      const priceFormatted = `${formatUnits(priceWei, decimals)} ${currency}`;

      // Generate and store quote
      const quoteId = generateQuoteId();
      const now = Date.now();

      const quoteData: NFTBuyQuoteData = {
        quoteId,
        contractAddress,
        tokenId,
        nftName,
        collectionSlug: collection,
        orderHash: listing.order_hash as Hex,
        listingChain: listing.chain,
        protocolAddress: getAddress(listing.protocol_address),
        priceWei,
        priceFormatted,
        currency,
        createdAt: now,
        expiresAt: now + QUOTE_EXPIRY_MS,
        userAddress,
      };

      storeNFTBuyQuote(quoteData);

      return `**NFT Buy Quote**

**NFT:** ${nftName} from ${collection}
**Token ID:** ${tokenId}
**Price:** ${priceFormatted}
**Quote ID:** \`${quoteId}\`

This quote expires in 5 minutes. To purchase, use the executeNFTBuy tool with this quote ID.

<!--QUOTE_ID:${quoteId}-->`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[getNFTBuyQuoteTool] Error:", errorMessage);
      return `Error getting NFT buy quote: ${errorMessage}`;
    }
  },
  {
    name: "getNFTBuyQuote",
    description: "Get buy quote for an NFT. Returns price and quote ID for executeNFTBuy.",
    schema: getNFTBuyQuoteSchema,
  }
);
