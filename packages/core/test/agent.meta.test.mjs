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
  defaultSlippageBps: 1500, // 15% - exceeds MAX_SLIPPAGE_NORMAL_BPS (1000) to trigger clamping
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
  assert.equal(result.meta?.defaultsApplied?.includes("slippage_default"), true);
  assert.equal(result.meta?.defaultsApplied?.includes("slippage_clamped_max"), true);
  assert.equal(result.meta?.defaultsApplied?.includes("deadline_default"), true);
  assert.ok(result.meta?.policyEnforcements?.some((item) => item.key === "slippageBps" && item.reason === "clamped_max"));
  assert.ok(result.meta?.policyEnforcements?.some((item) => item.key === "deadlineSeconds" && item.reason === "default"));
  assert.equal(result.meta?.chainId, 10_143);
  assert.equal(result.intent.amountWei, BigInt("100000000000000000").toString());
  assert.equal(result.meta?.amountExactWei, result.intent.amountWei);
});

test("agent prefers streaming insight when available", async () => {
  const chunks = ["Hello", " world", "! "];
  const agent = new PragmaAgent({
    llmInsightStream: async () => ({
      type: "insight_stream",
      title: "Streamed",
      stream: (async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      })(),
      collect: async () => chunks.join(""),
    }),
    llmInsight: async () => ({
      type: "insight",
      title: "Fallback",
      body: "Should not be used",
    }),
  });

  const response = await agent.respond("what is Monad?", { delegation: delegationContext });
  assert.equal(response.type, "insight_stream");
  let collected = "";
  for await (const chunk of response.stream) {
    collected += chunk;
  }
  assert.equal(collected, chunks.join(""));
  const finalBody = await response.collect();
  assert.equal(finalBody, chunks.join(""));
});

test("agent falls back to non-streaming insight when streamer returns undefined", async () => {
  const agent = new PragmaAgent({
    llmInsightStream: async () => undefined,
    llmInsight: async () => ({
      type: "insight",
      title: "Fallback",
      body: "Hello",
    }),
  });

  const response = await agent.respond("tell me about pragma", { delegation: delegationContext });
  assert.equal(response.type, "insight");
  assert.equal(response.body, "Hello");
});
