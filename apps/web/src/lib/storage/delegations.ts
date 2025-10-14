"use client";

import { nanoid } from "nanoid/non-secure";
import { getAddress, type Address } from "viem";
import type { DelegationArtifact } from "@pragma/core/delegations/types";

type StoredDelegation = {
  id: string;
  delegator: string;
  createdAt: number;
  updatedAt: number;
  revokedAt?: number | null;
  artifact: DelegationArtifact;
};

const STORAGE_KEY = "pragma.h1.delegations.v1";

const isBrowser = () => typeof window !== "undefined";

type DelegationVault = Record<string, StoredDelegation[]>;

const extractDelegator = (artifact: DelegationArtifact): string | undefined => {
  const delegator = artifact?.delegation?.delegator;
  if (!delegator) return undefined;
  try {
    return getAddress(delegator as Address).toLowerCase();
  } catch {
    return undefined;
  }
};

const ensureDelegator = (entry: StoredDelegation): StoredDelegation => {
  if (entry.delegator) {
    return {
      ...entry,
      delegator: entry.delegator.toLowerCase(),
      revokedAt: entry.revokedAt ?? null,
    };
  }
  const derived = extractDelegator(entry.artifact) ?? "unknown";
  return {
    ...entry,
    delegator: derived,
    revokedAt: entry.revokedAt ?? null,
  };
};

const migrateLegacyVault = (legacy: StoredDelegation[]): DelegationVault => {
  const result: DelegationVault = {};
  for (const entry of legacy) {
    const normalized = ensureDelegator(entry);
    const list = result[normalized.delegator] ?? [];
    list.push(normalized);
    result[normalized.delegator] = list;
  }
  return result;
};

const readVault = (): DelegationVault => {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const migrated = migrateLegacyVault(
        parsed.map((entry) => ({
          ...entry,
          artifact: {
            ...entry.artifact,
            allowedTokens: entry.artifact.allowedTokens ?? [],
          },
        })),
      );
      writeVault(migrated);
      return migrated;
    }
    if (parsed && typeof parsed === "object" && "delegators" in parsed) {
      const delegators = (parsed as { delegators?: DelegationVault }).delegators ?? {};
      return Object.fromEntries(
        Object.entries(delegators).map(([delegator, entries]) => [
          delegator.toLowerCase(),
          entries.map((entry) => ({
            ...ensureDelegator(entry),
            artifact: {
              ...entry.artifact,
              allowedTokens: entry.artifact.allowedTokens ?? [],
            },
          })),
        ]),
      );
    }
    return {};
  } catch {
    return {};
  }
};

const writeVault = (entries: DelegationVault) => {
  if (!isBrowser()) return;
  const payload = {
    version: 2,
    delegators: entries,
  } satisfies { version: number; delegators: DelegationVault };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

const flattenVault = (vault: DelegationVault): StoredDelegation[] =>
  Object.values(vault)
    .flatMap((entries) => entries)
    .sort((a, b) => b.createdAt - a.createdAt);

export const listDelegations = (delegator?: Address): StoredDelegation[] => {
  const vault = readVault();
  if (delegator) {
    const key = getAddress(delegator).toLowerCase();
    return [...(vault[key] ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  }
  return flattenVault(vault);
};

const deriveExpiresAt = (artifact: DelegationArtifact): number | undefined => {
  if (artifact.expiresAt) {
    return artifact.expiresAt;
  }
  const delegation = artifact.delegation;
  if (!delegation) return undefined;
  for (const caveat of delegation.caveats ?? []) {
    if (!caveat.terms || caveat.terms.length !== 66) continue;
    try {
      const value = BigInt(caveat.terms);
      if (value > 0n) {
        return Number(value);
      }
    } catch {
      continue;
    }
  }
  return undefined;
};

const isDelegationExpired = (artifact: DelegationArtifact): boolean => {
  const expiry = deriveExpiresAt(artifact);
  if (!expiry) return false;
  return Math.floor(Date.now() / 1000) >= expiry;
};

export const listActiveDelegations = (
  kind: "swap" | "transfer" | undefined = "swap",
  delegator?: Address,
) =>
  listDelegations(delegator).filter((entry) => {
    if (kind && (entry.artifact.kind ?? "swap") !== kind) return false;
    if (entry.revokedAt) return false;
    return !isDelegationExpired(entry.artifact);
  });

export const getDelegationById = (id: string, delegator?: Address): StoredDelegation | undefined => {
  if (delegator) {
    const key = getAddress(delegator).toLowerCase();
    const vault = readVault();
    return (vault[key] ?? []).find((entry) => entry.id === id);
  }
  return flattenVault(readVault()).find((entry) => entry.id === id);
};

export const saveDelegation = (artifact: DelegationArtifact, id?: string): StoredDelegation => {
  const now = Date.now();
  const vault = readVault();
  const targetId = id ?? `delegation-${now}-${nanoid(6)}`;

  const delegatorKey = extractDelegator(artifact) ?? "unknown";
  const entries = vault[delegatorKey] ?? [];

  const normalized: DelegationArtifact = {
    ...artifact,
    allowedTokens: artifact.allowedTokens ?? [],
    perTokenCapsWei: artifact.perTokenCapsWei ?? undefined,
    nativeTokenCapWei: artifact.nativeTokenCapWei ?? null,
  };

  const existingIndex = entries.findIndex((entry) => entry.id === targetId);
  const nextEntry: StoredDelegation = {
    id: targetId,
    delegator: delegatorKey,
    artifact: normalized,
    createdAt: existingIndex >= 0 ? entries[existingIndex].createdAt : now,
    updatedAt: now,
    revokedAt: null,
  };

  if (existingIndex >= 0) {
    entries[existingIndex] = nextEntry;
  } else {
    entries.push(nextEntry);
  }

  vault[delegatorKey] = entries;
  writeVault(vault);
  return nextEntry;
};

export const removeDelegation = (id: string, delegator?: Address) => {
  const vault = readVault();
  if (delegator) {
    const key = getAddress(delegator).toLowerCase();
    const entries = vault[key];
    if (!entries) return;
    const filtered = entries.filter((entry) => entry.id !== id);
    if (filtered.length === 0) {
      delete vault[key];
    } else {
      vault[key] = filtered;
    }
    writeVault(vault);
    return;
  }

  let mutated = false;
  for (const key of Object.keys(vault)) {
    const filtered = vault[key].filter((entry) => entry.id !== id);
    if (filtered.length !== vault[key].length) {
      mutated = true;
      if (filtered.length === 0) {
        delete vault[key];
      } else {
        vault[key] = filtered;
      }
    }
  }
  if (mutated) {
    writeVault(vault);
  }
};

export const clearDelegations = (delegator?: Address) => {
  if (!delegator) {
    writeVault({});
    return;
  }
  const vault = readVault();
  const key = getAddress(delegator).toLowerCase();
  if (vault[key]) {
    delete vault[key];
    writeVault(vault);
  }
};

export const markDelegationsRevoked = (delegator: Address, targetIds?: string[]): StoredDelegation[] => {
  const vault = readVault();
  const key = getAddress(delegator).toLowerCase();
  const entries = vault[key];
  if (!entries || entries.length === 0) {
    return [];
  }

  const now = Date.now();
  const targets = targetIds && targetIds.length > 0 ? new Set(targetIds) : undefined;
  let mutated = false;

  const updated = entries.map((entry) => {
    if (targets && !targets.has(entry.id)) {
      return entry;
    }
    if (entry.revokedAt) {
      return entry;
    }
    mutated = true;
    return {
      ...entry,
      revokedAt: now,
      updatedAt: now,
    };
  });

  if (mutated) {
    vault[key] = updated;
    writeVault(vault);
  }

  return updated;
};

export type { StoredDelegation };
