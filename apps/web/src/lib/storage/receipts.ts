"use client";

import { nanoid } from "nanoid/non-secure";
import { getAddress, type Address } from "viem";

const STORAGE_KEY = "pragma.h1.receipts.v1";
const MAX_RECEIPTS_PER_DELEGATOR = 50;

const isBrowser = () => typeof window !== "undefined";

export type SwapReceiptStatus = "success" | "failed";

export interface SwapReceiptRecord {
  type: "swap";
  status: SwapReceiptStatus;
  delegator: Address;
  sessionKey: Address;
  chainId: number;
  mode: string;
  tokenIn: {
    address: Address;
    symbol?: string;
    decimals: number;
  };
  tokenOut: {
    address: Address;
    symbol?: string;
    decimals: number;
  };
  amountInWei: string;
  amountOutWei?: string;
  minAmountOutWei: string;
  slippageBps: number;
  deadlineSeconds?: number;
  quoteId?: string;
  planHash?: string;
  txHash?: string;
  blockNumber?: number;
  gasUsedWei?: string;
  createdAt: number;
  previewedAt?: number;
  executedAt?: number;
  summary: string;
  error?: Record<string, unknown> | string;
}

export interface StoredReceipt {
  id: string;
  delegator: Address;
  storedAt: number;
  record: SwapReceiptRecord;
}

type ReceiptVault = Record<string, StoredReceipt[]>;

const readVault = (): ReceiptVault => {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ReceiptVault;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([delegator, receipts]) => [
        delegator.toLowerCase(),
        Array.isArray(receipts)
          ? receipts.map((entry) => ({
              ...entry,
              delegator: getAddress(entry.delegator as Address),
              record: {
                ...entry.record,
                delegator: getAddress(entry.record.delegator as Address),
                sessionKey: getAddress(entry.record.sessionKey as Address),
              },
            }))
          : [],
      ]),
    );
  } catch {
    return {};
  }
};

const writeVault = (vault: ReceiptVault) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
};

const normalizeDelegatorKey = (delegator: Address): string => getAddress(delegator).toLowerCase();

export const storeReceipt = (record: SwapReceiptRecord): StoredReceipt => {
  const vault = readVault();
  const key = normalizeDelegatorKey(record.delegator);
  const entries = vault[key] ?? [];
  const storedAt = Date.now();
  const entry: StoredReceipt = {
    id: `receipt-${storedAt}-${nanoid(6)}`,
    delegator: getAddress(record.delegator),
    storedAt,
    record: {
      ...record,
      delegator: getAddress(record.delegator),
      sessionKey: getAddress(record.sessionKey),
    },
  };

  const next = [entry, ...entries]
    .sort((a, b) => (b.record.createdAt ?? b.storedAt) - (a.record.createdAt ?? a.storedAt))
    .slice(0, MAX_RECEIPTS_PER_DELEGATOR);

  vault[key] = next;
  writeVault(vault);
  return entry;
};

export const listReceipts = (delegator?: Address, limit = 10): StoredReceipt[] => {
  const vault = readVault();
  if (delegator) {
    const key = normalizeDelegatorKey(delegator);
    return [...(vault[key] ?? [])]
      .sort((a, b) => (b.record.createdAt ?? b.storedAt) - (a.record.createdAt ?? a.storedAt))
      .slice(0, limit);
  }

  const all = Object.values(vault).flat();
  return all
    .sort((a, b) => (b.record.createdAt ?? b.storedAt) - (a.record.createdAt ?? a.storedAt))
    .slice(0, limit);
};

export const findReceiptByTxHash = (txHash: string): StoredReceipt | undefined => {
  const lower = txHash.toLowerCase();
  const all = listReceipts(undefined, MAX_RECEIPTS_PER_DELEGATOR * 10);
  return all.find((entry) => entry.record.txHash?.toLowerCase() === lower);
};

export const clearReceipts = (delegator?: Address) => {
  if (!isBrowser()) return;
  if (!delegator) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const vault = readVault();
  const key = normalizeDelegatorKey(delegator);
  if (vault[key]) {
    delete vault[key];
    writeVault(vault);
  }
};
