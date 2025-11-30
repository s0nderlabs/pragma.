import { NextResponse } from "next/server";
import type { AllowedToken, TokenCache, TokenCacheEntry } from "@pragma/core/monorail/tokens";
import { buildAllowedTokens, normalizeAllowedTokensList, sortAllowedTokens } from "@pragma/core/monorail/tokens";
import { getAddress } from "viem";
import { authMiddleware } from "@/lib/auth/authMiddleware";

const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedEntry: TokenCacheEntry | undefined;
let cachedAt = 0;

const memoryCache: TokenCache = {
  async load() {
    if (!cachedEntry) return undefined;
    if (Date.now() - cachedAt > CACHE_TTL_MS) return undefined;
    return cachedEntry;
  },
  async save(entry) {
    cachedEntry = entry;
    cachedAt = Date.now();
  },
};

const nativeTokenAddress = (process.env.MONAD_NATIVE_TOKEN_ADDRESS ??
  process.env.NEXT_PUBLIC_MONAD_NATIVE_TOKEN_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

const nativeTokenSymbol =
  process.env.MONAD_NATIVE_TOKEN_SYMBOL ??
  process.env.NEXT_PUBLIC_MONAD_NATIVE_TOKEN_SYMBOL ??
  "MON";

const wrappedTokenAddress = (process.env.MONAD_WMON_ADDRESS ??
  process.env.NEXT_PUBLIC_MONAD_WMON_ADDRESS ??
  "0x3bd359c1119da7da1d913d1c4d2b7c461115433a") as `0x${string}`;

const wrappedTokenSymbol =
  process.env.MONAD_WRAPPED_TOKEN_SYMBOL ??
  process.env.NEXT_PUBLIC_MONAD_WRAPPED_TOKEN_SYMBOL ??
  "WMON";

/**
 * Mainnet Verified Tokens (19 tokens)
 * Source: Monorail API /tokens/category/verified
 */
const FALLBACK_TOKENS: AllowedToken[] = [
  // Native
  {
    address: getAddress(nativeTokenAddress),
    decimals: 18,
    symbol: nativeTokenSymbol,
    kind: "native",
    categories: ["official", "verified", "native"],
  },
  // Wrapped Native
  {
    address: getAddress(wrappedTokenAddress),
    decimals: 18,
    symbol: wrappedTokenSymbol,
    kind: "wrappedNative",
    categories: ["official", "verified", "wrapped"],
  },
  // Stablecoins
  {
    address: getAddress("0x754704bc059f8c67012fed69bc8a327a5aafb603"),
    decimals: 6,
    symbol: "USDC",
    kind: "erc20",
    categories: ["verified", "stable"],
  },
  {
    address: getAddress("0xe7cd86e13ac4309349f30b3435a9d337750fc82d"),
    decimals: 6,
    symbol: "USDT0",
    kind: "erc20",
    categories: ["verified", "stable"],
  },
  {
    address: getAddress("0x00000000efe302beaa2b3e6e1b18d08d69a9012a"),
    decimals: 6,
    symbol: "AUSD",
    kind: "erc20",
    categories: ["verified", "stable"],
  },
  // LST (Liquid Staking)
  {
    address: getAddress("0x0c65a0bc65a5d819235b71f554d210d3f80e0852"),
    decimals: 18,
    symbol: "aprMON",
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
  {
    address: getAddress("0x1b68626dca36c7fe922fd2d55e4f631d962de19c"),
    decimals: 18,
    symbol: "shMON",
    kind: "erc20",
    categories: ["verified", "lst"],
  },
  // Bridged
  {
    address: getAddress("0xee8c0e9f1bffb4eb878d8f15f368a02a35481242"),
    decimals: 18,
    symbol: "WETH",
    kind: "erc20",
    categories: ["verified", "bridged"],
  },
  {
    address: getAddress("0x0555e30da8f98308edb960aa94c0db47230d2b9c"),
    decimals: 8,
    symbol: "WBTC",
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
  // Synthetic
  {
    address: getAddress("0xe85411c030fb32a9d8b14bbbc6cb19417391f711"),
    decimals: 18,
    symbol: "suBTC",
    kind: "erc20",
    categories: ["verified", "synthetic"],
  },
  {
    address: getAddress("0x1c22531aa9747d76fff8f0a43b37954ca67d28e0"),
    decimals: 18,
    symbol: "suETH",
    kind: "erc20",
    categories: ["verified", "synthetic"],
  },
  // Meme (verified)
  {
    address: getAddress("0x350035555e10d9afaf1566aaebfced5ba6c27777"),
    decimals: 18,
    symbol: "CHOG",
    kind: "erc20",
    categories: ["verified", "meme"],
  },
  {
    address: getAddress("0xb5f73846a656232d5d251ab1048bca88d1507777"),
    decimals: 18,
    symbol: "MCA",
    kind: "erc20",
    categories: ["verified", "meme"],
  },
  {
    address: getAddress("0x3842751a46d23b41a47e702473dff316e6237777"),
    decimals: 18,
    symbol: "143",
    kind: "erc20",
    categories: ["verified", "meme"],
  },
  // Other
  {
    address: getAddress("0x788571e0e5067adea87e6ba22a2b738ffdf48888"),
    decimals: 18,
    symbol: "UNIT",
    kind: "erc20",
    categories: ["verified"],
  },
];

const TOKEN_METADATA = {
  nativeTokenAddress,
  wrappedNativeTokenAddress: wrappedTokenAddress,
};

export async function GET(request: Request) {
  // ✅ SECURITY: Authenticate request
  const authError = await authMiddleware(request);
  if (authError) return authError;

  // Support test-only query parameter to force fallback
  const { searchParams } = new URL(request.url);
  const forceFallback = searchParams.get("forceFallback") === "true";

  if (forceFallback && process.env.NODE_ENV !== "production") {
    const normalized = normalizeAllowedTokensList(FALLBACK_TOKENS);
    const sorted = sortAllowedTokens(normalized);
    return NextResponse.json({ tokens: sorted, error: "forced_fallback_for_testing" });
  }

  const dataApiUrl =
    process.env.MONORAIL_DATA_API_URL ??
    process.env.NEXT_PUBLIC_MONORAIL_DATA_API_URL ??
    "https://api.monorail.xyz/v2";

  try {
    const tokens = await buildAllowedTokens({
      dataApiUrl,
      cache: memoryCache,
      tokenMetadata: TOKEN_METADATA,
    });

    // Validate token completeness - fallback has 19 mainnet tokens, API should return at least that
    const MINIMUM_EXPECTED_TOKENS = 15;
    if (tokens.length < MINIMUM_EXPECTED_TOKENS) {
      console.warn(
        `[API] Incomplete token data: received ${tokens.length}, expected at least ${MINIMUM_EXPECTED_TOKENS}. Triggering fallback.`
      );
      throw new Error(`Incomplete token list: ${tokens.length} < ${MINIMUM_EXPECTED_TOKENS}`);
    }

    // Validate required token types are present
    const hasNative = tokens.some((t) => t.kind === "native");
    const hasWrapped = tokens.some((t) => t.kind === "wrappedNative");
    if (!hasNative || !hasWrapped) {
      console.warn("[API] Missing required token types (native or wrapped). Triggering fallback.");
      throw new Error("Missing required native or wrapped native tokens");
    }

    return NextResponse.json({ tokens });
  } catch (error) {
    console.error("Failed to load Monorail tokens", error);
    // Apply same normalization pipeline as success path
    const normalized = normalizeAllowedTokensList(FALLBACK_TOKENS);
    const sorted = sortAllowedTokens(normalized);
    return NextResponse.json({
      tokens: sorted,
      error: "monorail_fetch_failed",
    });
  }
}
