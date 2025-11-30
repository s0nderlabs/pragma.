"use client";

import type { AllowedToken } from "@pragma/core/monorail/tokens";
import { ensureTokenSet, normalizeAllowedTokensList } from "@pragma/core/monorail/tokens";
import { getAddress } from "viem";
import { authenticatedFetch } from "./api/authenticatedFetch";

const STORAGE_KEY = "pragma.h1.token-cache.v3";
const CACHE_VERSION = "v3";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_RETRIES = 1; // Reduced from 3 for faster fallback
const RETRY_DELAYS = [2000]; // Single 2s retry
const FETCH_TIMEOUT = 5000; // Reduced from 10s for faster timeout

/**
 * MAINNET FALLBACK TOKEN LIST
 * Synced with Monorail mainnet API /tokens/category/verified on 2025-11-30
 *
 * IMPORTANT: These addresses are for MAINNET (chain 143), NOT testnet.
 * Update this list when Monorail adds/removes verified tokens.
 */
const FALLBACK_TOKENS: AllowedToken[] = [
  // === NATIVE & WRAPPED ===
  {
    address: getAddress("0x0000000000000000000000000000000000000000"),
    decimals: 18,
    symbol: "MON",
    kind: "native",
    categories: ["native", "official", "verified"],
  },
  {
    address: getAddress("0x3bd359c1119da7da1d913d1c4d2b7c461115433a"),
    decimals: 18,
    symbol: "WMON",
    kind: "wrappedNative",
    categories: ["wrapper", "official", "verified"],
  },

  // === STABLECOINS ===
  {
    address: getAddress("0x00000000efe302beaa2b3e6e1b18d08d69a9012a"),
    decimals: 6,
    symbol: "AUSD",
    kind: "erc20",
    categories: ["verified", "stable"],
  },
  {
    address: getAddress("0x754704bc059f8c67012fed69bc8a327a5aafb603"),
    decimals: 6,
    symbol: "USDC",
    kind: "erc20",
    categories: ["stable", "verified"],
  },
  {
    address: getAddress("0xe7cd86e13ac4309349f30b3435a9d337750fc82d"),
    decimals: 6,
    symbol: "USDT0",
    kind: "erc20",
    categories: ["verified", "stable"],
  },

  // === LIQUID STAKING TOKENS (LST) ===
  {
    address: getAddress("0x0c65a0bc65a5d819235b71f554d210d3f80e0852"),
    decimals: 18,
    symbol: "aprMON",
    kind: "erc20",
    categories: ["verified", "lst"],
  },
  {
    address: getAddress("0x1b68626dca36c7fe922fd2d55e4f631d962de19c"),
    decimals: 18,
    symbol: "shMON",
    kind: "erc20",
    categories: ["verified", "lst"],
  },
  {
    address: getAddress("0x8498312a6b3cbd158bf0c93abdcf29e6e4f55081"),
    decimals: 18,
    symbol: "gMON",
    kind: "erc20",
    categories: ["verified", "lst"],
  },
  {
    address: getAddress("0xa3227c5969757783154c60bf0bc1944180ed81b9"),
    decimals: 18,
    symbol: "sMON",
    kind: "erc20",
    categories: ["verified", "lst"],
  },

  // === BRIDGED TOKENS ===
  {
    address: getAddress("0x0555e30da8f98308edb960aa94c0db47230d2b9c"),
    decimals: 8,
    symbol: "WBTC",
    kind: "erc20",
    categories: ["verified", "bridged"],
  },
  {
    address: getAddress("0xee8c0e9f1bffb4eb878d8f15f368a02a35481242"),
    decimals: 18,
    symbol: "WETH",
    kind: "erc20",
    categories: ["verified", "bridged"],
  },
  {
    address: getAddress("0x10aeaf63194db8d453d4d85a06e5efe1dd0b5417"),
    decimals: 18,
    symbol: "wstETH",
    kind: "erc20",
    categories: ["verified", "bridged"],
  },
  {
    address: getAddress("0xea17e5a9efebf1477db45082d67010e2245217f1"),
    decimals: 9,
    symbol: "SOL",
    kind: "erc20",
    categories: ["verified", "bridged"],
  },

  // === SYNTHETIC TOKENS ===
  {
    address: getAddress("0xe85411c030fb32a9d8b14bbbc6cb19417391f711"),
    decimals: 18,
    symbol: "suBTC",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0x1c22531aa9747d76fff8f0a43b37954ca67d28e0"),
    decimals: 18,
    symbol: "suETH",
    kind: "erc20",
    categories: ["verified"],
  },

  // === MEME TOKENS ===
  {
    address: getAddress("0x350035555e10d9afaf1566aaebfced5ba6c27777"),
    decimals: 18,
    symbol: "CHOG",
    kind: "erc20",
    categories: ["nad.fun", "meme", "verified"],
  },
  {
    address: getAddress("0x3842751a46d23b41a47e702473dff316e6237777"),
    decimals: 18,
    symbol: "143",
    kind: "erc20",
    categories: ["nad.fun", "meme", "verified"],
  },
  {
    address: getAddress("0xb5f73846a656232d5d251ab1048bca88d1507777"),
    decimals: 18,
    symbol: "MCA",
    kind: "erc20",
    categories: ["nad.fun", "meme", "verified"],
  },

  // === OTHER VERIFIED ===
  {
    address: getAddress("0x788571e0e5067adea87e6ba22a2b738ffdf48888"),
    decimals: 18,
    symbol: "UNIT",
    kind: "erc20",
    categories: ["verified"],
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
 * Read cached token list from localStorage (browser)
 * Returns empty array if cache is missing, expired, or incomplete
 */
const readCachedTokens = (): AllowedToken[] => {
  try {
    if (typeof window === "undefined") return [];
    const cached = localStorage.getItem(STORAGE_KEY);
    if (!cached) return [];

    const data: CachedTokenData = JSON.parse(cached);

    // Version mismatch = clear cache
    if (data.version !== CACHE_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }

    // Expired = clear cache
    if (Date.now() - data.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }

    // Incomplete data = clear cache
    if (!isCompleteTokenList(data.tokens, data.expectedCount)) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }

    return data.tokens;
  } catch {
    return [];
  }
};

/**
 * Write token list to localStorage cache
 */
const writeCachedTokens = (tokens: AllowedToken[]): void => {
  try {
    if (typeof window === "undefined") return;

    const data: CachedTokenData = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      expectedCount: tokens.length,
      tokens,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors (quota, etc.)
  }
};

/**
 * Normalize tokens from API response
 */
export const normalizeTokens = (tokens: AllowedToken[]): AllowedToken[] => {
  return normalizeAllowedTokensList(tokens);
};

/**
 * Get fallback token list (used when API fetch fails)
 * Returns mainnet verified tokens
 */
export const getFallbackAllowedTokens = (): AllowedToken[] => {
  return normalizeTokens(FALLBACK_TOKENS);
};

/**
 * Fetch with timeout using AbortController
 */
const fetchWithTimeout = async (url: string, timeout: number): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Use authenticated fetch for token API
    const response = await authenticatedFetch(url, {
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Sleep helper
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Load allowed tokens from API with caching
 *
 * Strategy:
 * 1. Check localStorage cache (1h TTL)
 * 2. If miss, fetch from /api/tokens with retries
 * 3. On success, cache to localStorage
 * 4. On failure, use fallback token list
 *
 * @param options.forceFallback - Skip API and use fallback directly (for testing)
 */
export const loadAllowedTokens = async (options?: { forceFallback?: boolean }): Promise<AllowedToken[]> => {
  // Force fallback for testing
  if (options?.forceFallback) {
    return getFallbackAllowedTokens();
  }

  // Try to use valid cached data first (skip if forcing fallback for test)
  if (!options?.forceFallback) {
    const cached = readCachedTokens();
    if (cached.length > 0) {
      return cached;
    }
  }

  // Fetch from API with retry logic
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = options?.forceFallback ? "/api/tokens?forceFallback=true" : "/api/tokens";
      const response = await fetchWithTimeout(url, FETCH_TIMEOUT);

      if (!response.ok) {
        throw new Error(`Token fetch failed (${response.status})`);
      }

      const payload = (await response.json()) as { tokens?: AllowedToken[] };

      if (!payload.tokens || !Array.isArray(payload.tokens)) {
        throw new Error("Invalid API response: missing tokens array");
      }

      const normalized = normalizeTokens(payload.tokens);

      if (normalized.length === 0) {
        console.error("[Allowlist] Normalized token list is empty! Raw tokens:", payload.tokens?.slice(0, 3));
        throw new Error("Token list empty");
      }

      // Must have required tokens
      const hasNative = normalized.some((t) => t.kind === "native");
      const hasWrapped = normalized.some((t) => t.kind === "wrappedNative");

      if (!hasNative || !hasWrapped) {
        throw new Error("Missing required tokens (native or wrapped)");
      }

      // Validate minimum token count - must have at least the essential tokens
      const MINIMUM_EXPECTED_TOKENS = 15;
      if (normalized.length < MINIMUM_EXPECTED_TOKENS) {
        console.warn(`[Allowlist] Incomplete data: ${normalized.length} < ${MINIMUM_EXPECTED_TOKENS}, retrying...`);
        throw new Error(`Incomplete token list: ${normalized.length} tokens`);
      }

      // Success! Cache and return
      writeCachedTokens(normalized);
      return normalized;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      console.warn(`[Allowlist] Attempt ${attempt}/${MAX_RETRIES} failed:`, error);

      if (!isLastAttempt) {
        // Retry with exponential backoff
        const delay = RETRY_DELAYS[attempt - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
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

/**
 * Get tokens with MON as first entry (for UI display)
 */
export const loadAllowedTokensWithMonFirst = async (): Promise<AllowedToken[]> => {
  const tokens = await loadAllowedTokens();

  // Find MON token
  const monIndex = tokens.findIndex((t) => t.symbol === "MON" || t.kind === "native");

  if (monIndex > 0) {
    // Move MON to front
    const mon = tokens[monIndex];
    tokens.splice(monIndex, 1);
    tokens.unshift(mon);
  }

  return tokens;
};
