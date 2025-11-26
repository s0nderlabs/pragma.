import type { AllowedToken } from "@pragma/core/monorail/tokens";
import { fetchAllowlist } from "./service";

let cachedTokens: AllowedToken[] | null = null;
let fetchPromise: Promise<AllowedToken[]> | null = null;
let cacheTimestamp: number | null = null;

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Get cached tokens if available and not expired
 */
export const getCachedTokens = (): AllowedToken[] | null => {
  if (!cachedTokens || !cacheTimestamp) return null;

  // Check if cache expired
  if (Date.now() - cacheTimestamp > CACHE_TTL) {
    cachedTokens = null;
    cacheTimestamp = null;
    return null;
  }

  return cachedTokens;
};

/**
 * Fetch tokens with caching and deduplication
 * - Returns cached tokens immediately if available
 * - Deduplicates concurrent requests
 * - Survives component unmounting
 */
export const fetchAllowlistCached = async (options?: { forceFallback?: boolean }): Promise<AllowedToken[]> => {
  // Skip cache if forcing fallback for testing
  if (!options?.forceFallback) {
    const cached = getCachedTokens();
    if (cached) {
      return cached;
    }

    if (fetchPromise) {
      return fetchPromise;
    }
  }

  fetchPromise = fetchAllowlist(options)
    .then((tokens) => {
      cachedTokens = tokens;
      cacheTimestamp = Date.now();
      fetchPromise = null;
      return tokens;
    })
    .catch((error) => {
      fetchPromise = null;
      console.error("[TokenCache] Fetch failed:", error);
      throw error;
    });

  return fetchPromise;
};

/**
 * Clear the token cache (useful for testing or forced refresh)
 */
export const clearTokenCache = () => {
  cachedTokens = null;
  cacheTimestamp = null;
  fetchPromise = null;
};
