/**
 * Get My NFTs Tool
 *
 * Fetches NFTs owned by the user's wallet via OpenSea API proxy.
 * Returns a gallery format for chat display.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getAddress, type Address } from "viem";

import type { NFT, NFTDisplayData, NFTGalleryData } from "../../opensea/types.js";
import { createErrorFromCode } from "../../errors/index.js";
import { emitProgress } from "../progress/emitter.js";

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// ============================================================================
// Tool Schema
// ============================================================================

const getMyNFTsSchema = z.object({
  collection: z
    .string()
    .optional()
    .describe("OpenSea collection slug to filter. Example: 'boredapeyachtclub'"),
  limit: z
    .number()
    .optional()
    .describe("Max NFTs to fetch. Default: 20, Max: 50"),
});

// ============================================================================
// Helper Functions
// ============================================================================

function getNFTDisplayName(nft: NFT): string {
  return nft.name || `#${nft.identifier}`;
}

function formatNFTForDisplay(nft: NFT): NFTDisplayData {
  return {
    nft,
    isOwned: true,
    canBuy: false,
  };
}

function buildGalleryData(
  nfts: NFTDisplayData[],
  title: string,
  nextCursor?: string
): NFTGalleryData {
  return {
    __type: "nft_gallery",
    title,
    nfts,
    totalCount: nfts.length,
    nextCursor,
    mode: "owned",
  };
}

function formatNFTListAsText(nfts: NFT[], userAddress: string): string {
  if (nfts.length === 0) {
    return `**Your NFTs**

No NFTs found in your wallet.

Address: ${userAddress}`;
  }

  // Group by collection
  const byCollection = new Map<string, NFT[]>();
  for (const nft of nfts) {
    const collection = nft.collection || "Unknown";
    if (!byCollection.has(collection)) {
      byCollection.set(collection, []);
    }
    byCollection.get(collection)!.push(nft);
  }

  const lines: string[] = [`**Your NFTs** (${nfts.length} total)`, ""];

  for (const [collection, collectionNfts] of byCollection) {
    lines.push(`**${collection}** (${collectionNfts.length})`);

    for (const nft of collectionNfts.slice(0, 5)) {
      const name = getNFTDisplayName(nft);
      const img = nft.display_image_url || nft.image_url;
      lines.push(`  ${img ? "🖼️" : "📄"} ${name} [${nft.contract}:${nft.identifier}]`);
    }

    if (collectionNfts.length > 5) {
      lines.push(`  ... and ${collectionNfts.length - 5} more`);
    }
    lines.push("");
  }

  lines.push(`Address: ${userAddress}`);
  return lines.join("\n");
}

// ============================================================================
// Tool Implementation
// ============================================================================

export const getMyNFTsTool = tool(
  async ({ collection, limit }, config) => {
    try {
      const userAddress = config?.configurable?.userAddress as Address | undefined;

      if (!userAddress) {
        return "Error: No account session found. Please connect wallet first.";
      }

      const fetchFn = (config?.configurable?.fetch as typeof fetch) || fetch;

      // Progress update
      const toolSignature = `getMyNFTs:${Date.now()}`;
      const description = collection ? `Fetch NFTs from ${collection}` : "Fetch Your NFTs";
      emitProgress("Fetching Your NFTs from OpenSea...", "getMyNFTs", toolSignature, description);

      // Call API proxy
      const checksummedAddress = getAddress(userAddress);
      const effectiveLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);

      const params = new URLSearchParams({
        address: checksummedAddress,
        limit: effectiveLimit.toString(),
      });
      if (collection) params.set("collection", collection);

      const response = await fetchFn(`/api/opensea/nfts?${params.toString()}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw createErrorFromCode("RPC_UNAVAILABLE", {
          message: `OpenSea API error: ${errorText}`,
        });
      }

      const data = (await response.json()) as { nfts: NFT[]; next?: string };
      const { nfts, next: nextCursor } = data;

      // Format results
      emitProgress("Formatting NFT Gallery...", "getMyNFTs", toolSignature);

      const displayNfts = nfts.map((nft) => formatNFTForDisplay(nft));
      const galleryData = buildGalleryData(
        displayNfts,
        collection ? `Your ${collection} NFTs` : "Your NFTs",
        nextCursor
      );

      const textOutput = formatNFTListAsText(nfts, checksummedAddress);

      // Return text for LLM + structured data marker for UI
      return `${textOutput}

__nft_gallery__
${JSON.stringify(galleryData)}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[getMyNFTsTool] Error:", errorMessage);
      return `Error fetching NFTs: ${errorMessage}`;
    }
  },
  {
    name: "getMyNFTs",
    description: "Get NFTs owned by user from OpenSea. Returns visual gallery. Use for 'show my NFTs'.",
    schema: getMyNFTsSchema,
  }
);
