import test from "node:test";
import assert from "node:assert/strict";

const { parseIntent } = await import("../dist/intent/parser.js");

const nativeToken = {
  address: "0x0000000000000000000000000000000000000000",
  symbol: "MON",
  name: "Monad",
  decimals: 18,
  kind: "native",
};

const wmonToken = {
  address: "0x0000000000000000000000000000000000000001",
  symbol: "WMON",
  name: "Wrapped Monad",
  decimals: 18,
};

const usdcToken = {
  address: "0x0000000000000000000000000000000000000002",
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
};

const usdcTokenAlt = {
  address: "0x0000000000000000000000000000000000000003",
  symbol: "USDC",
  name: "USD Coin (Alt)",
  decimals: 6,
};

const NOW_SECONDS = 1_700_000_000;

const delegationContext = {
  mode: "normal",
  allowedTokens: [nativeToken, wmonToken, usdcToken],
  nativeTokenSymbol: "MON",
  nativeTokenAddress: nativeToken.address,
  wrappedNativeSymbol: "WMON",
  wrappedNativeAddress: wmonToken.address,
  defaultSlippageBps: 100,
  defaultDeadlineMinutes: 30,
  nowSeconds: NOW_SECONDS,
};

test("parses fraction phrasing without treating 'of' as a token", () => {
  const outcome = parseIntent("swap half of my mon into usdc", delegationContext);
  assert.equal(outcome.type, "success");
  assert.equal(outcome.intent.action, "swap");
  assert.equal(outcome.intent.tokenIn.address, nativeToken.address);
  assert.equal(outcome.intent.tokenOut.address, usdcToken.address);
  assert.equal(outcome.intent.amount.kind, "fraction");
  assert.equal(outcome.intent.deadlineTimestamp, NOW_SECONDS + outcome.intent.deadlineSeconds);
  assert.equal(outcome.meta?.sourceText, "swap half of my mon into usdc");
  assert.equal(outcome.intent.amountWei, undefined);
});

test("understands swap all phrasing", () => {
  const outcome = parseIntent("swap all of usdc to mon", delegationContext);
  assert.equal(outcome.type, "success");
  assert.equal(outcome.intent.action, "swap");
  assert.equal(outcome.intent.tokenIn.address, usdcToken.address);
  assert.equal(outcome.intent.tokenOut.address, nativeToken.address);
  assert.equal(outcome.intent.amount.kind, "max");
  assert.equal(outcome.intent.deadlineTimestamp, NOW_SECONDS + outcome.intent.deadlineSeconds);
  assert.equal(outcome.intent.amountWei, undefined);
});

test("chooses explicit amount over max", () => {
  const outcome = parseIntent("swap max 0.75 mon to usdc", delegationContext);
  assert.equal(outcome.type, "success");
  assert.equal(outcome.intent.amount.kind, "exact");
  assert.equal(outcome.intent.amount.value, "0.75");
  assert.equal(outcome.meta?.defaultsApplied?.includes("slippage_default"), true);
  assert.equal(outcome.intent.amountWei, BigInt("750000000000000000").toString());
  assert.equal(outcome.intent.amount.valueWei, outcome.intent.amountWei);
});

test("parses decimal amounts expressed with a dot", () => {
  const outcome = parseIntent("swap 25.6 mon to usdc", delegationContext);
  assert.equal(outcome.type, "success");
  assert.equal(outcome.intent.amount.kind, "exact");
  assert.equal(outcome.intent.amount.value, "25.6");
  assert.equal(outcome.intent.amount.valueWei, BigInt("25600000000000000000").toString());
});

test("parses decimal amounts expressed with a comma", () => {
  const outcome = parseIntent("swap 25,6 mon to usdc", delegationContext);
  assert.equal(outcome.type, "success");
  assert.equal(outcome.intent.amount.kind, "exact");
  assert.equal(outcome.intent.amount.value, "25.6");
  assert.equal(outcome.intent.amount.valueWei, BigInt("25600000000000000000").toString());
});

test("parses sub-unit comma decimals", () => {
  const outcome = parseIntent("swap 0,125 mon to usdc", delegationContext);
  assert.equal(outcome.type, "success");
  assert.equal(outcome.intent.amount.kind, "exact");
  assert.equal(outcome.intent.amount.value, "0.125");
  assert.equal(outcome.intent.amount.valueWei, BigInt("125000000000000000").toString());
});

test("prompts clarification when token symbol is ambiguous", () => {
  const ambiguousContext = {
    ...delegationContext,
    allowedTokens: [nativeToken, wmonToken, usdcToken, usdcTokenAlt],
  };
  const outcome = parseIntent("swap usdc to mon", ambiguousContext);
  assert.equal(outcome.type, "clarification");
  assert.ok(outcome.clarification.questions.some((q) => q.id === "tokenIn"));
});

test("rejects exact amount above per-tx cap", () => {
  const contextWithCap = {
    ...delegationContext,
    perTokenCapsWei: {
      [usdcToken.address.toLowerCase()]: 50n * 10n ** 6n,
    },
  };
  const outcome = parseIntent("swap 100 usdc to mon", contextWithCap);
  assert.equal(outcome.type, "error");
  assert.equal(outcome.violations[0]?.code, "AMOUNT_EXCEEDS_CAP");
});

test("enforces safe pair scope", () => {
  const safeContext = {
    ...delegationContext,
    mode: "safe",
    allowedTokens: [nativeToken, usdcToken, wmonToken],
    pairAddresses: [nativeToken.address, usdcToken.address],
  };
  const okOutcome = parseIntent("swap 0.1 mon to usdc", safeContext);
  assert.equal(okOutcome.type, "success");
  const badOutcome = parseIntent("swap 0.1 wmon to mon", safeContext);
  assert.equal(badOutcome.type, "error");
  assert.equal(badOutcome.violations[0]?.code, "SAFE_PAIR_MISMATCH");
});

test("clamps safe mode slippage requests to policy maximum", () => {
  const safeContext = {
    ...delegationContext,
    mode: "safe",
    allowedTokens: [nativeToken, usdcToken],
    pairAddresses: [nativeToken.address, usdcToken.address],
  };
  const outcome = parseIntent("swap 0.1 mon to usdc with 1% slippage", safeContext);
  assert.equal(outcome.type, "success");
  assert.equal(outcome.intent.slippageBps, 25);
  assert.ok(outcome.meta?.policyEnforcements?.some((item) => item.key === "slippageBps" && item.reason === "clamped_max"));
  assert.ok(outcome.warnings.some((warning) => warning.includes("Slippage")));
});

test("clamps deadline requests above policy limit", () => {
  const outcome = parseIntent("swap 0.1 mon to usdc with 45 minute deadline", delegationContext);
  assert.equal(outcome.type, "success");
  assert.equal(outcome.intent.deadlineSeconds, 30 * 60);
  assert.ok(outcome.meta?.policyEnforcements?.some((item) => item.key === "deadlineSeconds" && item.reason === "clamped_max"));
  assert.ok(outcome.warnings.some((warning) => warning.includes("Deadline")));
});

test("raises deadlines below the minimum to the policy floor", () => {
  const outcome = parseIntent("swap 0.1 mon to usdc with 0 minute deadline", delegationContext);
  assert.equal(outcome.type, "success");
  assert.equal(outcome.intent.deadlineSeconds, 60);
  assert.ok(outcome.meta?.policyEnforcements?.some((item) => item.key === "deadlineSeconds" && item.reason === "clamped_min"));
  assert.ok(outcome.warnings.some((warning) => warning.includes("below the minimum")));
});

test("accepts 'max slippage' keyword in normal mode", () => {
  const outcome = parseIntent("swap 0.1 mon to usdc with max slippage", delegationContext);
  assert.equal(outcome.type, "success");
  assert.equal(outcome.intent.slippageBps, 1000); // 10% in normal mode
  assert.ok(outcome.meta?.policyEnforcements?.some((item) => item.key === "slippageBps" && item.reason === "user_requested_max"));
});

test("accepts 'maximum slippage' keyword in normal mode", () => {
  const outcome = parseIntent("swap 0.1 mon to usdc with maximum slippage", delegationContext);
  assert.equal(outcome.type, "success");
  assert.equal(outcome.intent.slippageBps, 1000); // 10% in normal mode
  assert.ok(outcome.meta?.policyEnforcements?.some((item) => item.key === "slippageBps" && item.reason === "user_requested_max"));
});

test("accepts 'highest slippage' keyword in normal mode", () => {
  const outcome = parseIntent("swap 0.1 mon to usdc with highest slippage", delegationContext);
  assert.equal(outcome.type, "success");
  assert.equal(outcome.intent.slippageBps, 1000); // 10% in normal mode
  assert.ok(outcome.meta?.policyEnforcements?.some((item) => item.key === "slippageBps" && item.reason === "user_requested_max"));
});

test("accepts 'max tolerance' keyword in normal mode", () => {
  const outcome = parseIntent("swap 0.1 mon to usdc with max tolerance", delegationContext);
  assert.equal(outcome.type, "success");
  assert.equal(outcome.intent.slippageBps, 1000); // 10% in normal mode
  assert.ok(outcome.meta?.policyEnforcements?.some((item) => item.key === "slippageBps" && item.reason === "user_requested_max"));
});

test("accepts 'maximum tolerance' keyword in normal mode", () => {
  const outcome = parseIntent("swap 0.1 mon to usdc with maximum tolerance", delegationContext);
  assert.equal(outcome.type, "success");
  assert.equal(outcome.intent.slippageBps, 1000); // 10% in normal mode
  assert.ok(outcome.meta?.policyEnforcements?.some((item) => item.key === "slippageBps" && item.reason === "user_requested_max"));
});

test("respects safe mode max slippage limit when using 'max slippage' keyword", () => {
  const safeContext = {
    ...delegationContext,
    mode: "safe",
    allowedTokens: [nativeToken, usdcToken],
    pairAddresses: [nativeToken.address, usdcToken.address],
  };
  const outcome = parseIntent("swap 0.1 mon to usdc with max slippage", safeContext);
  assert.equal(outcome.type, "success");
  assert.equal(outcome.intent.slippageBps, 500); // 5% in safe mode
  assert.ok(outcome.meta?.policyEnforcements?.some((item) => item.key === "slippageBps" && item.reason === "user_requested_max"));
});
