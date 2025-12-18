/**
 * Get Top Collections Tool
 *
 * Fetch top/trending NFT collections on Monad, sorted by volume or floor price.
 * Also supports searching collections by name (fuzzy matching).
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { emitProgress } from "../progress/emitter.js";
import { getMonUsdPrice, formatMonWithUsd } from "./helpers/monPrice.js";

// ============================================================================
// Types
// ============================================================================

interface CollectionStats {
  floor_price: number;
  market_cap: number;
  sales_1d: number;
  volume_1d: number; // Estimated volume in MON (sales * floor_price)
}

interface CollectionInfo {
  collection: string; // slug
  name: string;
  description?: string;
  image_url?: string;
  opensea_url: string;
  safelist_status: string;
  contracts: Array<{ address: string; chain: string }>;
  stats?: CollectionStats | null;
}

interface CollectionsResponse {
  collections: CollectionInfo[];
  next?: string;
}

// ============================================================================
// Fuzzy Matching
// ============================================================================

function normalizeString(str: string): string {
  return str.toLowerCase().replace(/[-_\s]/g, "");
}

function fuzzyScore(query: string, target: string): number {
  const normQuery = normalizeString(query);
  const normTarget = normalizeString(target);

  // Exact match
  if (normTarget === normQuery) return 100;

  // Starts with
  if (normTarget.startsWith(normQuery)) return 80;

  // Contains
  if (normTarget.includes(normQuery)) return 60;

  // Check if all query chars exist in order
  let queryIdx = 0;
  for (const char of normTarget) {
    if (char === normQuery[queryIdx]) queryIdx++;
    if (queryIdx === normQuery.length) return 40;
  }

  return 0;
}

function findBestMatch(query: string, collections: CollectionInfo[]): CollectionInfo | null {
  let best: CollectionInfo | null = null;
  let bestScore = 0;

  for (const coll of collections) {
    // Score against both name and slug
    const nameScore = fuzzyScore(query, coll.name);
    const slugScore = fuzzyScore(query, coll.collection);
    const score = Math.max(nameScore, slugScore);

    if (score > bestScore && score >= 40) {
      bestScore = score;
      best = coll;
    }
  }

  return best;
}

// ============================================================================
// Tool Schema
// ============================================================================

const getTopCollectionsSchema = z.object({
  search: z
    .string()
    .optional()
    .describe("Search for a collection by name. Example: 'skrumpeys', 'molandaks'"),
  sortBy: z
    .enum(["volume", "market_cap"])
    .optional()
    .describe("Sort by 'volume' (24h trading volume, default) or 'market_cap'"),
  limit: z.number().optional().describe("Max collections to return. Default: 5, max: 20"),
});

// ============================================================================
// Helpers
// ============================================================================

function formatCompact(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(2);
}

// ============================================================================
// Tool Implementation
// ============================================================================

export const getTopCollectionsTool = tool(
  async (input, config) => {
    try {
      const fetchFn = (config?.configurable?.fetch as typeof fetch) || fetch;
      const origin = (config?.configurable?.origin as string) || "";

      const { search, sortBy = "volume", limit = 5 } = input;

      // Emit progress
      const description = search
        ? `Searching for "${search}" collection`
        : "Fetching top Monad collections";
      const toolSignature = `getTopCollections:${search || "top"}`;
      emitProgress(description, "getTopCollections", toolSignature, "Getting Collections");

      // Fetch MON/USD price for USD conversion (async, cached)
      const monUsdPrice = await getMonUsdPrice(fetchFn, origin);

      // Fetch collections with stats (when not searching)
      const includeStats = !search;
      // When sorting by volume, fetch more collections since high-volume collections
      // may have lower market caps and appear later in the default ordering
      const fetchLimit = search ? 100 : sortBy === "volume" ? 50 : Math.min(limit * 3, 30);
      const params = new URLSearchParams({ limit: String(fetchLimit) });
      if (includeStats) {
        params.set("include_stats", "true");
      }

      const response = await fetchFn(`${origin}/api/opensea/collections?${params.toString()}`);

      if (!response.ok) {
        const error = await response.text().catch(() => response.statusText);
        return `Error fetching collections: ${error}`;
      }

      const data = (await response.json()) as CollectionsResponse;
      let collections = data.collections || [];

      if (collections.length === 0) {
        return "No collections found on Monad.";
      }

      // If searching, find best match
      if (search) {
        const match = findBestMatch(search, collections);
        if (match) {
          const contract = match.contracts?.[0]?.address || "N/A";
          return (
            `Found collection matching "${search}":\n\n` +
            `**${match.name}**\n` +
            `- Slug: \`${match.collection}\`\n` +
            `- Contract: \`${contract}\`\n` +
            `- Status: ${match.safelist_status}\n` +
            (match.description ? `\n${match.description.slice(0, 150)}...` : "") +
            `\n\n[View on OpenSea](${match.opensea_url})`
          );
        }
        return `No collection found matching "${search}". Try browsing top collections or use the exact slug.`;
      }

      // Sort collections based on sortBy parameter
      // API returns by market_cap, re-sort by volume if requested (default)
      if (sortBy === "volume") {
        collections.sort((a, b) => {
          const aVal = a.stats?.volume_1d || 0;
          const bVal = b.stats?.volume_1d || 0;
          return bVal - aVal; // Descending by 24h volume
        });
      }
      // market_cap sorting comes from API's order_by=market_cap (no re-sort needed)

      // Format top collections list with stats
      const sortLabel = sortBy === "volume" ? "24h Volume" : "Market Cap";
      const lines: string[] = [`**Top Monad NFT Collections** (by ${sortLabel})\n`];

      const limitedCount = Math.min(collections.length, limit);
      for (const coll of collections.slice(0, limitedCount)) {
        const verified = coll.safelist_status === "verified" ? " ✓" : "";
        const floor = coll.stats?.floor_price
          ? `Floor: ${formatMonWithUsd(coll.stats.floor_price, monUsdPrice, { compact: true })}`
          : "";
        const vol = coll.stats?.volume_1d
          ? `24h Vol: ~${formatCompact(coll.stats.volume_1d)} MON`
          : "";
        const sales = coll.stats?.sales_1d ? `(${coll.stats.sales_1d} sales)` : "";
        const statsStr = [floor, vol, sales].filter(Boolean).join(" | ");

        // Put slug inline with name to prevent agent from stripping it when summarizing
        lines.push(`- **${coll.name}** (\`${coll.collection}\`)${verified}`);
        if (statsStr) lines.push(`  ${statsStr}`);
      }

      lines.push(`\n_Showing top ${limitedCount} collections by ${sortBy === "volume" ? "24h volume" : "market cap"}_`);

      return lines.join("\n");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[getTopCollectionsTool] Error:", errorMessage);
      return `Error fetching collections: ${errorMessage}`;
    }
  },
  {
    name: "getTopCollections",
    description: "Get trending/top NFT collections on Monad with floor prices and 24h volume. Optional: search by name, sort by volume/market_cap. Use for 'popular collections', 'trending NFTs', 'find [collection]'.",
    schema: getTopCollectionsSchema,
  }
);
