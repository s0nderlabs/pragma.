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

/**
 * Load allowed tokens from /api/tokens endpoint with client-side caching
 * Falls back to minimal token set if API fails
 */
export async function loadAllowedTokens(): Promise<AllowedToken[]> {
  try {
    console.log("[tokens.ts] 🔍 loadAllowedTokens() called");

    // Try sessionStorage cache first (5 min TTL)
    console.log("[tokens.ts] 📦 Checking sessionStorage cache...");
    const cached = loadCachedTokens();
    if (cached) {
      console.log("[tokens.ts] ✅ Using cached tokens:", {
        count: cached.length,
        sample: cached.slice(0, 5).map(t => t.symbol),
      });
      return cached;
    }
    console.log("[tokens.ts] ❌ No cache found, fetching from API");

    // Fetch from API endpoint (server handles @pragma/core buildAllowedTokens)
    console.log("[tokens.ts] 📡 Fetching from /api/tokens...");
    const response = await fetch("/api/tokens");
    console.log("[tokens.ts] 📥 API response:", {
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      throw new Error(`Token API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("[tokens.ts] 📦 API data received:", {
      hasTokens: !!data.tokens,
      tokenCount: data.tokens?.length || 0,
    });

    const tokens = data.tokens as AllowedToken[];

    // Validate API response
    if (!Array.isArray(tokens) || tokens.length === 0) {
      console.error("[tokens.ts] ❌ Invalid API response:", { tokens });
      throw new Error("API returned empty or invalid token list");
    }

    console.log("[tokens.ts] ✅ Valid tokens received:", {
      count: tokens.length,
      sample: tokens.slice(0, 10).map(t => t.symbol),
    });

    // Cache successful response in sessionStorage
    console.log("[tokens.ts] 💾 Caching tokens in sessionStorage...");
    saveCachedTokens(tokens);

    console.log(`[tokens.ts] ✅ Returning ${tokens.length} tokens`);
    return tokens;
  } catch (error) {
    console.error("[tokens.ts] ❌ Failed to load tokens:", error);

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
        address: "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701" as `0x${string}`,
        symbol: "WMON",
        name: "Wrapped Monad",
        decimals: 18,
        kind: "wrappedNative",
        categories: ["wrapped", "verified"],
      },
      {
        address: "0xb2f82D0f38dc453D596Ad40A37799446Cc89274A" as `0x${string}`,
        symbol: "aprMON",
        name: "aPriori Monad",
        decimals: 18,
        kind: "erc20",
        categories: ["verified", "lst"],
      },
    ];
  }
}
