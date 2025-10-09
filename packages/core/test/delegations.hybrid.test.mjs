import test from "node:test";
import assert from "node:assert/strict";

const { buildHybridScope, buildHybridCaveats } = await import("../dist/delegations/hybrid.js");
const { getAddress } = await import("viem");

const router = "0x525B929fCd6a64AfF834f4eeCc6E860486cED700";

const makeToken = (address, symbol = "TKN") => ({
  address,
  symbol,
  decimals: 18,
  kind: "erc20",
});

test("safe mode scope keeps router + token targets without calldata pins", () => {
  const tokenIn = makeToken("0x00000000000000000000000000000000000000a1", "AAA");
  const tokenOut = makeToken("0x00000000000000000000000000000000000000b2", "BBB");

  const scope = buildHybridScope({
    allowedTokens: [tokenIn, tokenOut],
    router,
  });

  assert.deepEqual(scope.allowedCalldata, []);
});

test("normal mode scope omits pair restrictions", () => {
  const tokenA = makeToken("0x00000000000000000000000000000000000000c3");
  const tokenB = makeToken("0x00000000000000000000000000000000000000d4");

  const scope = buildHybridScope({
    allowedTokens: [tokenA, tokenB],
    router,
  });

  assert.deepEqual(scope.allowedCalldata, []);
});

test("buildHybridCaveats stores caps off-chain but does not inject amount enforcers", () => {
  const tokenAddress = getAddress("0x00000000000000000000000000000000000000e5");
  const caps = buildHybridCaveats("normal", 1_700_000_000, {
    callLimit: 12,
    unlimitedCalls: false,
    nonce: 1n,
    tokenCaps: { [tokenAddress]: 10n },
    nativeTokenCap: 20n,
  });

  assert.ok(Array.isArray(caps));
  const hasAmountCaps = caps.some(
    (entry) => entry.type === "erc20TransferAmount" || entry.type === "nativeTokenTransferAmount",
  );
  assert.equal(hasAmountCaps, false);
});
