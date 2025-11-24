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

const FALLBACK_TOKENS: AllowedToken[] = [
  {
    address: getAddress("0xbF9307Ca0543654e1988e02aB7C968fCE7FeA318"),
    decimals: 18,
    symbol: "1Million",
    kind: "erc20",
    categories: ["nad.fun", "meme", "verified", "wrapped"],
  },
  {
    address: getAddress("0xb2f82D0f38dc453D596Ad40A37799446Cc89274A"),
    decimals: 18,
    symbol: "aprMON",
    kind: "erc20",
    categories: ["ecosystem", "lst", "verified"],
  },
  {
    address: getAddress("0x1eA9099E3026e0b3F8Dd6FbacAa45f30fCe67431"),
    decimals: 18,
    symbol: "ATL",
    kind: "erc20",
    categories: ["ecosystem", "verified"],
  },
  {
    address: getAddress("0x268E4E24E0051EC27b3D27A95977E71cE6875a05"),
    decimals: 18,
    symbol: "BEAN",
    kind: "erc20",
    categories: ["verified", "ecosystem"],
  },
  {
    address: getAddress("0x3552f8254263EA8880c7f7E25CB8dbBD79C0c4b1"),
    decimals: 18,
    symbol: "BMONAD",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0x4A5c952C446D5c4bBA9f4517b473EC1718C5f27a"),
    decimals: 6,
    symbol: "BUN",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0xE0590015A873bF326bd645c3E1266d4db41C4E6B"),
    decimals: 18,
    symbol: "CHOG",
    kind: "erc20",
    categories: ["launch", "verified"],
  },
  {
    address: getAddress("0x0F0BDEbF0F83cD1EE3974779Bcb7315f9808c714"),
    decimals: 18,
    symbol: "DAK",
    kind: "erc20",
    categories: ["launch", "verified"],
  },
  {
    address: getAddress("0xaEef2f6B429Cb59C9B2D7bB2141ADa993E8571c3"),
    decimals: 18,
    symbol: "gMON",
    kind: "erc20",
    categories: ["ecosystem", "verified", "lst"],
  },
  {
    address: getAddress("0x6ce1890EeAdAe7Db01026F4b294Cb8ec5ECc6563"),
    decimals: 18,
    symbol: "HALLI",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0x04a9d9D4AEa93F512A4c7b71993915004325ed38"),
    decimals: 18,
    symbol: "HEDGE",
    kind: "erc20",
    categories: ["ecosystem", "verified"],
  },
  {
    address: getAddress("0xceB564775415B524640D9f688278490A7f3EF9cd"),
    decimals: 18,
    symbol: "iceMON",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0xCc5B42F9d6144DFDFb6fb3987a2A916af902F5f8"),
    decimals: 6,
    symbol: "JAI",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0x8A056dF4d7f23121a90aca1Ca1364063D43Ff3B8"),
    decimals: 18,
    symbol: "KEYS",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0xC8527e96c3CB9522f6E35e95C0A28feAb8144f15"),
    decimals: 18,
    symbol: "MAD",
    kind: "erc20",
    categories: ["verified", "ecosystem"],
  },
  {
    address: getAddress("0x786f4aA162457EcdF8fa4657759fa3E86c9394fF"),
    decimals: 18,
    symbol: "MAD-LP",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0x3B428Df09c3508D884C30266Ac1577f099313CF6"),
    decimals: 8,
    symbol: "mamaBTC",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0xb38bb873cca844b20A9eE448a87Af3626a6e1EF5"),
    decimals: 18,
    symbol: "MIST",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0x0000000000000000000000000000000000000000"),
    decimals: 18,
    symbol: "MON",
    kind: "native",
    categories: ["official", "verified", "native"],
  },
  {
    address: getAddress("0x0C0c92FcF37Ae2CBCc512e59714Cd3a1A1cbc411"),
    decimals: 18,
    symbol: "MONDA",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0x4aa50E8208095d9594d18E8e3008ABB811125dCE"),
    decimals: 18,
    symbol: "MOON",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0x0EfeD4D9fB7863ccC7bb392847C08dCd00FE9bE2"),
    decimals: 18,
    symbol: "muBOND",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0x93E9CaE50424C7a4E3c5eCEb7855B6dab74Bc803"),
    decimals: 18,
    symbol: "NAP",
    kind: "erc20",
    categories: ["verified", "gaming"],
  },
  {
    address: getAddress("0xB5e5Fa5837304FeA6b9ce7e09623e63669Ad95Fb"),
    decimals: 6,
    symbol: "NFT",
    kind: "erc20",
    categories: ["stage", "verified"],
  },
  {
    address: getAddress("0x43e52CBC0073Caa7c0cf6e64b576CE2D6FB14eB8"),
    decimals: 18,
    symbol: "NOM",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0xc85548e0191cD34Be8092B0D42Eb4e45Eba0d581"),
    decimals: 18,
    symbol: "NSTR",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0xCa9A4F46Faf5628466583486FD5ACE8AC33ce126"),
    decimals: 18,
    symbol: "OCTO",
    kind: "erc20",
    categories: ["exchange", "verified"],
  },
  {
    address: getAddress("0x44369AAFDd04CD9609A57Ec0237884F45dd80818"),
    decimals: 18,
    symbol: "P1",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0x9569ad4B353D4811064ad9970B198fcb914428D5"),
    decimals: 18,
    symbol: "pillNADS",
    kind: "erc20",
    categories: ["verified", "nad.fun", "meme"],
  },
  {
    address: getAddress("0xA2426cD97583939E79Cfc12aC6E9121e37D0904d"),
    decimals: 18,
    symbol: "PINGU",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0x8a86d48c867b76FF74A36d3AF4d2F1E707B143eD"),
    decimals: 18,
    symbol: "RBSD",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0x92EAc40c98B383ea0f0eFDa747BdAc7Ac891D300"),
    decimals: 18,
    symbol: "RED",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0x6200DB750d4a6A2Ed84181DbDdc5E0029c238CBA"),
    decimals: 18,
    symbol: "RTMD",
    kind: "erc20",
    categories: ["nad.fun", "meme", "verified"],
  },
  {
    address: getAddress("0x3a98250F98Dd388C211206983453837C8365BDc1"),
    decimals: 18,
    symbol: "shMON",
    kind: "erc20",
    categories: ["ecosystem", "verified", "lst"],
  },
  {
    address: getAddress("0xe1d2439b75fb9746E7Bc6cB777Ae10AA7f7ef9c5"),
    decimals: 18,
    symbol: "sMON",
    kind: "erc20",
    categories: ["ecosystem", "lst", "verified"],
  },
  {
    address: getAddress("0x199c0Da6F291a897302300AAAe4F20d139162916"),
    decimals: 18,
    symbol: "stMON",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0x4961c832469Fcbb468c0a794de32FAaa30ccD2F6"),
    decimals: 18,
    symbol: "suBTC",
    kind: "erc20",
    categories: ["verified", "synthetic"],
  },
  {
    address: getAddress("0x3247B7d8100556ce6fC1A4141c117104ef806850"),
    decimals: 18,
    symbol: "suETH",
    kind: "erc20",
    categories: ["synthetic", "verified"],
  },
  {
    address: getAddress("0x8F3A8ae1f1859636E82CA4e30DB9FB129B02d825"),
    decimals: 18,
    symbol: "suUSD",
    kind: "erc20",
    categories: ["verified", "synthetic"],
  },
  {
    address: getAddress("0x2Eb6709Ec63421b056522Aae424E94d060D13fA2"),
    decimals: 18,
    symbol: "swMON",
    kind: "erc20",
    categories: ["verified", "lst"],
  },
  {
    address: getAddress("0x24D2FD6c5b29EebD5169Cc7D6e8014cd65DecD73"),
    decimals: 18,
    symbol: "TFAT",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0xf817257fed379853cDe0fa4F97AB987181B1E5Ea"),
    decimals: 6,
    symbol: "USDC",
    kind: "erc20",
    categories: ["verified", "stable"],
  },
  {
    address: getAddress("0xBdd352f339e27E07089039Ba80029f9135F6146F"),
    decimals: 6,
    symbol: "USDm",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D"),
    decimals: 6,
    symbol: "USDT",
    kind: "erc20",
    categories: ["verified", "stable"],
  },
  {
    address: getAddress("0xD875Ba8e2caD3c0f7e2973277C360C8d2f92B510"),
    decimals: 6,
    symbol: "USDX",
    kind: "erc20",
    categories: ["verified"],
  },
  {
    address: getAddress("0xcf5a6076cfa32686c0Df13aBaDa2b40dec133F1d"),
    decimals: 8,
    symbol: "WBTC",
    kind: "erc20",
    categories: ["bridged", "verified"],
  },
  {
    address: getAddress("0xB5a30b0FDc5EA94A52fDc42e3E9760Cb8449Fb37"),
    decimals: 18,
    symbol: "WETH",
    kind: "erc20",
    categories: ["bridged", "verified"],
  },
  {
    address: getAddress("0x760afe86e5de5fa0ee542fc7b7b713e1c5425701"),
    decimals: 18,
    symbol: "WMON",
    kind: "wrappedNative",
    categories: ["official", "verified", "wrapped"],
  },
  {
    address: getAddress("0x3bb9AFB94c82752E47706A10779EA525Cf95dc27"),
    decimals: 18,
    symbol: "WNative",
    kind: "erc20",
    categories: ["nad.fun", "meme", "verified", "wrapped"],
  },
  {
    address: getAddress("0x5387C85A4965769f6B0Df430638a1388493486F1"),
    decimals: 9,
    symbol: "WSOL",
    kind: "erc20",
    categories: ["bridged", "verified"],
  },
  {
    address: getAddress("0xfe140e1dCe99Be9F4F15d657CD9b7BF622270C50"),
    decimals: 18,
    symbol: "YAKI",
    kind: "erc20",
    categories: ["launch", "verified"],
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
 * Fetch tokens from API with timeout (authenticated)
 */
const fetchWithTimeout = async (url: string, timeout: number): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await authenticatedFetch(url, {
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
export const loadAllowedTokens = async (options?: { forceFallback?: boolean }): Promise<AllowedToken[]> => {
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
      console.log(`[Allowlist] Fetching from API (attempt ${attempt}/${MAX_RETRIES})`);

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

      console.log(`[Allowlist] Normalized ${payload.tokens?.length} tokens from API to ${normalized.length} tokens`);

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

      // Validate minimum token count - fallback has 51 tokens, API should return at least that
      const MINIMUM_EXPECTED_TOKENS = 51;
      if (normalized.length < MINIMUM_EXPECTED_TOKENS) {
        console.warn(`[Allowlist] Incomplete data: ${normalized.length} < ${MINIMUM_EXPECTED_TOKENS}, retrying...`);
        throw new Error(`Incomplete token list: ${normalized.length} tokens`);
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
