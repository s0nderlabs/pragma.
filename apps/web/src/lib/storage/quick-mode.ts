"use client";

import { getAddress, type Address } from "viem";

const STORAGE_KEY = "pragma.h1.quick-mode.v2";
const LEGACY_KEY = "pragma.h1.quick-mode.v1";
const GLOBAL_KEY = "__global__";

type QuickModeVault = Record<string, boolean>;

const isBrowser = () => typeof window !== "undefined";

const readLegacy = (): QuickModeVault => {
  if (!isBrowser()) return {};
  const legacy = window.localStorage.getItem(LEGACY_KEY);
  if (!legacy) return {};
  const enabled = legacy === "1";
  window.localStorage.removeItem(LEGACY_KEY);
  return { [GLOBAL_KEY]: enabled } satisfies QuickModeVault;
};

const readVault = (): QuickModeVault => {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const migrated = readLegacy();
      if (Object.keys(migrated).length > 0) {
        writeVault(migrated);
      }
      return migrated;
    }
    const parsed = JSON.parse(raw) as QuickModeVault;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key.toLowerCase(), Boolean(value)]),
    );
  } catch {
    return {};
  }
};

const writeVault = (vault: QuickModeVault) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
};

const resolveKey = (delegator?: Address) =>
  delegator ? getAddress(delegator).toLowerCase() : GLOBAL_KEY;

export const getQuickModePreference = (delegator?: Address): boolean => {
  const vault = readVault();
  const key = resolveKey(delegator);
  if (key in vault) {
    return vault[key];
  }
  return vault[GLOBAL_KEY] ?? false;
};

export const setQuickModePreference = (delegator: Address | undefined, enabled: boolean) => {
  const vault = readVault();
  const key = resolveKey(delegator);
  vault[key] = enabled;
  writeVault(vault);
};

export const clearQuickModePreference = (delegator?: Address) => {
  const vault = readVault();
  const key = resolveKey(delegator);
  if (key in vault) {
    delete vault[key];
    writeVault(vault);
  }
};

export const clearAllQuickModePreferences = () => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
};
