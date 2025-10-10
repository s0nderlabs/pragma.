import test from "node:test";
import assert from "node:assert/strict";

const { previewSwapWithSession } = await import("../dist/execution/swap.js");

const nowSeconds = 1_700_000_000;

const dummyDelegation = {
  delegate: "0x1111111111111111111111111111111111111111",
  delegator: "0x2222222222222222222222222222222222222222",
  authority: "0x0000000000000000000000000000000000000000000000000000000000000000",
  caveats: [],
  salt: "0x0000000000000000000000000000000000000000000000000000000000000000",
  signature: "0x",
};

const session = {
  mode: "normal",
  sessionKeyAddress: "0x3333333333333333333333333333333333333333",
  sessionKeyPrivateKey: "0x01",
  expiresAt: nowSeconds + 3600,
  delegation: dummyDelegation,
  sessionNonce: "0x00",
};

const environment = {
  DelegationManager: "0x4444444444444444444444444444444444444444",
};

const routerAddress = "0x5555555555555555555555555555555555555555";
const nativeTokenAddress = "0x0000000000000000000000000000000000000000";

const makePublicClient = ({
  sessionBalance = 1_000_000_000_000_000_000n,
  delegatorBalance = 5_000_000_000_000_000_000n,
} = {}) => ({
  async getBalance({ address }) {
    if (address.toLowerCase() === session.sessionKeyAddress.toLowerCase()) return sessionBalance;
    return delegatorBalance;
  },
  async readContract({ functionName }) {
    if (functionName === "balanceOf") {
      return delegatorBalance;
    }
    throw new Error(`Unexpected readContract call for ${functionName}`);
  },
  async call() {
    return "0x";
  },
  async estimateGas() {
    return 21_000n;
  },
});

const baseDependencies = {
  publicClient: makePublicClient(),
  sessionWalletFactory: () => {
    throw new Error("sessionWalletFactory should not be used in preview");
  },
  quoteFetcher: async () => ({
    quoteId: "quote-123",
    transactionData: "0xdead",
    transactionValue: 0n,
    aggregator: routerAddress,
    rawInput: 1000000000000000000n,
    rawOutput: 2_000_000_000_000_000_000n,
    rawMinOutput: 1_990_000_000_000_000_000n,
  }),
  routerAddress,
  nativeTokenAddress,
  wrappedNativeAddress: "0x6666666666666666666666666666666666666666",
};

const fromToken = {
  address: nativeTokenAddress,
  symbol: "MON",
  decimals: 18,
  kind: "native",
};

const toToken = {
  address: "0x7777777777777777777777777777777777777777",
  symbol: "USDC",
  decimals: 6,
};

const hedgeToken = {
  address: "0x9999999999999999999999999999999999999999",
  symbol: "HEDGE",
  decimals: 18,
  kind: "erc20",
};

test("previewSwapWithSession produces execution plan and context", async () => {
  const result = await previewSwapWithSession(
    {
      session,
      environment,
      hybridDelegator: "0x8888888888888888888888888888888888888888",
      intent: { from: { ...fromToken, decimals: 18 }, to: { ...toToken, decimals: 6 } },
      amountInput: "1",
      slippageBps: 50,
    },
    baseDependencies,
  );

  assert.equal(result.plan.quote.quoteId, "quote-123");
  assert.equal(result.plan.gasEstimate, 21_000n);
  assert.equal(result.plan.minAmountOut, 1_990_000_000_000_000_000n);
  assert.equal(result.plan.warnings.length, 0);
  assert.equal(result.context.sessionKeyBalance, 1_000_000_000_000_000_000n);
});

test("previewSwapWithSession rejects quotes that violate policy floor", async () => {
  const dependencies = {
    ...baseDependencies,
    quoteFetcher: async () => ({
      quoteId: "quote-low",
      transactionData: "0xbeef",
      transactionValue: 0n,
      aggregator: routerAddress,
      rawInput: 1000000000000000000n,
      rawOutput: 2_000_000_000_000_000_000n,
      rawMinOutput: 1_500_000_000_000_000_000n,
    }),
  };

  await assert.rejects(
    previewSwapWithSession(
      {
        session,
        environment,
        hybridDelegator: "0x9999999999999999999999999999999999999999",
        intent: { from: { ...fromToken, decimals: 18 }, to: { ...toToken, decimals: 6 } },
        amountInput: "1",
        slippageBps: 50,
      },
      dependencies,
    ),
    /policy floor/i,
  );
});

test("previewSwapWithSession skips simulation when allowance missing", async () => {
  const dependencies = {
    ...baseDependencies,
    publicClient: {
      async getBalance({ address }) {
        if (address.toLowerCase() === session.sessionKeyAddress.toLowerCase()) return 1_000_000_000_000_000_000n;
        return 5_000_000_000_000_000_000n;
      },
      async readContract({ functionName }) {
        if (functionName === "balanceOf") return 5_000_000_000_000_000_000n;
        if (functionName === "allowance") return 0n;
        throw new Error(`Unexpected readContract call for ${functionName}`);
      },
      async call() {
        throw new Error("transfer from allowance too low");
      },
      async estimateGas() {
        throw new Error("gas fails without allowance");
      },
    },
  };

  const result = await previewSwapWithSession(
    {
      session,
      environment,
      hybridDelegator: "0x1234567890123456789012345678901234567890",
      intent: { from: hedgeToken, to: { ...toToken, decimals: 6 } },
      amountInput: "1",
      slippageBps: 50,
    },
    dependencies,
  );

  assert.ok(result.plan.warnings.some((warning) => warning.includes("allowance")));
  assert.equal(result.plan.gasEstimate, undefined);
});
