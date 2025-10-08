import { promises as fs } from "node:fs";
import path from "node:path";

interface FixtureSwapRecord {
  txHash: `0x${string}`;
  amountIn: bigint;
  amountOut: bigint;
  fromToken: string;
  toToken: string;
  note?: string;
}

interface FixtureWrapRecord {
  txHash: `0x${string}`;
  direction: "wrap" | "unwrap";
  amount: bigint;
}

interface FixtureTransferRecord {
  txHash: `0x${string}`;
  token: string;
  amount: bigint;
  recipient: string;
}

interface FixtureState {
  swaps: FixtureSwapRecord[];
  wraps: FixtureWrapRecord[];
  transfers: FixtureTransferRecord[];
  logs: string[];
}

const FIXTURE_FLAG = "PRAGMA_REPL_FIXTURE";
const FIXTURE_DIR_ENV = "PRAGMA_FIXTURE_DIR";

const fixtureState: FixtureState = {
  swaps: [],
  wraps: [],
  transfers: [],
  logs: [],
};

let hashCounter = 0;
let cachedInsights: unknown;

const sanitizeLabel = (label: string): string => label.replace(/[^a-fA-F0-9]/g, "").slice(0, 16).padEnd(16, "0");

const buildTxHash = (label: string): `0x${string}` => {
  hashCounter += 1;
  const suffix = hashCounter.toString(16).padStart(8, "0");
  const body = `${sanitizeLabel(label)}${suffix}`.padEnd(64, "0");
  return `0x${body}` as `0x${string}`;
};

export const isFixtureMode = (): boolean => process.env[FIXTURE_FLAG] === "1";

export const getFixtureDir = (): string | undefined => {
  const dir = process.env[FIXTURE_DIR_ENV];
  return dir ? path.resolve(dir) : undefined;
};

export const loadFixtureJson = async <T = unknown>(name: string): Promise<T | undefined> => {
  const dir = getFixtureDir();
  if (!dir) return undefined;
  const filePath = path.join(dir, `${name}.json`);
  try {
    const contents = await fs.readFile(filePath, "utf8");
    return JSON.parse(contents) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
};

export const resetFixtureState = () => {
  fixtureState.swaps.length = 0;
  fixtureState.wraps.length = 0;
  fixtureState.transfers.length = 0;
  fixtureState.logs.length = 0;
  hashCounter = 0;
  cachedInsights = undefined;
};

export const recordFixtureLog = (message: string) => {
  if (!isFixtureMode()) return;
  fixtureState.logs.push(message);
};

export const recordFixtureSwap = (
  entry: Omit<FixtureSwapRecord, "txHash"> & { txHashLabel?: string },
): `0x${string}` | undefined => {
  if (!isFixtureMode()) return undefined;
  const txHash = buildTxHash(entry.txHashLabel ?? "swap");
  fixtureState.swaps.push({
    txHash,
    amountIn: entry.amountIn,
    amountOut: entry.amountOut,
    fromToken: entry.fromToken,
    toToken: entry.toToken,
    note: entry.note,
  });
  return txHash;
};

export const recordFixtureWrap = (
  entry: Omit<FixtureWrapRecord, "txHash"> & { txHashLabel?: string },
): `0x${string}` | undefined => {
  if (!isFixtureMode()) return undefined;
  const txHash = buildTxHash(entry.txHashLabel ?? (entry.direction === "wrap" ? "wrap" : "unwrap"));
  fixtureState.wraps.push({
    txHash,
    direction: entry.direction,
    amount: entry.amount,
  });
  return txHash;
};

export const recordFixtureTransfer = (
  entry: Omit<FixtureTransferRecord, "txHash"> & { txHashLabel?: string },
): `0x${string}` | undefined => {
  if (!isFixtureMode()) return undefined;
  const txHash = buildTxHash(entry.txHashLabel ?? entry.token);
  fixtureState.transfers.push({
    txHash,
    token: entry.token,
    amount: entry.amount,
    recipient: entry.recipient,
  });
  return txHash;
};

export const getFixtureState = (): FixtureState => fixtureState;

export const loadFixtureInsights = async <T = unknown>(): Promise<T | undefined> => {
  if (!isFixtureMode()) return undefined;
  if (!cachedInsights) {
    cachedInsights = await loadFixtureJson("insights");
  }
  return cachedInsights as T | undefined;
};
