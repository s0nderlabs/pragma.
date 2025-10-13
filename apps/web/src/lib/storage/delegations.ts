"use client";

import { nanoid } from "nanoid/non-secure";
import type { DelegationArtifact } from "@pragma/core/delegations/types";

type StoredDelegation = {
  id: string;
  createdAt: number;
  updatedAt: number;
  artifact: DelegationArtifact;
};

const STORAGE_KEY = "pragma.h1.delegations.v1";

const isBrowser = () => typeof window !== "undefined";

const readVault = (): StoredDelegation[] => {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredDelegation[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => ({
      ...entry,
      artifact: {
        ...entry.artifact,
        allowedTokens: entry.artifact.allowedTokens ?? [],
      },
    }));
  } catch {
    return [];
  }
};

const writeVault = (entries: StoredDelegation[]) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
};

export const listDelegations = (): StoredDelegation[] =>
  readVault().sort((a, b) => b.createdAt - a.createdAt);

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

export const listActiveDelegations = (kind: "swap" | "transfer" | undefined = "swap") =>
  listDelegations().filter((entry) => {
    if (kind && (entry.artifact.kind ?? "swap") !== kind) return false;
    return !isDelegationExpired(entry.artifact);
  });

export const getDelegationById = (id: string): StoredDelegation | undefined =>
  readVault().find((entry) => entry.id === id);

export const saveDelegation = (artifact: DelegationArtifact, id?: string): StoredDelegation => {
  const now = Date.now();
  const entries = readVault();
  const targetId = id ?? `delegation-${now}-${nanoid(6)}`;

  const normalized: DelegationArtifact = {
    ...artifact,
    allowedTokens: artifact.allowedTokens ?? [],
    perTokenCapsWei: artifact.perTokenCapsWei ?? undefined,
    nativeTokenCapWei: artifact.nativeTokenCapWei ?? null,
  };

  const existingIndex = entries.findIndex((entry) => entry.id === targetId);
  const nextEntry: StoredDelegation = {
    id: targetId,
    artifact: normalized,
    createdAt: existingIndex >= 0 ? entries[existingIndex].createdAt : now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    entries[existingIndex] = nextEntry;
  } else {
    entries.push(nextEntry);
  }

  writeVault(entries);
  return nextEntry;
};

export const removeDelegation = (id: string) => {
  const entries = readVault().filter((entry) => entry.id !== id);
  writeVault(entries);
};

export const clearDelegations = () => writeVault([]);

export type { StoredDelegation };
