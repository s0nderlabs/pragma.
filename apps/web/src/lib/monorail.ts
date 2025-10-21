"use client";

import type { AllowedToken } from "@pragma/core/monorail/tokens";
import { ensureTokenSet, normalizeAllowedTokensList } from "@pragma/core/monorail/tokens";
import { getAddress } from "viem";

import {
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_WMON_ADDRESS,
  MONAD_WRAPPED_TOKEN_SYMBOL,
} from "./config";

const STORAGE_KEY = "pragma.h1.token-cache.v3";
const CACHE_VERSION = "v3";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff in ms
const FETCH_TIMEOUT = 10000; // 10 seconds per attempt

const FALLBACK_TOKENS: AllowedToken[] = [
  {
    address: getAddress(MONAD_NATIVE_TOKEN_ADDRESS as `0x${string}`),
    decimals: 18,
    symbol: MONAD_NATIVE_TOKEN_SYMBOL,
    kind: "native",
    categories: ["fallback"],
  },
  {
    address: getAddress(MONAD_WMON_ADDRESS as `0x${string}`),
    decimals: 18,
    symbol: MONAD_WRAPPED_TOKEN_SYMBOL,
    kind: "wrappedNative",
    categories: ["fallback"],
  },
];

interface CachedTokenData {
  version: string;
  timestamp: number;
  expectedCount: number;
  tokens: AllowedToken[];
}

/**
 * Validate that a token list is complete and not partial
 */
const isCompleteTokenList = (tokens: AllowedToken[], expectedCount: number): boolean => {
  // Must match expected count EXACTLY (not partial data)
  if (tokens.length !== expectedCount) {
    console.warn(`[Allowlist] Incomplete token list: got ${tokens.length}, expected ${expectedCount}`);
    return false;
  }

  // Must have required tokens (ETH + WMON) as sanity check
  const hasNative = tokens.some((t) => t.kind === "native");
  const hasWrapped = tokens.some((t) => t.kind === "wrappedNative");

  if (!hasNative || !hasWrapped) {
    console.warn("[Allowlist] Missing required tokens (native or wrapped)");
    return false;
  }

  return true;
};

/**
 * Clear the token cache from localStorage
 */
const clearTokenCache = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    console.log("[Allowlist] Cache cleared");
  } catch {
    // Ignore quota/access errors
  }
};

/**
 * Read cached tokens with validation
 * Returns empty array if cache is invalid/stale/incomplete
 */
const readCachedTokens = (): AllowedToken[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as Partial<CachedTokenData>;

    // Validate cache structure
    if (!parsed.version || !parsed.timestamp || !parsed.expectedCount || !parsed.tokens) {
      console.warn("[Allowlist] Invalid cache structure");
      clearTokenCache();
      return [];
    }

    // Check cache version
    if (parsed.version !== CACHE_VERSION) {
      console.log("[Allowlist] Cache version mismatch, clearing");
      clearTokenCache();
      return [];
    }

    // Check cache TTL (1 hour)
    const age = Date.now() - parsed.timestamp;
    if (age > CACHE_TTL_MS) {
      console.log("[Allowlist] Cache expired, clearing");
      clearTokenCache();
      return [];
    }

    const normalized = normalizeAllowedTokensList(parsed.tokens);

    // Validate completeness
    if (!isCompleteTokenList(normalized, parsed.expectedCount)) {
      console.warn("[Allowlist] Cached data incomplete, clearing");
      clearTokenCache();
      return [];
    }

    console.log(`[Allowlist] Using cached tokens (${normalized.length} tokens)`);
    return normalized;
  } catch (error) {
    console.warn("[Allowlist] Cache read error, clearing", error);
    clearTokenCache();
    return [];
  }
};

/**
 * Write tokens to cache with metadata
 */
const writeCachedTokens = (tokens: AllowedToken[]): void => {
  if (typeof window === "undefined") return;

  try {
    const cacheData: CachedTokenData = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      expectedCount: tokens.length,
      tokens: tokens.map((token) => ({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        categories: token.categories,
      })),
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cacheData));
    console.log(`[Allowlist] Cached ${tokens.length} tokens`);
  } catch (error) {
    console.warn("[Allowlist] Cache write failed", error);
    // Ignore quota errors
  }
};

/**
 * Fetch tokens from API with timeout
 */
const fetchWithTimeout = async (url: string, timeout: number): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

/**
 * Sleep for specified milliseconds
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const getFallbackAllowedTokens = (): AllowedToken[] => FALLBACK_TOKENS.map((token) => ({ ...token }));

export const normalizeTokens = (tokens: AllowedToken[]) => normalizeAllowedTokensList(tokens);

export const ensureTokenInSet = (tokens: AllowedToken[], candidate: AllowedToken) =>
  ensureTokenSet(tokens, candidate);

/**
 * Load allowed tokens with validation, retry logic, and caching
 * Guarantees complete token list or fallback, never partial data
 */
export const loadAllowedTokens = async (): Promise<AllowedToken[]> => {
  // Try to use valid cached data first
  const cached = readCachedTokens();
  if (cached.length > 0) {
    return cached;
  }

  // Fetch from API with retry logic
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Allowlist] Fetching from API (attempt ${attempt}/${MAX_RETRIES})`);

      const response = await fetchWithTimeout("/api/tokens", FETCH_TIMEOUT);

      if (!response.ok) {
        throw new Error(`Token fetch failed (${response.status})`);
      }

      const payload = (await response.json()) as { tokens?: AllowedToken[] };

      if (!payload.tokens || !Array.isArray(payload.tokens)) {
        throw new Error("Invalid API response: missing tokens array");
      }

      const normalized = normalizeTokens(payload.tokens);

      if (normalized.length === 0) {
        throw new Error("Token list empty");
      }

      // Must have required tokens
      const hasNative = normalized.some((t) => t.kind === "native");
      const hasWrapped = normalized.some((t) => t.kind === "wrappedNative");

      if (!hasNative || !hasWrapped) {
        throw new Error("Missing required tokens (native or wrapped)");
      }

      // Success! Cache and return
      console.log(`[Allowlist] Successfully loaded ${normalized.length} tokens`);
      writeCachedTokens(normalized);
      return normalized;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      console.warn(`[Allowlist] Attempt ${attempt}/${MAX_RETRIES} failed:`, error);

      if (!isLastAttempt) {
        // Retry with exponential backoff
        const delay = RETRY_DELAYS[attempt - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        console.log(`[Allowlist] Retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        // All retries failed, use fallback
        console.error("[Allowlist] All fetch attempts failed, using fallback tokens");
        return getFallbackAllowedTokens();
      }
    }
  }

  // Should never reach here, but return fallback as safety
  return getFallbackAllowedTokens();
};
