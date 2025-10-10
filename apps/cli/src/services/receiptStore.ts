import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { getAddress } from "viem";

const LEGACY_BASE = path.join(os.homedir(), ".pragma");
const RECEIPT_BASE_DIR = process.env.PRAGMA_RECEIPT_DIR
  ? path.resolve(process.env.PRAGMA_RECEIPT_DIR)
  : path.join(LEGACY_BASE, "receipts");

export interface SwapReceiptRecord {
  type: "swap";
  status: "success" | "failed";
  mode: string;
  delegator: `0x${string}`;
  sessionKey: `0x${string}`;
  chainId: number;
  tokenIn: {
    address: `0x${string}`;
    symbol?: string;
    decimals: number;
  };
  tokenOut: {
    address: `0x${string}`;
    symbol?: string;
    decimals: number;
  };
  amountInWei: string;
  amountOutWei?: string;
  minAmountOutWei: string;
  slippageBps: number;
  deadlineSeconds?: number;
  quoteId?: string;
  planHash?: `0x${string}`;
  txHash?: `0x${string}`;
  blockNumber?: number;
  gasUsedWei?: string;
  createdAt: number;
  previewedAt?: number;
  executedAt?: number;
  summary: string;
  error?: Record<string, unknown>;
}

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

const receiptDirForDelegator = async (delegator: string) => {
  const normalized = getAddress(delegator);
  return ensureDir(path.join(RECEIPT_BASE_DIR, normalized.toLowerCase()));
};

const buildFileName = (record: SwapReceiptRecord): string => {
  const timestamp = record.executedAt ?? record.createdAt;
  const qualifier = record.status === "success" && record.txHash ? record.txHash.slice(2, 10) : "plan";
  return `${record.type}-${timestamp}-${qualifier}.json`;
};

export const storeReceipt = async (record: SwapReceiptRecord): Promise<string> => {
  if (!record.createdAt) {
    record.createdAt = Date.now();
  }
  const dir = await receiptDirForDelegator(record.delegator);
  const fileName = buildFileName(record);
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf8");
  return filePath;
};

export interface StoredReceiptSummary {
  path: string;
  record: SwapReceiptRecord;
}

const readReceiptFile = async (filePath: string): Promise<SwapReceiptRecord | undefined> => {
  try {
    const contents = await fs.readFile(filePath, "utf8");
    return JSON.parse(contents) as SwapReceiptRecord;
  } catch {
    return undefined;
  }
};

export const listReceipts = async (delegator?: string, limit = 20): Promise<StoredReceiptSummary[]> => {
  const dir = delegator
    ? path.join(RECEIPT_BASE_DIR, getAddress(delegator).toLowerCase())
    : RECEIPT_BASE_DIR;

  let entries: string[] = [];
  try {
    const stats = await fs.stat(dir);
    if (!stats.isDirectory()) return [];
    if (delegator) {
      entries = (await fs.readdir(dir)).map((file) => path.join(dir, file));
    } else {
      const delegatorDirs = await fs.readdir(dir);
      for (const subdir of delegatorDirs) {
        const full = path.join(dir, subdir);
        const stat = await fs.stat(full);
        if (stat.isDirectory()) {
          const files = await fs.readdir(full);
          entries.push(...files.map((file) => path.join(full, file)));
        }
      }
    }
  } catch {
    return [];
  }

  const summaries: StoredReceiptSummary[] = [];
  for (const filePath of entries) {
    const record = await readReceiptFile(filePath);
    if (!record) continue;
    summaries.push({ path: filePath, record });
  }

  summaries.sort((a, b) => (b.record.createdAt ?? 0) - (a.record.createdAt ?? 0));
  return summaries.slice(0, limit);
};

export const findReceiptByTxHash = async (txHash: string): Promise<StoredReceiptSummary | undefined> => {
  const lower = txHash.toLowerCase();
  const summaries = await listReceipts(undefined, Number.MAX_SAFE_INTEGER);
  return summaries.find((item) => item.record.txHash?.toLowerCase() === lower);
};
