import { Address, getAddress } from "viem";

import { createErrorFromCode } from "../errors/index.js";

export interface MonorailToken {
  address: Address;
  symbol?: string;
  name?: string;
  decimals: number;
  categories: string[];
}

export interface RawMonorailToken {
  address?: string;
  symbol?: string;
  name?: string;
  decimals?: string | number;
  categories?: string[];
}

export interface MonorailTokenClientConfig {
  dataApiUrl: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

export interface TokenAddressMetadata {
  nativeTokenAddress: Address;
  wrappedNativeTokenAddress?: Address;
}

export type TokenKind = "native" | "wrappedNative" | "erc20";

export interface AllowedToken {
  address: Address;
  symbol?: string;
  name?: string;
  decimals: number;
  kind?: TokenKind;
  categories?: string[];
}

export interface TokenCacheEntry {
  fetchedAt: number;
  tokens: RawMonorailToken[];
}

export interface TokenCache {
  load(): Promise<TokenCacheEntry | undefined>;
  save(entry: TokenCacheEntry): Promise<void>;
}

export interface LoadMonorailTokensOptions extends MonorailTokenClientConfig {
  cache?: TokenCache;
  memoryTtlMs?: number;
  persistentTtlMs?: number;
}

const DEFAULT_MEMORY_TTL_MS = 5 * 60 * 1000;
const DEFAULT_PERSISTENT_TTL_MS = 60 * 60 * 1000;

let memoryCache: TokenCacheEntry | undefined;

const buildHeaders = (apiKey?: string): Record<string, string> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
};

const getFetchFn = (config: MonorailTokenClientConfig): typeof fetch => config.fetch ?? fetch;

export const parseMonorailToken = (raw: RawMonorailToken): MonorailToken | undefined => {
  if (!raw.address) return undefined;
  try {
    const address = getAddress(raw.address as Address);
    const decimalsValue =
      typeof raw.decimals === "string" ? Number(raw.decimals) : Number.isFinite(raw.decimals) ? Number(raw.decimals) : 18;
    const decimals = Number.isFinite(decimalsValue) ? decimalsValue : 18;
    const symbol = raw.symbol?.trim() || undefined;
    const name = raw.name?.trim() || undefined;
    const categories = Array.isArray(raw.categories) ? raw.categories : [];

    return {
      address,
      decimals,
      symbol,
      name,
      categories,
    };
  } catch {
    return undefined;
  }
};

export const fetchMonorailTokensFromPath = async (
  path: string,
  config: MonorailTokenClientConfig,
): Promise<MonorailToken[]> => {
  const url = `${config.dataApiUrl}${path}`;
  const response = await getFetchFn(config)(url, { headers: buildHeaders(config.apiKey) });
  if (!response.ok) {
    throw createErrorFromCode("RPC_UNAVAILABLE", {
      message: `Monorail data API request failed (${response.status} ${response.statusText})`,
      context: { provider: "MonorailData", path },
    });
  }
  const payload = (await response.json()) as RawMonorailToken[];
  const tokens: MonorailToken[] = [];
  for (const entry of payload) {
    const token = parseMonorailToken(entry);
    if (token) tokens.push(token);
  }
  return tokens;
};

const mergeTokenLists = (lists: MonorailToken[][]): MonorailToken[] => {
  const map = new Map<string, MonorailToken>();
  for (const list of lists) {
    for (const token of list) {
      const key = token.address.toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, token);
        continue;
      }
      const categories = new Set([...(existing.categories ?? []), ...(token.categories ?? [])]);
      map.set(key, {
        address: existing.address,
        decimals: Number.isFinite(token.decimals) ? token.decimals : existing.decimals,
        name: token.name || existing.name,
        symbol: token.symbol || existing.symbol,
        categories: Array.from(categories),
      });
    }
  }
  return Array.from(map.values());
};

export const loadMonorailTokens = async (
  options: LoadMonorailTokensOptions,
): Promise<MonorailToken[]> => {
  const now = Date.now();
  const memoryTtl = options.memoryTtlMs ?? DEFAULT_MEMORY_TTL_MS;
  if (memoryCache && now - memoryCache.fetchedAt < memoryTtl) {
    const tokens = memoryCache.tokens.map(parseMonorailToken).filter((token): token is MonorailToken => Boolean(token));
    if (tokens.length > 0) return tokens;
  }

  const persistentTtl = options.persistentTtlMs ?? DEFAULT_PERSISTENT_TTL_MS;
  if (options.cache) {
    const cached = await options.cache.load();
    if (cached && now - cached.fetchedAt < persistentTtl) {
      memoryCache = cached;
      const tokens = cached.tokens
        .map(parseMonorailToken)
        .filter((token): token is MonorailToken => Boolean(token));
      if (tokens.length > 0) return tokens;
    }
  }

  const [allTokens, verifiedTokens] = await Promise.all([
    fetchMonorailTokensFromPath("/tokens", options),
    fetchMonorailTokensFromPath("/tokens/category/verified", options),
  ]);

  const merged = mergeTokenLists([allTokens, verifiedTokens]);

  const entry: TokenCacheEntry = {
    fetchedAt: now,
    tokens: merged.map((token) => ({
      address: token.address,
      decimals: token.decimals,
      name: token.name,
      symbol: token.symbol,
      categories: token.categories,
    })),
  };

  memoryCache = entry;
  if (options.cache) {
    await options.cache.save(entry);
  }

  return merged;
};

export const classifyToken = (
  token: MonorailToken,
  metadata: TokenAddressMetadata,
): AllowedToken => {
  const nativeAddress = metadata.nativeTokenAddress.toLowerCase();
  const wrappedAddress = metadata.wrappedNativeTokenAddress?.toLowerCase();
  const address = getAddress(token.address);
  let kind: TokenKind = "erc20";
  if (address.toLowerCase() === nativeAddress) {
    kind = "native";
  } else if (wrappedAddress && address.toLowerCase() === wrappedAddress) {
    kind = "wrappedNative";
  }

  return {
    address,
    decimals: token.decimals,
    symbol: token.symbol,
    name: token.name,
    kind,
    categories: token.categories,
  };
};

export const normalizeAllowedTokensList = (tokens: AllowedToken[] = []): AllowedToken[] => {
  const normalized: AllowedToken[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    try {
      const address = getAddress(token.address);
      const key = address.toLowerCase();
      if (seen.has(key)) continue;
      normalized.push({
        address,
        symbol: token.symbol,
        name: token.name,
        decimals:
          typeof token.decimals === "number" && Number.isFinite(token.decimals)
            ? token.decimals
            : Number(token.decimals ?? 18),
        kind: token.kind,
        categories: token.categories ? [...token.categories] : undefined,
      });
      seen.add(key);
    } catch {
      // ignore malformed entries
    }
  }

  return normalized;
};

export const ensureTokenSet = (tokens: AllowedToken[], token: AllowedToken) => {
  if (tokens.some((existing) => existing.address.toLowerCase() === token.address.toLowerCase())) {
    return;
  }
  tokens.push(token);
};

export const hasWrappedNativeToken = (tokens: AllowedToken[], metadata?: TokenAddressMetadata): boolean => {
  const wrapped = metadata?.wrappedNativeTokenAddress?.toLowerCase();
  return tokens.some((token) => {
    if (token.kind === "wrappedNative") return true;
    if (!wrapped) return false;
    return token.address.toLowerCase() === wrapped;
  });
};

export const resolveTokenFromAllowlist = (
  input: string,
  allowlist: AllowedToken[],
): AllowedToken | undefined => {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  return (
    allowlist.find((token) => token.symbol?.toLowerCase() === lower) ??
    (trimmed.startsWith("0x")
      ? allowlist.find((token) => token.address.toLowerCase() === lower)
      : undefined)
  );
};

export const formatTokenLabel = (token: AllowedToken): string => {
  const symbol = token.symbol ?? token.address.slice(0, 6);
  const suffix = token.categories && token.categories.length > 0 ? ` - ${token.categories.slice(0, 3).join(",")}` : "";
  return `${symbol} (${token.address.slice(0, 6)}…${token.address.slice(-4)})${suffix}`;
};

export const sortAllowedTokens = (tokens: AllowedToken[]): AllowedToken[] =>
  [...tokens].sort((left, right) => {
    const lhs = (left.symbol ?? left.address).toUpperCase();
    const rhs = (right.symbol ?? right.address).toUpperCase();
    return lhs.localeCompare(rhs);
  });

export const findTokenBySymbol = async (
  symbol: string,
  options: LoadMonorailTokensOptions & { tokenMetadata: TokenAddressMetadata },
): Promise<AllowedToken | undefined> => {
  const normalized = symbol.trim().toLowerCase();
  if (!normalized) return undefined;
  const tokens = await loadMonorailTokens(options);
  const token = tokens.find((entry) => entry.symbol?.toLowerCase() === normalized);
  return token ? classifyToken(token, options.tokenMetadata) : undefined;
};

export const buildAllowedTokens = async (
  options: LoadMonorailTokensOptions & { tokenMetadata: TokenAddressMetadata },
): Promise<AllowedToken[]> => {
  const tokens = await loadMonorailTokens(options);
  const allowed = normalizeAllowedTokensList(
    tokens.map((token) => classifyToken(token, options.tokenMetadata)),
  );
  return sortAllowedTokens(allowed);
};
