/**
 * H2 Token Loading Utilities (Web - Client Side)
 *
 * Loads allowed tokens for H2 agent by fetching from /api/tokens endpoint.
 * Uses sessionStorage for client-side caching to reduce API calls.
 *
 * Architecture:
 * - Client: This file (fetches from API, caches in sessionStorage)
 * - Server: /api/tokens/route.ts (uses @pragma/core, has memory cache)
 */

import type { AllowedToken } from "@pragma/core";
import { loadCachedTokens, saveCachedTokens } from "./tokenCache";
import { authenticatedFetch } from "../api/authenticatedFetch";

/**
 * Load allowed tokens from /api/tokens endpoint with client-side caching
 * Falls back to minimal token set if API fails
 */
export async function loadAllowedTokens(): Promise<AllowedToken[]> {
  try {
    // Try sessionStorage cache first (5 min TTL)
    const cached = loadCachedTokens();
    if (cached) {
      return cached;
    }

    // Fetch from API endpoint (server handles @pragma/core buildAllowedTokens)
    const response = await authenticatedFetch("/api/tokens");

    if (!response.ok) {
      throw new Error(`Token API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const tokens = data.tokens as AllowedToken[];

    // Validate API response
    if (!Array.isArray(tokens) || tokens.length === 0) {
      console.error("[tokens.ts] Invalid API response:", { tokens });
      throw new Error("API returned empty or invalid token list");
    }

    // Cache successful response in sessionStorage
    saveCachedTokens(tokens);

    return tokens;
  } catch (error) {
    console.error("[tokens.ts] Failed to load tokens:", error);

    // Return minimal fallback: MON, WMON, aprMON
    // This ensures chat can still function with basic tokens
    // Note: Full 51-token fallback is handled by API route
    return [
      {
        address: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        symbol: "MON",
        name: "Monad",
        decimals: 18,
        kind: "native",
        categories: ["native", "verified"],
      },
      {
        address: "0x3bd359c1119da7da1d913d1c4d2b7c461115433a" as `0x${string}`, // mainnet
        symbol: "WMON",
        name: "Wrapped Monad",
        decimals: 18,
        kind: "wrappedNative",
        categories: ["wrapped", "verified"],
      },
      {
        address: "0x0c65a0bc65a5d819235b71f554d210d3f80e0852" as `0x${string}`, // mainnet
        symbol: "aprMON",
        name: "aPriori Monad",
        decimals: 18,
        kind: "erc20",
        categories: ["verified", "lst"],
      },
    ];
  }
}
