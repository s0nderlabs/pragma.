/**
 * Token Logo Service
 *
 * Provides token logos from multiple sources:
 * 1. Dynamic: Fetched from Monorail API (verified tokens list)
 * 2. Static: Hardcoded fallback map for tokens without API logos
 *
 * Usage:
 * - Call `getTokenLogo(address)` to get a logo URL
 * - Call `initTokenLogos()` on app load to prime the cache
 *
 * Last updated: 2025-11-30
 */

import type { AllowedToken } from "@pragma/core/monorail/tokens";

// ============================================================================
// Dynamic Logo Cache
// ============================================================================

let dynamicLogoMap: Map<string, string> | null = null;
let logoFetchPromise: Promise<void> | null = null;

/**
 * Build logo map from token list
 */
const buildLogoMap = (tokens: AllowedToken[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const token of tokens) {
    if (token.logoURI) {
      map.set(token.address.toLowerCase(), token.logoURI);
    }
  }
  return map;
};

/**
 * Initialize dynamic logo cache from Monorail API
 * Call this on app load to ensure logos are available
 */
export const initTokenLogos = async (): Promise<void> => {
  // Already initialized
  if (dynamicLogoMap) return;

  // Already fetching
  if (logoFetchPromise) return logoFetchPromise;

  logoFetchPromise = (async () => {
    try {
      // Import dynamically to avoid circular dependencies
      const { fetchAllowlistCached } = await import("./onboarding/token-cache");
      const tokens = await fetchAllowlistCached();
      dynamicLogoMap = buildLogoMap(tokens);
      console.log(`[TokenLogos] Initialized ${dynamicLogoMap.size} logos from API`);
    } catch (error) {
      console.warn("[TokenLogos] Failed to fetch dynamic logos, using static fallback:", error);
      dynamicLogoMap = new Map(); // Empty map, will fallback to static
    } finally {
      logoFetchPromise = null;
    }
  })();

  return logoFetchPromise;
};

/**
 * Update logo cache with new tokens
 * Called when new token data is fetched
 */
export const updateTokenLogos = (tokens: AllowedToken[]): void => {
  if (!dynamicLogoMap) {
    dynamicLogoMap = new Map();
  }
  for (const token of tokens) {
    if (token.logoURI) {
      dynamicLogoMap.set(token.address.toLowerCase(), token.logoURI);
    }
  }
};

/**
 * Get token logo URL
 * Checks dynamic cache first, falls back to static map
 */
export const getTokenLogo = (address: string): string | undefined => {
  const normalized = address.toLowerCase();

  // Try dynamic cache first (from API)
  if (dynamicLogoMap?.has(normalized)) {
    return dynamicLogoMap.get(normalized);
  }

  // Fallback to static map
  return STATIC_TOKEN_LOGO_MAP[normalized];
};

/**
 * Get all logos as a map (for components that need bulk access)
 * Merges dynamic and static maps
 */
export const getAllTokenLogos = (): Record<string, string> => {
  const merged = { ...STATIC_TOKEN_LOGO_MAP };

  if (dynamicLogoMap) {
    for (const [address, logo] of dynamicLogoMap) {
      merged[address] = logo;
    }
  }

  return merged;
};

// ============================================================================
// Static Fallback Map
// ============================================================================

/**
 * Static fallback for tokens without API logos
 * Only used when dynamic fetch fails or for non-verified tokens
 */
export const STATIC_TOKEN_LOGO_MAP: Record<string, string> = {
  // Native MON
  "0x0000000000000000000000000000000000000000": "https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/MON.png/public",
  // WMON (Wrapped MON - mainnet)
  "0x3bd359c1119da7da1d913d1c4d2b7c461115433a": "https://monorail-static.fra1.digitaloceanspaces.com/tokens/wmon.svg",
  // aprMON (aPriori LST - mainnet)
  "0x0c65a0bc65a5d819235b71f554d210d3f80e0852": "https://monorail-static.fra1.digitaloceanspaces.com/tokens/aprmon.svg",
  // AUSD (Agora stablecoin)
  "0x00000000efe302beaa2b3e6e1b18d08d69a9012a": "https://monorail-static.fra1.digitaloceanspaces.com/tokens/ausd.svg",
  // USDC (mainnet)
  "0x754704bc059f8c67012fed69bc8a327a5aafb603": "https://monorail-static.fra1.digitaloceanspaces.com/tokens/usdc.svg",
  // USDT0 (mainnet)
  "0xe7cd86e13ac4309349f30b3435a9d337750fc82d": "https://monorail-static.fra1.digitaloceanspaces.com/tokens/usdt.svg",
  // shMON (Shmonad LST - mainnet)
  "0x1b68626dca36c7fe922fd2d55e4f631d962de19c": "https://monorail-static.fra1.digitaloceanspaces.com/tokens/shmon.svg",
  // gMON (Magma LST - mainnet)
  "0x8498312a6b3cbd158bf0c93abdcf29e6e4f55081": "https://monorail-static.fra1.digitaloceanspaces.com/tokens/gmon.svg",
  // sMON (Kintsu LST - mainnet)
  "0xa3227c5969757783154c60bf0bc1944180ed81b9": "https://monorail-static.fra1.digitaloceanspaces.com/tokens/smon.svg",
  // WBTC (mainnet)
  "0x0555e30da8f98308edb960aa94c0db47230d2b9c": "https://monorail-static.fra1.digitaloceanspaces.com/tokens/wbtc.svg",
  // WETH (mainnet)
  "0xee8c0e9f1bffb4eb878d8f15f368a02a35481242": "https://monorail-static.fra1.digitaloceanspaces.com/tokens/weth.svg",
  // wstETH (mainnet)
  "0x10aeaf63194db8d453d4d85a06e5efe1dd0b5417": "https://monorail-static.fra1.digitaloceanspaces.com/tokens/wsteth.svg",
  // SOL (mainnet)
  "0xea17e5a9efebf1477db45082d67010e2245217f1": "https://monorail-static.fra1.digitaloceanspaces.com/tokens/sol.svg",
  // suBTC (Sumer synthetic - mainnet)
  "0xe85411c030fb32a9d8b14bbbc6cb19417391f711": "https://monorail-static.fra1.digitaloceanspaces.com/tokens/subtc.svg",
  // suETH (Sumer synthetic - mainnet)
  "0x1c22531aa9747d76fff8f0a43b37954ca67d28e0": "https://monorail-static.fra1.digitaloceanspaces.com/tokens/sueth.svg",
  // 143 (meme - mainnet)
  "0x3842751a46d23b41a47e702473dff316e6237777": "https://storage.nadapp.net/coin/143.png",
  // MCA (meme - mainnet)
  "0xb5f73846a656232d5d251ab1048bca88d1507777": "https://storage.nadapp.net/coin/mca.png",
  // UNIT (mainnet)
  "0x788571e0e5067adea87e6ba22a2b738ffdf48888": "https://monorail-static.fra1.digitaloceanspaces.com/tokens/unit.svg",
  "0x9569ad4b353d4811064ad9970b198fcb914428d5": "https://storage.nadapp.net/coin/7bac3557-8528-4cbb-9c58-e91d098d28ad",
  "0x0c0c92fcf37ae2cbcc512e59714cd3a1a1cbc411": "https://app.purps.xyz/_next/image?url=%2Flogo.png&w=3840&q=75",
  "0xd875ba8e2cad3c0f7e2973277c360c8d2f92b510": "https://raw.githubusercontent.com/Stable-Finance/branding/refs/heads/main/token_icons/resized_icons/256x256_stable_coin_icon_gold.png",
  "0x4a5c952c446d5c4bba9f4517b473ec1718c5f27a": "https://rose-bright-gamefowl-175.mypinata.cloud/ipfs/bafybeidnvrolemmha2h3kcih5d7qzlxrlwgpi2uit4ibkmhl5vvrndvqoq",
  "0x6ce1890eeadae7db01026f4b294cb8ec5ecc6563": "https://media.licdn.com/dms/image/v2/D560BAQHhpa-Y1Zd-fA/company-logo_200_200/company-logo_200_200/0/1738872326676/halliday_logo?e=2147483647&v=beta&t=GV-LvBS8M_9cxzvA_gA04DNEhPR89yHo9P-aRRdAoTQ",
  "0x3552f8254263ea8880c7f7e25cb8dbbd79c0c4b1": "https://pbs.twimg.com/profile_images/1892096879053373440/KK9jy5kt_400x400.jpg",
  "0x8a056df4d7f23121a90aca1ca1364063d43ff3b8": "https://images.emojiterra.com/google/noto-emoji/unicode-16.0/color/svg/1f511.svg",
  "0xb38bb873cca844b20a9ee448a87af3626a6e1ef5": "https://gateway.pinata.cloud/ipfs/bafkreifufupf3h5wk7cg3o443x4l6e32fd3rlv3qudr7f2azdpmc7w7azu",
  "0x24d2fd6c5b29eebd5169cc7d6e8014cd65decd73": "https://ipfs.io/ipfs/QmVvffseaJeA3LjB5Q1WiTwGbUWY78TrZu1eYoL8h9hJsM",
  "0xc8527e96c3cb9522f6e35e95c0a28feab8144f15": "https://i.ibb.co/hxHk3xKg/madness.png",
  "0x0efed4d9fb7863ccc7bb392847c08dcd00fe9be2": "https://alpha.clober.io/asset-icon/mubond.svg",
  "0xca9a4f46faf5628466583486fd5ace8ac33ce126": "https://test.octo.exchange/assets/img/platforms/octoswap.png",
  "0x92eac40c98b383ea0f0efda747bdac7ac891d300": "https://avatars.githubusercontent.com/u/92540442?s=200&v=4",
  "0x43e52cbc0073caa7c0cf6e64b576ce2d6fb14eb8": "https://testnet.danom.site/img/NOMlogo400.webp",
  "0x44369aafdd04cd9609a57ec0237884f45dd80818": "https://media.licdn.com/dms/image/v2/D4D0BAQH3pyRQfM2AuQ/company-logo_200_200/company-logo_200_200/0/1730914900025?e=2147483647&v=beta&t=OqD8IPheS0HjY7tCvWhOQPKxikkDuog8f1G9hy-1Svk",
  "0x4aa50e8208095d9594d18e8e3008abb811125dce": "https://raw.githubusercontent.com/ZkSwapFinance/brand-kit/refs/heads/main/Moon.png",
  "0xc85548e0191cd34be8092b0d42eb4e45eba0d581": "https://s2.coinmarketcap.com/static/img/coins/200x200/22743.png",
  "0x268e4e24e0051ec27b3d27a95977e71ce6875a05": "https://w3-images.s3.ap-southeast-1.amazonaws.com/bean_logo.jpg",
  // CHOG (correct mainnet address)
  "0x350035555e10d9afaf1566aaebfced5ba6c27777": "https://storage.nadapp.net/coin/e0489adc-c3a1-425c-9219-f1e344aa866a",
  "0xceb564775415b524640d9f688278490a7f3ef9cd": "https://glacierfi.com/images/currencies/icemon.png",
  "0xfe140e1dce99be9f4f15d657cd9b7bf622270c50": "https://imagedelivery.net/tWwhAahBw7afBzFUrX5mYQ/6679b698-a845-412b-504b-23463a3e1900/public",
  "0xa2426cd97583939e79cfc12ac6e9121e37d0904d": "https://pingu.exchange/external/token-512.png",
  "0x0f0bdebf0f83cd1ee3974779bcb7315f9808c714": "https://imagedelivery.net/tWwhAahBw7afBzFUrX5mYQ/27759359-9374-4995-341c-b2636a432800/public",
  "0x3b428df09c3508d884c30266ac1577f099313cf6": "https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/mamaBTC.png/public",
  "0xcc5b42f9d6144dfdfb6fb3987a2a916af902f5f8": "https://javis-agent.s3.ap-southeast-1.amazonaws.com/uploads/avatars/Javis-logo.png",
  "0x04a9d9d4aea93f512a4c7b71993915004325ed38": "https://www.hedgemony.xyz/token_icon.png",
  "0x93e9cae50424c7a4e3c5eceb7855b6dab74bc803": "https://ivory-tragic-gamefowl-54.mypinata.cloud/ipfs/bafkreif6cu3gear2zktqg7bjizlgbdx5yn47aoiaj6pplieyss55vhks4m",
  "0x4961c832469fcbb468c0a794de32faaa30ccd2f6": "https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/suBTC.png/public",
  "0xcf5a6076cfa32686c0df13abada2b40dec133f1d": "https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/wbtc.png/public",
  "0x6200db750d4a6a2ed84181dbddc5e0029c238cba": "https://i.ibb.co/MKZMYJN/photo-2025-07-18-07-01-05.jpg",
  "0x2eb6709ec63421b056522aae424e94d060d13fa2": "https://i.ibb.co/1YxVG2rn/swMON.png",
  "0x3247b7d8100556ce6fc1a4141c117104ef806850": "https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/suETH.png/public",
  "0x786f4aa162457ecdf8fa4657759fa3e86c9394ff": "https://i.ibb.co/hxHk3xKg/madness.png",
  "0x5387c85a4965769f6b0df430638a1388493486f1": "https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/sol.png/public",
  "0x199c0da6f291a897302300aaae4f20d139162916": "https://alpha.caddy.finance/assets/caddyIcon-CjmClsUW.png",
  "0xbdd352f339e27e07089039ba80029f9135f6146f": "https://raw.githubusercontent.com/ZkSwapFinance/brand-kit/refs/heads/main/USD%20Moon.png",
  "0xf817257fed379853cde0fa4f97ab987181b1e5ea": "https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/usdc.png/public",
  "0x88b8e2161dedc77ef4ab7585569d2415a1c1055d": "https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/images.png/public",
  "0xb5a30b0fdc5ea94a52fdc42e3e9760cb8449fb37": "https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/weth.jpg/public",
  "0x8f3a8ae1f1859636e82ca4e30db9fb129b02d825": "https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/suUSD.png/public",
  "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701": "https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/I_t8rg_V_400x400.jpg/public",
  "0xb2f82d0f38dc453d596ad40a37799446cc89274a": "https://pbs.twimg.com/profile_images/1821177411796410369/GtzmUXok_400x400.jpg",
  "0x3a98250f98dd388c211206983453837c8365bdc1": "https://alpha.clober.io/_next/image?url=%2Fasset-icon%2FshMON.png&w=64&q=75",
  "0xe1d2439b75fb9746e7bc6cb777ae10aa7f7ef9c5": "https://kintsu-logos.s3.us-east-1.amazonaws.com/sMON.svg",
  "0xaeef2f6b429cb59c9b2d7bb2141ada993e8571c3": "https://www.magmastaking.xyz/gMON.png",
  "0x8a86d48c867b76ff74a36d3af4d2f1e707b143ed": "https://pbs.twimg.com/profile_images/1802788848956506112/KJnlcaQj_400x400.jpg",
};

// Legacy export for backwards compatibility
export const TOKEN_LOGO_MAP = STATIC_TOKEN_LOGO_MAP;
