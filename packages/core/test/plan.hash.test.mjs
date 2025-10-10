import test from "node:test";
import assert from "node:assert/strict";

const { computeSwapPlanHash } = await import("../dist/execution/plan.js");

test("computeSwapPlanHash deterministic for same inputs", () => {
  const input = {
    chainId: 201230,
    tokenIn: "0x0000000000000000000000000000000000000001",
    tokenOut: "0x0000000000000000000000000000000000000002",
    amountInWei: 1000000000000000000n,
    minAmountOutWei: 990000000000000000n,
    slippageBps: 50,
    deadlineSeconds: 900,
    quoteId: "quote-a",
    previewId: "preview-1",
  };

  const hashA = computeSwapPlanHash(input);
  const hashB = computeSwapPlanHash({ ...input });
  assert.equal(hashA, hashB);
});

test("computeSwapPlanHash changes when inputs change", () => {
  const base = {
    chainId: 201230,
    tokenIn: "0x0000000000000000000000000000000000000001",
    tokenOut: "0x0000000000000000000000000000000000000002",
    amountInWei: 1000000000000000000n,
    minAmountOutWei: 990000000000000000n,
    slippageBps: 50,
    deadlineSeconds: 900,
    quoteId: "quote-a",
    previewId: "preview-1",
  };

  const hashBase = computeSwapPlanHash(base);
  const hashDifferentQuote = computeSwapPlanHash({ ...base, quoteId: "quote-b" });
  assert.notEqual(hashBase, hashDifferentQuote);
});
