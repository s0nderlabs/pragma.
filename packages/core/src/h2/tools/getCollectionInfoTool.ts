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

function formatCollectionOutput(data: CollectionResponse): string {
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
  if (stats) {
    lines.push("");
    lines.push("**Stats:**");
    lines.push(`  • Floor Price: **${formatFloorPrice(stats.floor_price, stats.floor_price_symbol)}**`);
    lines.push(`  • Total Supply: ${stats.total_supply?.toLocaleString() || "Unknown"}`);
    lines.push(`  • Listed: ${stats.total_listings?.toLocaleString() || 0}`);
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

      return formatCollectionOutput(data);
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
