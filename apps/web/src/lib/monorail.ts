"use client";

import type { AllowedToken, TokenCache, TokenCacheEntry } from "@pragma/core/monorail/tokens";
import {
  buildAllowedTokens,
  ensureTokenSet,
  normalizeAllowedTokensList,
} from "@pragma/core/monorail/tokens";
import { getAddress } from "viem";

import {
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONAD_WMON_ADDRESS,
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_WRAPPED_TOKEN_SYMBOL,
  MONORAIL_API_KEY,
  MONORAIL_DATA_API_URL,
} from "./config";

const STORAGE_KEY = "pragma.h1.token-cache.v1";

class BrowserTokenCache implements TokenCache {
  async load(): Promise<TokenCacheEntry | undefined> {
    if (typeof window === "undefined") return undefined;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return undefined;
      return JSON.parse(raw) as TokenCacheEntry;
    } catch {
      return undefined;
    }
  }

  async save(entry: TokenCacheEntry): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    } catch {
      // ignore storage quota errors
    }
  }
}

const cache = new BrowserTokenCache();

const TOKEN_METADATA = {
  nativeTokenAddress: MONAD_NATIVE_TOKEN_ADDRESS as `0x${string}`,
  wrappedNativeTokenAddress: MONAD_WMON_ADDRESS as `0x${string}`,
};

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

export const getFallbackAllowedTokens = (): AllowedToken[] =>
  FALLBACK_TOKENS.map((token) => ({ ...token }));

const normalizeCacheEntry = (entry: TokenCacheEntry | undefined): AllowedToken[] => {
  if (!entry) return [];
  return normalizeAllowedTokensList(
    entry.tokens
      .map((token) => {
        try {
          return {
            address: getAddress(token.address as `0x${string}`),
            symbol: token.symbol,
            name: token.name,
            decimals: typeof token.decimals === "number" ? token.decimals : Number(token.decimals ?? 18),
            categories: token.categories,
          } satisfies AllowedToken;
        } catch {
          return undefined;
        }
      })
      .filter((token): token is AllowedToken => Boolean(token)),
  );
};

export const loadAllowedTokens = async (): Promise<AllowedToken[]> =>
  buildAllowedTokens({
    dataApiUrl: MONORAIL_DATA_API_URL,
    apiKey: MONORAIL_API_KEY,
    cache,
    tokenMetadata: TOKEN_METADATA,
  }).catch(async (error) => {
    console.warn("Monorail token fetch failed; using fallback token list", error);
    const cached = await cache.load();
    const cachedTokens = normalizeCacheEntry(cached);
    if (cachedTokens.length > 0) {
      return cachedTokens;
    }
    return getFallbackAllowedTokens();
  });

export const normalizeTokens = (tokens: AllowedToken[]) => normalizeAllowedTokensList(tokens);
export const ensureTokenInSet = (tokens: AllowedToken[], candidate: AllowedToken) => ensureTokenSet(tokens, candidate);
