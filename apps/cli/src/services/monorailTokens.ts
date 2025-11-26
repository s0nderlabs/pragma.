import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getAddress } from "viem";

import {
  type AllowedToken,
  type TokenKind,
  type TokenCache,
  type TokenCacheEntry,
  type TokenAddressMetadata,
  buildAllowedTokens,
  ensureTokenSet,
  findTokenBySymbol as findTokenBySymbolCore,
  formatTokenLabel,
  hasWrappedNativeToken,
  normalizeAllowedTokensList,
  resolveTokenFromAllowlist,
} from "@pragma/core";

import {
  MONORAIL_APP_ID,
  MONORAIL_DATA_API_URL,
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONAD_WMON_ADDRESS,
  APRIORI_ADDRESS,
} from "./config.js";

const CACHE_DIR = path.join(os.homedir(), ".pragma", "cache");
const CACHE_PATH = path.join(CACHE_DIR, "monorail_tokens.json");
const CACHE_MEMORY_TTL_MS = 5 * 60 * 1000;
const CACHE_PERSISTENT_TTL_MS = 60 * 60 * 1000;

class FileTokenCache implements TokenCache {
  async load(): Promise<TokenCacheEntry | undefined> {
    try {
      const raw = await fs.readFile(CACHE_PATH, "utf8");
      return JSON.parse(raw) as TokenCacheEntry;
    } catch (error: any) {
      if (error?.code === "ENOENT") return undefined;
      return undefined;
    }
  }

  async save(entry: TokenCacheEntry): Promise<void> {
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(CACHE_PATH, JSON.stringify(entry, null, 2), "utf8");
    } catch {
      // Ignore disk cache failures; they are best-effort.
    }
  }
}

const tokenMetadata: TokenAddressMetadata = {
  nativeTokenAddress: getAddress(MONAD_NATIVE_TOKEN_ADDRESS),
  wrappedNativeTokenAddress: getAddress(MONAD_WMON_ADDRESS),
};

const cache = new FileTokenCache();

export const loadAllowedTokens = async (): Promise<AllowedToken[]> => {
  const allowlist = await buildAllowedTokens({
    dataApiUrl: MONORAIL_DATA_API_URL,
    cache,
    memoryTtlMs: CACHE_MEMORY_TTL_MS,
    persistentTtlMs: CACHE_PERSISTENT_TTL_MS,
    tokenMetadata,
  });

  // Manually add aprMON (aPriori liquid staking token)
  // Ensures it's always available even if not in Monorail API yet
  ensureTokenSet(allowlist, {
    address: getAddress(APRIORI_ADDRESS),
    symbol: "aprMON",
    name: "aPriori Monad",
    decimals: 18,
    kind: "erc20",
    categories: ["verified", "lst"],
  });

  return allowlist;
};

export const findTokenBySymbol = async (symbol: string) =>
  findTokenBySymbolCore(symbol, {
    dataApiUrl: MONORAIL_DATA_API_URL,
    cache,
    memoryTtlMs: CACHE_MEMORY_TTL_MS,
    persistentTtlMs: CACHE_PERSISTENT_TTL_MS,
    tokenMetadata,
  });

export const ensureTokenSetFromString = async (tokens: AllowedToken[], input: string) => {
  const token = await resolveTokenFromAllowlist(input, tokens);
  if (token) ensureTokenSet(tokens, token);
};

export {
  type AllowedToken,
  type TokenKind,
  ensureTokenSet,
  formatTokenLabel,
  hasWrappedNativeToken,
  normalizeAllowedTokensList,
  resolveTokenFromAllowlist,
};

export const buildSafeModeBanner = () =>
  MONORAIL_APP_ID
    ? undefined
    : "Monorail app id is not configured; quote execution may be limited.";
