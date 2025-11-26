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
  "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701") as `0x${string}`;

const wrappedTokenSymbol =
  process.env.MONAD_WRAPPED_TOKEN_SYMBOL ??
  process.env.NEXT_PUBLIC_MONAD_WRAPPED_TOKEN_SYMBOL ??
  "WMON";

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
    address: getAddress(nativeTokenAddress),
    decimals: 18,
    symbol: nativeTokenSymbol,
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
    address: getAddress(wrappedTokenAddress),
    decimals: 18,
    symbol: wrappedTokenSymbol,
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
    "https://testnet-api.monorail.xyz/v1";

  try {
    const tokens = await buildAllowedTokens({
      dataApiUrl,
      cache: memoryCache,
      tokenMetadata: TOKEN_METADATA,
    });

    // Validate token completeness - fallback has 51 tokens, API should return at least that
    const MINIMUM_EXPECTED_TOKENS = 51;
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
