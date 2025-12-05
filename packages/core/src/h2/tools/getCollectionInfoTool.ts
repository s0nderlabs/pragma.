/**
 * Get NFT Collection Info Tool
 *
 * Get detailed information about an NFT collection including floor price.
 * Accepts either collection slug or contract address.
 */

import { tool } from "langchain";
import { z } from "zod";
import { getAddress, type Address, formatUnits } from "viem";
import { emitProgress } from "../progress/emitter.js";
import { getMonUsdPrice, formatMonWithUsd } from "./helpers/monPrice.js";

// ============================================================================
// Types
// ============================================================================

interface CollectionResponse {
  collection: {
    slug: string;
    name: string;
    description?: string;
    image_url?: string;
    banner_image_url?: string;
    opensea_url: string;
    project_url?: string;
    discord_url?: string;
    twitter_username?: string;
    contracts: Array<{ address: Address; chain: string }>;
    is_disabled: boolean;
    is_nsfw: boolean;
  };
  stats: {
    total_supply: number;
    total_listings: number;
    total_owners: number;
    floor_price?: number;
    floor_price_symbol?: string;
    average_price: number;
    market_cap?: number;
  } | null;
}

// ============================================================================
// Tool Schema
// ============================================================================

const getCollectionInfoSchema = z.object({
  collection: z
    .string()
    .describe(
      "Collection slug OR contract address. " +
      "Examples: 'monad-punks', '0x6919f8b7e312d5d7c374e679de8c728e474e1557'"
    ),
});

// ============================================================================
// Helper Functions
// ============================================================================

function formatFloorPrice(price: number | undefined, symbol: string = "MON"): string {
  if (price === undefined || price === null) {
    return "Not listed";
  }
  // Floor price from OpenSea is already in token units (not wei)
  return `${price} ${symbol}`;
}

// Listing price structure from OpenSea API
interface ListingPrice {
  current: {
    currency: string;
    decimals: number;
    value: string;
  };
}

interface ListingData {
  price: ListingPrice;
  order_hash: string;
}

interface ListingsResponse {
  listings?: ListingData[];
  next?: string;
}

/**
 * Count active listings and get floor price by paginating through the listings endpoint.
 * OpenSea V2 API does NOT provide total_listings in stats, so we must paginate.
 * Listings are sorted by price (lowest first), so the first listing is the floor.
 */
async function countActiveListings(
  fetchFn: typeof fetch,
  origin: string,
  slug: string,
  maxPages: number = 5 // Cap at 5 pages (1000 listings max)
): Promise<{ count: number; hasMore: boolean; floorPrice?: string; floorCurrency?: string }> {
  let totalCount = 0;
  let nextCursor: string | undefined;
  let page = 0;
  let floorPrice: string | undefined;
  let floorCurrency: string | undefined;

  do {
    const params = new URLSearchParams({
      collection: slug,
      limit: "200", // Max per page per OpenSea docs
    });
    if (nextCursor) params.set("next", nextCursor);

    const response = await fetchFn(`${origin}/api/opensea/listings?${params.toString()}`);
    if (!response.ok) break;

    const data = await response.json() as ListingsResponse;
    const listings = data.listings || [];
    totalCount += listings.length;

    // Get floor price from first listing (sorted by price ascending)
    if (!floorPrice && listings.length > 0) {
      const firstListing = listings[0];
      const priceWei = BigInt(firstListing.price.current.value);
      const decimals = firstListing.price.current.decimals;
      floorPrice = formatUnits(priceWei, decimals);
      floorCurrency = firstListing.price.current.currency;
    }

    nextCursor = data.next;
    page++;
  } while (nextCursor && page < maxPages);

  return { count: totalCount, hasMore: !!nextCursor, floorPrice, floorCurrency };
}

function formatCollectionOutput(
  data: CollectionResponse,
  activeListings: number,
  hasMore: boolean,
  floorPrice?: string,
  floorCurrency?: string,
  monUsdPrice?: number
): string {
  const { collection, stats } = data;

  const lines: string[] = [
    `🖼️ **${collection.name}**`,
    "",
    `**Collection Slug:** \`${collection.slug}\``,
  ];

  // Add contracts
  if (collection.contracts?.length > 0) {
    const contract = collection.contracts[0];
    lines.push(`**Contract:** \`${contract.address}\``);
  }

  // Add stats
  lines.push("");
  lines.push("**Stats:**");

  // Use floor price from listings (real-time) over stats (stale)
  if (floorPrice) {
    const priceNum = parseFloat(floorPrice);
    const currency = floorCurrency || "MON";
    const priceWithUsd = currency === "MON" && !isNaN(priceNum)
      ? formatMonWithUsd(priceNum, monUsdPrice)
      : `${floorPrice} ${currency}`;
    lines.push(`  • Floor Price: **${priceWithUsd}**`);
  } else if (stats?.floor_price) {
    const symbol = stats.floor_price_symbol || "MON";
    const priceWithUsd = symbol === "MON"
      ? formatMonWithUsd(stats.floor_price, monUsdPrice)
      : formatFloorPrice(stats.floor_price, symbol);
    lines.push(`  • Floor Price: **${priceWithUsd}**`);
  } else {
    lines.push(`  • Floor Price: **No listings**`);
  }

  if (stats) {
    lines.push(`  • Total Supply: ${stats.total_supply?.toLocaleString() || "Unknown"}`);
  }

  // Show REAL listing count from pagination (not stale stats)
  const listingDisplay = hasMore
    ? `${activeListings.toLocaleString()}+`  // More than we counted
    : activeListings.toLocaleString();
  lines.push(`  • Active Listings: ${listingDisplay}`);

  if (stats) {
    lines.push(`  • Owners: ${stats.total_owners?.toLocaleString() || "Unknown"}`);
    if (stats.average_price) {
      lines.push(`  • Avg Price: ${stats.average_price} ${stats.floor_price_symbol || "MON"}`);
    }
  }

  // Add description
  if (collection.description) {
    lines.push("");
    lines.push(`**Description:** ${collection.description.slice(0, 200)}${collection.description.length > 200 ? "..." : ""}`);
  }

  // Add links
  const links: string[] = [];
  if (collection.opensea_url) links.push(`[OpenSea](${collection.opensea_url})`);
  if (collection.project_url) links.push(`[Website](${collection.project_url})`);
  if (collection.discord_url) links.push(`[Discord](${collection.discord_url})`);
  if (collection.twitter_username) links.push(`[Twitter](https://twitter.com/${collection.twitter_username})`);

  if (links.length > 0) {
    lines.push("");
    lines.push(`**Links:** ${links.join(" | ")}`);
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Implementation
// ============================================================================

export const getCollectionInfoTool = tool(
  async (input, config) => {
    try {
      const fetchFn = (config?.configurable?.fetch as typeof fetch) || fetch;
      const origin = config?.configurable?.origin as string || "";

      const { collection } = input;

      // Emit progress
      const toolSignature = `getCollectionInfo:${Date.now()}`;
      emitProgress("Fetching collection info...", "getCollectionInfo", toolSignature, `Get info for ${collection}`);

      // Determine if input is a contract address or slug
      const isAddress = collection.startsWith("0x") && collection.length === 42;

      let params: URLSearchParams;
      if (isAddress) {
        // Validate address format
        try {
          const checksummed = getAddress(collection as Address);
          params = new URLSearchParams({ contract: checksummed });
        } catch {
          return `Error: Invalid contract address format: ${collection}`;
        }
      } else {
        params = new URLSearchParams({ slug: collection });
      }

      // Fetch collection info via API proxy
      const response = await fetchFn(`${origin}/api/opensea/collection?${params.toString()}`);

      if (!response.ok) {
        if (response.status === 404) {
          return `Collection not found: "${collection}"\n\nMake sure you're using the correct collection slug or contract address.`;
        }
        const errorText = await response.text().catch(() => response.statusText);
        return `Error fetching collection info: ${errorText}`;
      }

      const data = await response.json() as CollectionResponse;

      // Fetch MON/USD price for USD conversion (async, cached)
      const monUsdPrice = await getMonUsdPrice(fetchFn, origin);

      // Count active listings and get floor price (OpenSea stats are stale/incomplete)
      emitProgress("Counting active listings...", "getCollectionInfo", toolSignature);
      const { count: activeListings, hasMore, floorPrice, floorCurrency } = await countActiveListings(
        fetchFn,
        origin,
        data.collection.slug
      );

      return formatCollectionOutput(data, activeListings, hasMore, floorPrice, floorCurrency, monUsdPrice);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[getCollectionInfoTool] Error:", errorMessage);
      return `Error getting collection info: ${errorMessage}`;
    }
  },
  {
    name: "getCollectionInfo",
    description: "Get NFT collection details including floor price, supply, and listings. Accepts collection slug or contract address.",
    schema: getCollectionInfoSchema,
  }
);
