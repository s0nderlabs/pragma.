"use client";

import { getAddress, type Address } from "viem";

const STORAGE_KEY = "pragma.h1.active-delegator.v1";
export const IDENTITY_EVENT = "pragma:identity:changed";

const isBrowser = () => typeof window !== "undefined";

export const getActiveDelegator = (): Address | undefined => {
  if (!isBrowser()) return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    return getAddress(raw as Address);
  } catch {
    return undefined;
  }
};

export const setActiveDelegator = (delegator: Address, owner?: Address) => {
  if (!isBrowser()) return;
  const normalized = getAddress(delegator);
  window.localStorage.setItem(STORAGE_KEY, normalized);
  const detail: { delegator: string; owner?: string } = { delegator: normalized };
  if (owner) {
    detail.owner = getAddress(owner);
  }
  window.dispatchEvent(new CustomEvent(IDENTITY_EVENT, { detail }));
};

export const clearActiveDelegator = (owner?: Address) => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  const detail: { delegator: null; owner?: string } = { delegator: null };
  if (owner) {
    detail.owner = getAddress(owner);
  }
  window.dispatchEvent(new CustomEvent(IDENTITY_EVENT, { detail }));
};
