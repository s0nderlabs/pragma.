import { Address, getAddress } from "viem";

import { createErrorFromCode } from "../errors/index.js";

export interface MonorailToken {
  address: Address;
  symbol?: string;
  name?: string;
  decimals: number;
  categories: string[];
  logoURI?: string;
}

export interface RawMonorailToken {
  address?: string;
  symbol?: string;
  name?: string;
  decimals?: string | number;
  categories?: string[];
  logoURI?: string;
  logoUrl?: string;
  logo_uri?: string;
  image_uri?: string;  // Monorail v2 API field name
}

export interface MonorailTokenClientConfig {
  dataApiUrl: string;
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
  logoURI?: string;
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

const HEADERS: Record<string, string> = { "content-type": "application/json" };

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
    const logoURI = raw.logoURI ?? raw.logoUrl ?? raw.logo_uri ?? raw.image_uri ?? undefined;

    return {
      address,
      decimals,
      symbol,
      name,
      categories,
      logoURI: logoURI?.trim() || undefined,
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
  const response = await getFetchFn(config)(url, { headers: HEADERS });
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
        logoURI: token.logoURI || existing.logoURI,
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

  // v2 Migration: /tokens now requires ?find= param, only use /tokens/category/verified
  const verifiedTokens = await fetchMonorailTokensFromPath("/tokens/category/verified", options);

  const merged = mergeTokenLists([verifiedTokens]);

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
    logoURI: token.logoURI,
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
        logoURI: token.logoURI,
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

export const fetchSingleTokenFromMonorail = async (
  address: Address,
  options: Pick<LoadMonorailTokensOptions, 'dataApiUrl' | 'fetch'>
): Promise<AllowedToken | undefined> => {
  const url = `${options.dataApiUrl}/token/${address}`;

  try {
    const response = await getFetchFn(options)(url, {
      headers: HEADERS,
    });

    if (!response.ok) {
      if (response.status === 404) return undefined;
      throw createErrorFromCode("RPC_UNAVAILABLE", {
        message: `Token not found in Monorail: ${response.status}`,
        context: { provider: "MonorailData", address },
      });
    }

    const raw = (await response.json()) as RawMonorailToken;
    const parsed = parseMonorailToken(raw);

    if (!parsed) return undefined;

    return {
      address: parsed.address,
      symbol: parsed.symbol || address.slice(0, 8),
      name: parsed.name,
      decimals: parsed.decimals,
      categories: parsed.categories || [],
      logoURI: parsed.logoURI,
      kind: "erc20",
    };
  } catch (error) {
    console.warn(`[Monorail] Token lookup failed for ${address}:`, error);
    return undefined;
  }
};

export const resolveTokenFromAllowlist = async (
  input: string,
  allowlist: AllowedToken[],
  monorailOptions?: Pick<LoadMonorailTokensOptions, 'dataApiUrl' | 'fetch'>
): Promise<AllowedToken | undefined> => {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();

  // 1. Check allowlist (fast path)
  let token = allowlist.find((token) => token.symbol?.toLowerCase() === lower);
  if (!token && trimmed.startsWith("0x")) {
    token = allowlist.find((token) => token.address.toLowerCase() === lower);
  }

  if (token) return token;

  // 2. Fallback: Fetch from Monorail if address provided
  if (trimmed.startsWith("0x") && monorailOptions) {
    try {
      const address = getAddress(trimmed as Address);
      return await fetchSingleTokenFromMonorail(address, monorailOptions);
    } catch {
      return undefined;
    }
  }

  return undefined;
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
