/**
 * Web Search Tool - OpenAI Native Web Search
 *
 * Enables the agent to search the web for current information:
 * - Token prices and market data
 * - Recent news and announcements
 * - Real-time events and updates
 * - Any information not in protocol documentation
 *
 * NOTE: Uses OpenAI's built-in web_search via /api/websearch endpoint.
 * This tool calls that API to keep the OpenAI API key server-side only.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { emitProgress } from "../progress/emitter.js";

// ============================================================================
// Configuration
// ============================================================================

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes (longer than RAG since web results change less frequently)

// Simple in-memory cache for search results
const searchCache = new Map<string, { result: string; timestamp: number }>();

/**
 * Normalize query for better cache hits
 */
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Check cache for existing result
 */
function getCachedResult(query: string): string | null {
  const normalized = normalizeQuery(query);
  const cached = searchCache.get(normalized);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  // Remove stale entry
  if (cached) {
    searchCache.delete(normalized);
  }

  return null;
}

/**
 * Cache a result
 */
function cacheResult(query: string, result: string): void {
  const normalized = normalizeQuery(query);
  searchCache.set(normalized, { result, timestamp: Date.now() });

  // Simple cache size limit (keep last 50 queries)
  if (searchCache.size > 50) {
    const firstKey = searchCache.keys().next().value;
    if (firstKey) searchCache.delete(firstKey);
  }
}

// ============================================================================
// Tool Schema
// ============================================================================

const webSearchSchema = z.object({
  query: z
    .string()
    .describe(
      "Search query for finding current information. Be specific and include context. Examples: 'MON token current price', 'Monad blockchain latest news', 'aPriori staking APY today'"
    ),
});

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Search the web for current information
 *
 * Uses OpenAI's native web_search capability through a server-side API.
 * Returns summarized results with source citations.
 */
export const webSearchTool = tool(
  async ({ query }, config): Promise<string> => {
    try {
      // Emit progress with the actual search query
      emitProgress(`Searching: "${query}"`, "web_search", `web_search:${query}`, "Web Search");

      // Check cache first
      const cachedResult = getCachedResult(query);
      if (cachedResult) {
        return cachedResult;
      }

      // Get fetch function from config (browser uses authenticatedFetch)
      // Falls back to global fetch for server-side usage
      const fetchFn = config?.configurable?.fetch || fetch;
      const webSearchApiUrl = process.env.WEBSEARCH_API_URL || "/api/websearch";

      try {
        // Build headers - use internal key if available (server-side),
        // otherwise rely on authenticatedFetch for auth (browser-side)
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        // Reuse RAG internal key for consistency
        const internalKey = process.env.RAG_INTERNAL_KEY;
        if (internalKey) {
          headers["x-rag-internal-key"] = internalKey;
        }

        const response = await fetchFn(webSearchApiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ query }),
        });

        if (!response.ok) {
          return "Unable to search the web at this time. Please try again later.";
        }

        const data = await response.json();
        const result = data.result || "No relevant information found.";

        // Cache the result
        cacheResult(query, result);

        return result;
      } catch (_fetchError) {
        // API not available (e.g., during build or in non-web context)
        return "Web search is not available in this environment.";
      }

    } catch (_error) {
      // Graceful fallback - don't crash the request
      return "Unable to complete web search. Please try again.";
    }
  },
  {
    name: "web_search",
    description: "Search web for current DeFi/crypto info: token prices, news, protocol updates. Use for real-time data not in docs. NEVER for off-topic questions (games, movies, general knowledge) - redirect those instead.",
    schema: webSearchSchema,
  }
);
