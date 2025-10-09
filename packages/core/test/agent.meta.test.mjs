import test from "node:test";
import assert from "node:assert/strict";

const { PragmaAgent } = await import("../dist/agent/pragmaAgent.js");

const delegationContext = {
  mode: "normal",
  allowedTokens: [
    {
      address: "0x0000000000000000000000000000000000000000",
      symbol: "MON",
      decimals: 18,
      kind: "native",
    },
    {
      address: "0x0000000000000000000000000000000000000002",
      symbol: "USDC",
      decimals: 6,
    },
  ],
  nativeTokenSymbol: "MON",
  nativeTokenAddress: "0x0000000000000000000000000000000000000000",
  wrappedNativeSymbol: "WMON",
  wrappedNativeAddress: "0x0000000000000000000000000000000000000001",
  defaultSlippageBps: 100,
  defaultDeadlineMinutes: 30,
  nowSeconds: 1_700_000_000,
  chainId: 10_143,
  feeBps: 0,
  feeRecipient: "0x000000000000000000000000000000000000dEaD",
};

test("agent respond attaches meta for defaults", async () => {
  const agent = new PragmaAgent();
  const result = await agent.respond("swap 0.1 mon to usdc", { delegation: delegationContext });
  assert.equal(result.type, "intent");
  assert.ok(result.meta);
  assert.equal(result.meta?.defaultsApplied?.includes("slippage"), true);
  assert.equal(result.meta?.defaultsApplied?.includes("deadline"), true);
  assert.equal(result.meta?.chainId, 10_143);
  assert.equal(result.intent.amountWei, BigInt("100000000000000000").toString());
  assert.equal(result.meta?.amountExactWei, result.intent.amountWei);
});
