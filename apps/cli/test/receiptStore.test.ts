import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const mkTempDir = async () => fs.mkdtemp(path.join(os.tmpdir(), "pragma-receipts-test-"));

const sampleReceipt = () => ({
  type: "swap" as const,
  status: "success" as const,
  mode: "normal",
  delegator: "0x1111111111111111111111111111111111111111" as const,
  sessionKey: "0x2222222222222222222222222222222222222222" as const,
  chainId: 202406,
  tokenIn: {
    address: "0x3333333333333333333333333333333333333333" as const,
    symbol: "MON",
    decimals: 18,
  },
  tokenOut: {
    address: "0x4444444444444444444444444444444444444444" as const,
    symbol: "USDC",
    decimals: 6,
  },
  amountInWei: "1000000000000000000",
  amountOutWei: "1000000",
  minAmountOutWei: "990000",
  slippageBps: 50,
  deadlineSeconds: 900,
  quoteId: "test-quote",
  planHash: "0x5555555555555555555555555555555555555555555555555555555555555555" as const,
  txHash: "0x6666666666666666666666666666666666666666666666666666666666666666" as const,
  blockNumber: 123,
  gasUsedWei: "21000",
  createdAt: Date.now(),
  executedAt: Date.now(),
  previewedAt: Date.now(),
  summary: "Swap 1 MON -> 1 USDC",
});

test("receipt store round trip", async () => {
  const dir = await mkTempDir();
  process.env.PRAGMA_RECEIPT_DIR = dir;

  const { storeReceipt, listReceipts } = await import("../src/services/receiptStore.js");

  const record = sampleReceipt();
  const filePath = await storeReceipt(record);
  assert.ok(filePath.startsWith(dir));

  const receipts = await listReceipts(undefined, 5);
  assert.ok(receipts.some((item) => item.record.txHash === record.txHash));

  delete process.env.PRAGMA_RECEIPT_DIR;
});
