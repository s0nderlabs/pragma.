/**
 * Get My NFTs Tool
 *
 * Fetches NFTs owned by the user's wallet via OpenSea API proxy.
 * Returns a gallery format for chat display.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getAddress, type Address, formatUnits } from "viem";

import type { NFT, NFTDisplayData, NFTGalleryData } from "../../opensea/types.js";
import { createErrorFromCode } from "../../errors/index.js";
import { emitProgress } from "../progress/emitter.js";
import { getMonUsdPrice, formatMonWithUsd } from "./helpers/monPrice.js";

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

/**
 * Collection metadata for agent context
 */
interface CollectionMeta {
  name: string;
  slug: string;
  contract: string;
  count: number;
  floorPrice?: string;
  floorCurrency?: string;
}

/**
 * Listing price structure from OpenSea API
 */
interface ListingPrice {
  current: {
    currency: string;
    decimals: number;
    value: string;
  };
}

interface ListingData {
  price: ListingPrice;
}

interface ListingsResponse {
  listings?: ListingData[];
}

/**
 * Fetch floor price for a collection from listings endpoint
 * Returns the price of the cheapest listing (first result, sorted by price)
 */
async function fetchFloorPrice(
  fetchFn: typeof fetch,
  slug: string
): Promise<{ price?: string; currency?: string }> {
  try {
    const params = new URLSearchParams({
      collection: slug,
      limit: "1", // Only need the first (cheapest) listing
    });

    const response = await fetchFn(`/api/opensea/listings?${params.toString()}`);
    if (!response.ok) return {};

    const data = await response.json() as ListingsResponse;
    const listings = data.listings || [];

    if (listings.length > 0) {
      const firstListing = listings[0];
      const priceWei = BigInt(firstListing.price.current.value);
      const decimals = firstListing.price.current.decimals;
      const price = formatUnits(priceWei, decimals);
      const currency = firstListing.price.current.currency;
      return { price, currency };
    }

    return {};
  } catch {
    return {};
  }
}

function formatNFTListAsText(
  nfts: NFT[],
  userAddress: string,
  floorPrices: Map<string, { price?: string; currency?: string }>,
  monUsdPrice?: number
): { text: string; collections: CollectionMeta[] } {
  if (nfts.length === 0) {
    return {
      text: `**Your NFTs**

No NFTs found in your wallet.

Address: ${userAddress}`,
      collections: [],
    };
  }

  // Group by collection slug
  const byCollection = new Map<string, NFT[]>();
  for (const nft of nfts) {
    const collection = nft.collection || "Unknown";
    if (!byCollection.has(collection)) {
      byCollection.set(collection, []);
    }
    byCollection.get(collection)!.push(nft);
  }

  const lines: string[] = [`**Your NFTs** (${nfts.length} total)`, ""];
  const collectionsMeta: CollectionMeta[] = [];

  for (const [slug, collectionNfts] of byCollection) {
    // Derive collection name from NFT names (remove token ID suffix)
    const firstNft = collectionNfts[0];
    let collectionName = slug;

    // Try to extract collection name from NFT name (e.g., "Bored Cat #123" -> "Bored Cat")
    if (firstNft.name) {
      const nameParts = firstNft.name.split(/\s*#\d+/);
      if (nameParts[0] && nameParts[0].trim().length > 0) {
        collectionName = nameParts[0].trim();
      }
    }

    // Get floor price for this collection
    const floorData = floorPrices.get(slug);
    const floorPrice = floorData?.price;
    const floorCurrency = floorData?.currency;

    // Store metadata for agent
    collectionsMeta.push({
      name: collectionName,
      slug,
      contract: firstNft.contract,
      count: collectionNfts.length,
      floorPrice,
      floorCurrency,
    });

    // Human-readable output: show name and floor price with USD
    let floorDisplay = "";
    if (floorPrice) {
      const currency = floorCurrency || "MON";
      const currencyUpper = currency.toUpperCase();
      // Check for MON/WMON (case-insensitive) - OpenSea may return different cases
      if ((currencyUpper === "MON" || currencyUpper === "WMON") && monUsdPrice) {
        floorDisplay = ` • Floor: ${formatMonWithUsd(parseFloat(floorPrice), monUsdPrice)}`;
      } else {
        floorDisplay = ` • Floor: ${floorPrice} ${currency}`;
      }
    }
    lines.push(`**${collectionName}** (${collectionNfts.length} NFT${collectionNfts.length > 1 ? "s" : ""}${floorDisplay})`);

    for (const nft of collectionNfts.slice(0, 5)) {
      const name = getNFTDisplayName(nft);
      const img = nft.display_image_url || nft.image_url;
      lines.push(`  ${img ? "🖼️" : "📄"} ${name}`);
    }

    if (collectionNfts.length > 5) {
      lines.push(`  ... and ${collectionNfts.length - 5} more`);
    }

    // Show contract address (important for identification)
    lines.push(`  Contract: \`${firstNft.contract}\``);
    lines.push("");
  }

  lines.push(`Wallet: ${userAddress}`);

  return {
    text: lines.join("\n"),
    collections: collectionsMeta,
  };
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

      // Get unique collection slugs from NFTs
      const uniqueSlugs = [...new Set(nfts.map(nft => nft.collection).filter(Boolean))] as string[];

      // Fetch floor prices for all collections in parallel
      emitProgress("Fetching floor prices...", "getMyNFTs", toolSignature);
      const floorPriceResults = await Promise.all(
        uniqueSlugs.map(async (slug) => {
          const floorData = await fetchFloorPrice(fetchFn, slug);
          return [slug, floorData] as const;
        })
      );
      const floorPrices = new Map(floorPriceResults);

      // Fetch MON/USD price for floor price display
      const origin = (config?.configurable?.origin as string) || "";
      const monUsdPrice = await getMonUsdPrice(fetchFn, origin);

      // Format results
      emitProgress("Formatting NFT Gallery...", "getMyNFTs", toolSignature);

      const displayNfts = nfts.map((nft) => formatNFTForDisplay(nft));
      const galleryData = buildGalleryData(
        displayNfts,
        collection ? `Your ${collection} NFTs` : "Your NFTs",
        nextCursor
      );

      const { text: textOutput, collections } = formatNFTListAsText(nfts, checksummedAddress, floorPrices, monUsdPrice);

      // Include collections metadata in gallery data for agent context
      const enrichedGalleryData = {
        ...galleryData,
        collections, // Array of { name, slug, contract, count }
      };

      // Return text for LLM + structured data marker for UI
      // Agent can use collections array to find slug for follow-up operations
      return `${textOutput}

__nft_gallery__
${JSON.stringify(enrichedGalleryData)}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[getMyNFTsTool] Error:", errorMessage);
      return `Error fetching NFTs: ${errorMessage}`;
    }
  },
  {
    name: "getMyNFTs",
    description: "Get NFTs owned by user. Returns visual gallery grouped by collection with floor prices. Optional: filter by collection slug. Use for 'show my NFTs', 'what NFTs do I have'.",
    schema: getMyNFTsSchema,
  }
);
