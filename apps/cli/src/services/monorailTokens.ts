import { getAddress } from "viem";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

import {
  MONORAIL_DATA_API_URL,
  MONORAIL_API_KEY,
} from "./config.js";
import { MONAD_NATIVE_TOKEN_ADDRESS, MONAD_WMON_ADDRESS } from "./config.js";

export interface MonorailToken {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  categories: string[];
}

interface RawToken {
  address?: string;
  symbol?: string;
  name?: string;
  decimals?: string | number;
  categories?: string[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const DISK_CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_DIR = path.join(os.homedir(), ".pragma", "cache");
const CACHE_PATH = path.join(CACHE_DIR, "monorail_tokens.json");
let cachedTokens: { fetchedAt: number; tokens: MonorailToken[] } | undefined;

const buildHeaders = () => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (MONORAIL_API_KEY) {
    headers["x-api-key"] = MONORAIL_API_KEY;
  }
  return headers;
};

const parseToken = (raw: RawToken): MonorailToken | undefined => {
  if (!raw.address) return undefined;
  const address = getAddress(raw.address as `0x${string}`);
  const decimalsValue = typeof raw.decimals === "string" ? Number(raw.decimals) : raw.decimals;
  const decimals = Number.isFinite(decimalsValue) ? Number(decimalsValue) : 18;
  const symbol = (raw.symbol ?? "").trim();
  const name = (raw.name ?? "").trim();
  const categories = Array.isArray(raw.categories) ? raw.categories : [];

  return {
    address,
    decimals,
    symbol,
    name,
    categories,
  };
};

const fetchTokens = async (path: string): Promise<MonorailToken[]> => {
  const url = `${MONORAIL_DATA_API_URL}${path}`;
  const response = await fetch(url, { headers: buildHeaders() });
  if (!response.ok) {
    throw new Error(`Monorail data API request failed (${response.status} ${response.statusText})`);
  }
  const payload = (await response.json()) as RawToken[];
  const tokens: MonorailToken[] = [];
  for (const entry of payload) {
    const token = parseToken(entry);
    if (token) {
      tokens.push(token);
    }
  }
  return tokens;
};

const readDiskCache = async (): Promise<{ fetchedAt: number; tokens: MonorailToken[] } | undefined> => {
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as { fetchedAt: number; tokens: RawToken[] };
    if (!parsed?.tokens) return undefined;
    const tokens = parsed.tokens
      .map(parseToken)
      .filter((token): token is MonorailToken => Boolean(token));
    return { fetchedAt: parsed.fetchedAt ?? 0, tokens };
  } catch (error: any) {
    if (error?.code === "ENOENT") return undefined;
    return undefined;
  }
};

const writeDiskCache = async (tokens: MonorailToken[]) => {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const payload = JSON.stringify({ fetchedAt: Date.now(), tokens }, null, 2);
    await fs.writeFile(CACHE_PATH, payload, "utf8");
  } catch (error) {
    // cache failures are non-fatal; ignore
  }
};

export const loadMonorailTokens = async (): Promise<MonorailToken[]> => {
  const now = Date.now();
  if (cachedTokens && now - cachedTokens.fetchedAt < CACHE_TTL_MS) {
    return cachedTokens.tokens;
  }

  const diskCached = await readDiskCache();
  if (diskCached && now - diskCached.fetchedAt < DISK_CACHE_TTL_MS) {
    cachedTokens = diskCached;
    return diskCached.tokens;
  }

  let allTokens: MonorailToken[] = [];
  let verifiedTokens: MonorailToken[] = [];
  try {
    [allTokens, verifiedTokens] = await Promise.all([
      fetchTokens("/tokens"),
      fetchTokens("/tokens/category/verified"),
    ]);
  } catch (error) {
    if (diskCached) {
      cachedTokens = diskCached;
      return diskCached.tokens;
    }
    throw error;
  }

  const merged = new Map<string, MonorailToken>();
  for (const token of [...allTokens, ...verifiedTokens]) {
    const key = token.address.toLowerCase();
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, token);
      continue;
    }
    // Merge categories / metadata to keep richer info.
    const categories = new Set([...(existing.categories ?? []), ...(token.categories ?? [])]);
    merged.set(key, {
      address: existing.address,
      decimals: token.decimals ?? existing.decimals,
      name: token.name || existing.name,
      symbol: token.symbol || existing.symbol,
      categories: Array.from(categories),
    });
  }

  const tokens = Array.from(merged.values());
  cachedTokens = { fetchedAt: now, tokens };
  await writeDiskCache(tokens);
  return tokens;
};

export const findTokenBySymbol = async (symbol: string): Promise<MonorailToken | undefined> => {
  const normalized = symbol.trim().toLowerCase();
  if (!normalized) return undefined;
  const tokens = await loadMonorailTokens();
  return tokens.find((token) => token.symbol.toLowerCase() === normalized);
};

export type TokenKind = "native" | "wrappedNative" | "erc20";

export interface AllowedToken {
  address: `0x${string}`;
  symbol?: string;
  name?: string;
  decimals: number;
  kind?: TokenKind;
  categories?: string[];
}

const normalizeMonorailToken = (token: MonorailToken): AllowedToken | undefined => {
  try {
    const address = getAddress(token.address);
    const decimals = Number.isFinite(token.decimals) ? Number(token.decimals) : 18;
    const symbol = token.symbol?.trim() || undefined;
    const categories = Array.isArray(token.categories) ? token.categories : [];

    let kind: TokenKind | undefined;
    if (address.toLowerCase() === MONAD_NATIVE_TOKEN_ADDRESS.toLowerCase()) {
      kind = "native";
    } else if (address.toLowerCase() === MONAD_WMON_ADDRESS.toLowerCase()) {
      kind = "wrappedNative";
    } else {
      kind = "erc20";
    }

    return {
      address,
      symbol,
      name: token.name,
      decimals,
      kind,
      categories,
    };
  } catch {
    return undefined;
  }
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
    } catch {}
  }

  return normalized;
};

export const ensureTokenSet = (tokens: AllowedToken[], token: AllowedToken) => {
  if (tokens.some((existing) => existing.address.toLowerCase() === token.address.toLowerCase())) {
    return;
  }
  tokens.push(token);
};

export const hasWrappedNativeToken = (tokens: AllowedToken[]): boolean =>
  tokens.some(
    (token) =>
      token.kind === "wrappedNative" || token.address.toLowerCase() === MONAD_WMON_ADDRESS.toLowerCase(),
  );

export const loadAllowedTokens = async (): Promise<AllowedToken[]> => {
  const tokens = await loadMonorailTokens();
  const normalized = normalizeAllowedTokensList(
    tokens
      .map(normalizeMonorailToken)
      .filter((token): token is AllowedToken => Boolean(token)),
  );
  normalized.sort((a, b) => {
    const left = (a.symbol ?? a.address).toUpperCase();
    const right = (b.symbol ?? b.address).toUpperCase();
    return left.localeCompare(right);
  });
  return normalized;
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
  const suffix = token.categories && token.categories.length > 0
    ? ` — ${token.categories.slice(0, 3).join(",")}`
    : "";
  return `${symbol} (${token.address.slice(0, 6)}…${token.address.slice(-4)})${suffix}`;
};
