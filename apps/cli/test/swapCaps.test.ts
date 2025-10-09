import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import { getAddress, parseUnits } from "viem";

process.env.PRAGMA_REPL_FIXTURE = "1";

const suppress = <T>(fn: () => T): T => {
  const noop = () => {};
  const { log, info, warn, error } = console;
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.error = noop;
  try {
    return fn();
  } finally {
    console.log = log;
    console.info = info;
    console.warn = warn;
    console.error = error;
  }
};

const candidatePaths = [
  join(process.cwd(), ".env"),
  join(process.cwd(), "..", ".env"),
  join(process.cwd(), "..", "..", ".env"),
];
for (const candidate of candidatePaths) {
  if (existsSync(candidate)) {
    suppress(() => loadEnv({ path: candidate }));
    break;
  }
}

const silenceLogs = async <T>(fn: () => Promise<T>): Promise<T> => suppress(() => fn()) as Promise<T>;

test("per-token cap is decremented and enforced", async () => {
  await silenceLogs(async () => {
    const { setupHybridDelegatorTest } = await import("../src/services/onboarding4337.js");
    const { loadSwapSession, persistSwapSessionCaps } = await import("../src/services/swapArtifacts.js");
    const { executeSwapWithSession } = await import("../src/services/swapEngine.js");

    const setup = await setupHybridDelegatorTest("normal", { logSessionSummaries: false });
    const context = await loadSwapSession({ delegator: setup.hybridDelegator });
    const [fromToken, toToken] = context.allowedTokens.slice(0, 2);
    assert.ok(fromToken && toToken, "fixture did not provide two allowed tokens");

    const decimals = typeof fromToken.decimals === "number" ? fromToken.decimals : Number(fromToken.decimals ?? 18);
    const cap = parseUnits("1", decimals);
    const fromKey = getAddress(fromToken.address).toLowerCase();

    context.session.perTokenCapsWei = { [fromKey]: cap };
    context.session.nativeTokenCapWei = undefined;
    await persistSwapSessionCaps(context.artifactPath, context.session);

    const baseConfig = {
      session: context.session,
      environment: context.environment,
      hybridDelegator: context.delegatorAddress,
      intent: {
        from: { ...fromToken, decimals },
        to: {
          ...toToken,
          decimals: typeof toToken.decimals === "number" ? toToken.decimals : Number(toToken.decimals ?? 18),
        },
      },
      slippageBps: 50,
      logPrefix: "[caps-test]",
      artifactPath: context.artifactPath,
    } as const;

    await executeSwapWithSession({ ...baseConfig, amountInput: "0.4" });
    const remainingAfterFirst = context.session.perTokenCapsWei?.[fromKey];
    assert.ok(typeof remainingAfterFirst === "bigint" && remainingAfterFirst < cap, "cap was not decremented");

    await assert.rejects(
      executeSwapWithSession({ ...baseConfig, amountInput: "0.7" }),
      /exceeds remaining allowance/i,
    );
  });
});
