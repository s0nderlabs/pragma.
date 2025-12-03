/**
 * Browse NFT Collection Tool
 *
 * Browse NFT listings in a collection via OpenSea API.
 * Returns a visual gallery of available NFTs for purchase.
 */

import { tool } from "langchain";
import { z } from "zod";
import type { Address } from "viem";
import { formatUnits } from "viem";
import type { NFT, NFTListing, NFTGalleryData, NFTDisplayData } from "../../opensea/types.js";

// ============================================================================
// Tool Schema
// ============================================================================

const browseCollectionSchema = z.object({
  collection: z
    .string()
    .describe("OpenSea collection slug. Examples: 'monad-punks', 'monad-apes'"),
  limit: z
    .number()
    .optional()
    .describe("Max NFTs to return. Default: 12, Max: 50"),
  maxPrice: z
    .string()
    .optional()
    .describe("Max price filter in MON. Example: '10' for 10 MON max"),
});

// ============================================================================
// Tool Implementation
// ============================================================================

export const browseCollectionTool = tool(
  async (input, config) => {
    try {
      const fetchFn = (config?.configurable?.fetch as typeof fetch) || fetch;
      const origin = config?.configurable?.origin as string || "";

      const { collection, limit = 12, maxPrice } = input;

      // Build query params
      const params = new URLSearchParams({
        collection,
        limit: Math.min(limit, 50).toString(),
      });
      if (maxPrice) {
        params.set("maxPrice", maxPrice);
      }

      // Fetch listings via API proxy
      const response = await fetchFn(`${origin}/api/opensea/listings?${params.toString()}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        return `Error fetching collection listings: ${errorText}`;
      }

      const data = await response.json() as { listings: NFTListing[]; nfts: NFT[]; next?: string };
      const { listings, nfts, next } = data;

      if (!listings || listings.length === 0) {
        return `No listings found for collection "${collection}"${maxPrice ? ` under ${maxPrice} MON` : ""}.`;
      }

      // Format listings for display
      const displayNfts: NFTDisplayData[] = listings.map((listing, index) => {
        const nft = nfts[index] || {
          identifier: listing.protocol_data.parameters.offer[0]?.identifierOrCriteria || "unknown",
          contract: listing.protocol_data.parameters.offer[0]?.token as Address || "0x0",
          collection,
          token_standard: "erc721" as const,
          name: `NFT #${listing.protocol_data.parameters.offer[0]?.identifierOrCriteria || index}`,
          opensea_url: "",
          updated_at: new Date().toISOString(),
          is_disabled: false,
          is_nsfw: false,
        };

        const priceWei = BigInt(listing.price.current.value);
        const decimals = listing.price.current.decimals;
        const formattedPrice = `${formatUnits(priceWei, decimals)} ${listing.price.current.currency}`;

        return {
          nft,
          // Note: Don't include full listing object - it has complex Seaport data that breaks JSON serialization
          // Store order hash for potential buy operations
          orderHash: listing.order_hash,
          formattedPrice,
          priceWei: priceWei.toString(),
          canBuy: listing.status === "active",
        };
      });

      // Build text output
      const textOutput = `Found ${listings.length} listings in "${collection}":\n\n${displayNfts
        .slice(0, 5)
        .map((d, i) => `${i + 1}. ${d.nft.name || `#${d.nft.identifier}`} - ${d.formattedPrice}`)
        .join("\n")}${listings.length > 5 ? `\n...and ${listings.length - 5} more` : ""}`;

      // Build gallery data for UI
      const galleryData: NFTGalleryData = {
        __type: "nft_gallery",
        title: `${collection} Listings`,
        nfts: displayNfts,
        totalCount: listings.length,
        nextCursor: next,
        mode: "browse",
      };

      return `${textOutput}

__nft_gallery__
${JSON.stringify(galleryData)}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[browseCollectionTool] Error:", errorMessage);
      return `Error browsing collection: ${errorMessage}`;
    }
  },
  {
    name: "browseCollection",
    description: "Browse NFT listings in a collection. Returns visual gallery. Use for 'show me [collection] NFTs'.",
    schema: browseCollectionSchema,
  }
);
