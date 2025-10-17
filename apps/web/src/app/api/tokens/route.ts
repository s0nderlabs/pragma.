import { NextResponse } from "next/server";
import type { AllowedToken, TokenCache, TokenCacheEntry } from "@pragma/core/monorail/tokens";
import { buildAllowedTokens } from "@pragma/core/monorail/tokens";
import { getAddress } from "viem";

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
  "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701") as `0x${string}`;

const wrappedTokenSymbol =
  process.env.MONAD_WRAPPED_TOKEN_SYMBOL ??
  process.env.NEXT_PUBLIC_MONAD_WRAPPED_TOKEN_SYMBOL ??
  "WMON";

const FALLBACK_TOKENS: AllowedToken[] = [
  {
    address: getAddress(nativeTokenAddress),
    decimals: 18,
    symbol: nativeTokenSymbol,
    kind: "native",
    categories: ["fallback"],
  },
  {
    address: getAddress(wrappedTokenAddress),
    decimals: 18,
    symbol: wrappedTokenSymbol,
    kind: "wrappedNative",
    categories: ["fallback"],
  },
];

const TOKEN_METADATA = {
  nativeTokenAddress,
  wrappedNativeTokenAddress: wrappedTokenAddress,
};

export async function GET() {
  const dataApiUrl =
    process.env.MONORAIL_DATA_API_URL ??
    process.env.NEXT_PUBLIC_MONORAIL_DATA_API_URL ??
    "https://testnet-api.monorail.xyz/v1";
  const apiKey =
    process.env.MONORAIL_API_KEY ??
    process.env.NEXT_PUBLIC_MONORAIL_API_KEY ??
    process.env.ENVIO_TOKEN_API ??
    process.env.NEXT_PUBLIC_ENVIO_TOKEN_API ??
    process.env.MONORAIL_APP_ID ??
    process.env.NEXT_PUBLIC_MONORAIL_APP_ID;

  if (!apiKey) {
    return NextResponse.json({ tokens: FALLBACK_TOKENS });
  }

  try {
    const tokens = await buildAllowedTokens({
      dataApiUrl,
      apiKey,
      cache: memoryCache,
      tokenMetadata: TOKEN_METADATA,
    });
    return NextResponse.json({ tokens });
  } catch (error) {
    console.error("Failed to load Monorail tokens", error);
    return NextResponse.json({
      tokens: FALLBACK_TOKENS,
      error: "monorail_fetch_failed",
    });
  }
}
