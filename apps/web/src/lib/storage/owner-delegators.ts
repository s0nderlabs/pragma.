"use client";

import { getAddress, type Address } from "viem";

const STORAGE_KEY = "pragma.h1.owner-delegators.v1";

type OwnerDelegatorRecord = {
  delegator: string;
  updatedAt: number;
};

type OwnerDelegatorVault = Record<string, OwnerDelegatorRecord>;

const isBrowser = () => typeof window !== "undefined";

const readVault = (): OwnerDelegatorVault => {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const entries = parsed as Record<string, OwnerDelegatorRecord>;
    return Object.fromEntries(
      Object.entries(entries).map(([owner, record]) => [owner.toLowerCase(), record]),
    );
  } catch {
    return {};
  }
};

const writeVault = (vault: OwnerDelegatorVault) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
};

export const getOwnerDelegator = (owner?: Address): Address | undefined => {
  if (!owner) return undefined;
  const normalizedOwner = getAddress(owner).toLowerCase();
  const vault = readVault();
  const record = vault[normalizedOwner];
  if (!record?.delegator) return undefined;
  try {
    return getAddress(record.delegator as Address);
  } catch {
    return undefined;
  }
};

export const setOwnerDelegator = (owner: Address, delegator: Address) => {
  if (!isBrowser()) return;
  const vault = readVault();
  const ownerKey = getAddress(owner).toLowerCase();
  vault[ownerKey] = {
    delegator: getAddress(delegator),
    updatedAt: Date.now(),
  } satisfies OwnerDelegatorRecord;
  writeVault(vault);
};

export const clearOwnerDelegator = (owner?: Address) => {
  if (!isBrowser()) return;
  if (!owner) {
    writeVault({});
    return;
  }
  const ownerKey = getAddress(owner).toLowerCase();
  const vault = readVault();
  if (vault[ownerKey]) {
    delete vault[ownerKey];
    writeVault(vault);
  }
};

export const listOwnerDelegators = (): OwnerDelegatorVault => readVault();
