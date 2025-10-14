"use client";

import { generateSessionKey } from "@pragma/core/session/keys";
import type { Address, Hex } from "viem";

export interface SessionKeyRecord {
  delegator: Address;
  address: Address;
  privateKey: Hex;
  createdAt: number;
  isNew: boolean;
}

const STORAGE_KEY = "pragma.h1.session-keys.v1";

const isBrowser = () => typeof window !== "undefined";

type StoredSessionKey = Omit<SessionKeyRecord, "isNew">;

const readAll = (): Record<string, StoredSessionKey> => {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoredSessionKey>;
    if (!parsed) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, { ...value }]),
    );
  } catch {
    return {};
  }
};

const writeAll = (records: Record<string, StoredSessionKey>) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
};

export const getOrCreateSessionKey = (delegator: Address): SessionKeyRecord => {
  const normalized = delegator.toLowerCase();
  const records = readAll();
  const existing = records[normalized];
  if (existing) {
    return { ...existing, isNew: false };
  }

  const generated = generateSessionKey();
  const stored: StoredSessionKey = {
    delegator: delegator as Address,
    address: generated.address,
    privateKey: generated.privateKey,
    createdAt: Date.now(),
  };
  records[normalized] = stored;
  writeAll(records);
  return { ...stored, isNew: true };
};

export const rotateSessionKey = (delegator: Address): SessionKeyRecord => {
  const records = readAll();
  const normalized = delegator.toLowerCase();
  const generated = generateSessionKey();
  const stored: StoredSessionKey = {
    delegator: delegator as Address,
    address: generated.address,
    privateKey: generated.privateKey,
    createdAt: Date.now(),
  };
  records[normalized] = stored;
  writeAll(records);
  return { ...stored, isNew: true };
};

export const getSessionKey = (delegator: Address): SessionKeyRecord | null => {
  const records = readAll();
  const normalized = delegator.toLowerCase();
  const existing = records[normalized];
  if (!existing) return null;
  return { ...existing, isNew: false };
};

export const deleteSessionKey = (delegator: Address) => {
  const records = readAll();
  const normalized = delegator.toLowerCase();
  if (records[normalized]) {
    delete records[normalized];
    writeAll(records);
  }
};

export const clearSessionKeys = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
};
