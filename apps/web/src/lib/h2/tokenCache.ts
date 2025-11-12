/**
 * SessionStorage Token Cache for API Responses
 *
 * Client-side cache for token allowlist API responses.
 * Reduces unnecessary API calls and improves performance.
 */

import type { AllowedToken } from "@pragma/core";

const CACHE_KEY = "pragma_h2_tokens_api_cache";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (matches API memory cache)

interface TokenApiCache {
  tokens: AllowedToken[];
  cachedAt: number;
}

/**
 * Load cached tokens from sessionStorage
 * Returns undefined if cache is expired, invalid, or doesn't exist
 */
export function loadCachedTokens(): AllowedToken[] | undefined {
  try {
    // Check if running in browser
    if (typeof window === "undefined" || !window.sessionStorage) {
      return undefined;
    }

    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) {
      return undefined;
    }

    const cache = JSON.parse(raw) as TokenApiCache;

    // Validate cache structure
    if (!cache.cachedAt || !Array.isArray(cache.tokens)) {
      console.warn("[TokenCache] Invalid cache structure, clearing");
      window.sessionStorage.removeItem(CACHE_KEY);
      return undefined;
    }

    // Check if cache is expired
    const now = Date.now();
    if (now - cache.cachedAt > CACHE_TTL_MS) {
      console.log("[TokenCache] Cache expired, will fetch fresh data");
      window.sessionStorage.removeItem(CACHE_KEY);
      return undefined;
    }

    // Validate tokens array is not empty
    if (cache.tokens.length === 0) {
      console.warn("[TokenCache] Empty tokens in cache, clearing");
      window.sessionStorage.removeItem(CACHE_KEY);
      return undefined;
    }

    console.log(`[TokenCache] Loaded ${cache.tokens.length} tokens from cache`);
    return cache.tokens;
  } catch (error) {
    // Handle JSON parse errors, quota exceeded, etc.
    console.warn("[TokenCache] Failed to load from sessionStorage:", error);
    return undefined;
  }
}

/**
 * Save tokens to sessionStorage cache
 * Non-fatal - cache is best-effort
 */
export function saveCachedTokens(tokens: AllowedToken[]): void {
  try {
    // Check if running in browser
    if (typeof window === "undefined" || !window.sessionStorage) {
      return;
    }

    // Validate tokens before caching
    if (!Array.isArray(tokens) || tokens.length === 0) {
      console.warn("[TokenCache] Refusing to cache invalid tokens");
      return;
    }

    const cache: TokenApiCache = {
      tokens,
      cachedAt: Date.now(),
    };

    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    console.log(`[TokenCache] Cached ${tokens.length} tokens`);
  } catch (error) {
    // Handle quota exceeded, access denied, etc.
    // Non-fatal - cache is best-effort
    console.warn("[TokenCache] Failed to save to sessionStorage:", error);
  }
}
