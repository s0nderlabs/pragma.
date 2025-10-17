import test from "node:test";
import assert from "node:assert/strict";

const { callWithRpcFallback } = await import("../dist/utils/rpcFallback.js");

test("callWithRpcFallback retries on fallback when primary returns block-not-found", async () => {
  let primaryAttempts = 0;
  let fallbackAttempts = 0;

  const primaryClient = {
    async readContract() {
      primaryAttempts += 1;
      const error = new Error("Invalid parameters were provided to the RPC method. Block requested not found.");
      throw error;
    },
  };

  const fallbackClient = {
    async readContract() {
      fallbackAttempts += 1;
      return 42n;
    },
  };

  const result = await callWithRpcFallback(primaryClient, fallbackClient, (client) =>
    client.readContract({}),
  );

  assert.equal(result, 42n);
  assert.equal(primaryAttempts, 1);
  assert.equal(fallbackAttempts, 1);
});

test("callWithRpcFallback rethrows when no fallback is provided", async () => {
  let attempts = 0;
  const primaryClient = {
    async getBalance() {
      attempts += 1;
      throw new Error("Invalid parameters were provided to the RPC method. Block requested not found.");
    },
  };

  await assert.rejects(
    () => callWithRpcFallback(primaryClient, undefined, (client) => client.getBalance({ address: "0x0" })),
    /Invalid parameters were provided/i,
  );
  assert.equal(attempts, 1);
});
