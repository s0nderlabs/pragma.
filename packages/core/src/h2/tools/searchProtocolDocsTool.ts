/**
 * Search Protocol Docs Tool - RAG-powered protocol information retrieval
 *
 * Enables the agent to search indexed protocol documentation for:
 * - FAQ answers (What is Pragma?, What is DTK?, etc.)
 * - Protocol explanations (aPriori staking, Monorail swaps)
 * - Current features and supported protocols
 *
 * NOTE: RAG via Pinecone is implemented in apps/web/src/app/api/rag/route.ts
 * This tool calls that API to avoid bundling Node.js-only code in the client.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { emitProgress } from "../progress/emitter.js";

// ============================================================================
// Configuration
// ============================================================================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Simple in-memory cache for query results
const queryCache = new Map<string, { result: string; timestamp: number }>();

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
  const cached = queryCache.get(normalized);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  // Remove stale entry
  if (cached) {
    queryCache.delete(normalized);
  }

  return null;
}

/**
 * Cache a result
 */
function cacheResult(query: string, result: string): void {
  const normalized = normalizeQuery(query);
  queryCache.set(normalized, { result, timestamp: Date.now() });

  // Simple cache size limit (keep last 100 queries)
  if (queryCache.size > 100) {
    const firstKey = queryCache.keys().next().value;
    if (firstKey) queryCache.delete(firstKey);
  }
}

// ============================================================================
// Tool Schema
// ============================================================================

const searchProtocolDocsSchema = z.object({
  query: z
    .string()
    .describe(
      "Question about Pragma, aPriori, Monorail, or Monad protocols. Examples: 'What is aPriori APR?', 'How does unstaking work?', 'What protocols does Pragma support?'"
    ),
});

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Search protocol documentation for factual information
 *
 * This tool returns a fallback message - RAG is implemented via API route.
 * The agent should use system prompt knowledge for protocol questions.
 *
 * TODO: Integrate with /api/rag endpoint when RAG is fully deployed
 */
export const searchProtocolDocsTool = tool(
  async ({ query }, config): Promise<string> => {
    try {
      // Emit progress with the actual search query
      emitProgress(`Searching docs: "${query}"`, "search_protocol_docs", `search_protocol_docs:${query}`, "Searching Protocol Docs");

      // Check cache first
      const cachedResult = getCachedResult(query);
      if (cachedResult) {
        return cachedResult;
      }

      // Check if RAG is disabled (enabled by default)
      if (process.env.RAG_ENABLED === "false") {
        return "Using system prompt knowledge for protocol information.";
      }

      // Get fetch function from config (browser uses authenticatedFetch)
      // Falls back to global fetch for server-side usage
      const fetchFn = config?.configurable?.fetch || fetch;
      const ragApiUrl = process.env.RAG_API_URL || "/api/rag";

      try {
        // Build headers - use internal key if available (server-side),
        // otherwise rely on authenticatedFetch for auth (browser-side)
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        // Only add internal key if running server-side (env var available)
        const ragInternalKey = process.env.RAG_INTERNAL_KEY;
        if (ragInternalKey) {
          headers["x-rag-internal-key"] = ragInternalKey;
        }

        const response = await fetchFn(ragApiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ query }),
        });

        if (!response.ok) {
          return "Using system prompt knowledge for protocol information.";
        }

        const data = await response.json();
        const result = data.result || "No relevant documentation found.";

        // Cache the result
        cacheResult(query, result);

        return result;
      } catch (_fetchError) {
        // API not available (e.g., during build or in non-web context)
        return "Using system prompt knowledge for protocol information.";
      }

    } catch (_error) {
      // Graceful fallback - don't crash the request
      return "Using system prompt knowledge for protocol information.";
    }
  },
  {
    name: "search_protocol_docs",
    description: "Search Pragma and protocol documentation. Use for 'how does Pragma work', 'what is aPriori', 'explain delegations'. For real-time data, use web_search instead.",
    schema: searchProtocolDocsSchema,
  }
);
