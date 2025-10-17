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

const STORAGE_KEY = "pragma.h1.token-cache.v2";

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

const readCachedTokens = (): AllowedToken[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { tokens?: AllowedToken[] };
    return parsed.tokens ? normalizeAllowedTokensList(parsed.tokens) : [];
  } catch {
    return [];
  }
};

const writeCachedTokens = (tokens: AllowedToken[]): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tokens: tokens.map((token) => ({
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          categories: token.categories,
        })),
      }),
    );
  } catch {
    // ignore quota errors
  }
};

export const getFallbackAllowedTokens = (): AllowedToken[] =>
  FALLBACK_TOKENS.map((token) => ({ ...token }));

export const normalizeTokens = (tokens: AllowedToken[]) => normalizeAllowedTokensList(tokens);

export const ensureTokenInSet = (tokens: AllowedToken[], candidate: AllowedToken) =>
  ensureTokenSet(tokens, candidate);

export const loadAllowedTokens = async (): Promise<AllowedToken[]> => {
  try {
    const response = await fetch("/api/tokens", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Token fetch failed (${response.status})`);
    }
    const payload = (await response.json()) as { tokens?: AllowedToken[] };
    const normalized = payload.tokens ? normalizeTokens(payload.tokens) : [];
    if (normalized.length === 0) {
      throw new Error("Token list empty");
    }
    writeCachedTokens(normalized);
    return normalized;
  } catch (error) {
    console.warn("Monorail token fetch failed; using cached or fallback list", error);
    const cached = readCachedTokens();
    if (cached.length > 0) {
      return cached;
    }
    return getFallbackAllowedTokens();
  }
};
