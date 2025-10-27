import { expect, test } from "@playwright/test";

const buildDelegationArtifact = () => {
  const now = Math.floor(Date.now() / 1000);
  return {
    mode: "normal",
    sessionKeyPrivateKey: "0x1",
    sessionKeyAddress: "0x09dca42cd910935e657ecd3aaa1aa616c32a4025",
    delegation: {
      delegate: "0x09dca42cd910935e657ecd3aaa1aa616c32a4025",
      delegator: "0x339A1063e84C6Ef785D7bA73a786b87AC8Fb61Aa",
      authority: "0x",
      caveats: [],
      salt: "0x2",
      signature:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
    expiresAt: now + 3600,
    callLimit: null,
    callsUnlimited: true,
    sessionNonce: "0x02",
    allowedTokens: [],
    kind: "swap",
    transferMaxAmount: null,
    pairAddresses: [],
    perTokenCapsWei: {},
    nativeTokenCapWei: null,
  } satisfies Record<string, unknown>;
};

const allowedTokens = [
  {
    address: "0x0000000000000000000000000000000000000000",
    symbol: "MON",
    name: "Monad",
    decimals: 18,
    kind: "native",
    categories: ["fallback"],
  },
  {
    address: "0x0F0BDEbF0F83cD1EE3974779Bcb7315f9808c714",
    symbol: "DAK",
    name: "Dank",
    decimals: 18,
    kind: "erc20",
    categories: [],
  },
  {
    address: "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701",
    symbol: "WMON",
    name: "Wrapped Monad",
    decimals: 18,
    kind: "wrappedNative",
    categories: ["fallback"],
  },
];

test.describe("Max Slippage and Fraction Display", () => {
  test("accepts 'max slippage' keyword in normal mode", async ({ page }) => {
    await page.goto("/");

    const payload = {
      message: "swap 1 MON to DAK with max slippage",
      delegation: {
        artifact: buildDelegationArtifact(),
        tokens: allowedTokens,
      },
    };

    const apiResponse = await page.request.post("/api/chat/respond", {
      data: payload,
    });

    expect(apiResponse.ok()).toBeTruthy();
    const data = (await apiResponse.json()) as Record<string, unknown>;
    expect(data.type).toBe("intent");

    if (data.type === "intent") {
      const intent = data.intent as Record<string, unknown>;
      expect(intent.slippageBps).toBe(1000); // 10% in normal mode
    }
  });

  test("accepts 'maximum slippage' keyword in normal mode", async ({ page }) => {
    await page.goto("/");

    const payload = {
      message: "swap 1 MON to DAK with maximum slippage",
      delegation: {
        artifact: buildDelegationArtifact(),
        tokens: allowedTokens,
      },
    };

    const apiResponse = await page.request.post("/api/chat/respond", {
      data: payload,
    });

    expect(apiResponse.ok()).toBeTruthy();
    const data = (await apiResponse.json()) as Record<string, unknown>;
    expect(data.type).toBe("intent");

    if (data.type === "intent") {
      const intent = data.intent as Record<string, unknown>;
      expect(intent.slippageBps).toBe(1000); // 10% in normal mode
    }
  });

  test("accepts 'highest slippage' keyword in normal mode", async ({ page }) => {
    await page.goto("/");

    const payload = {
      message: "swap 1 MON to DAK with highest slippage",
      delegation: {
        artifact: buildDelegationArtifact(),
        tokens: allowedTokens,
      },
    };

    const apiResponse = await page.request.post("/api/chat/respond", {
      data: payload,
    });

    expect(apiResponse.ok()).toBeTruthy();
    const data = (await apiResponse.json()) as Record<string, unknown>;
    expect(data.type).toBe("intent");

    if (data.type === "intent") {
      const intent = data.intent as Record<string, unknown>;
      expect(intent.slippageBps).toBe(1000); // 10% in normal mode
    }
  });

  test("accepts 'max tolerance' keyword in normal mode", async ({ page }) => {
    await page.goto("/");

    const payload = {
      message: "swap 1 MON to DAK with max tolerance",
      delegation: {
        artifact: buildDelegationArtifact(),
        tokens: allowedTokens,
      },
    };

    const apiResponse = await page.request.post("/api/chat/respond", {
      data: payload,
    });

    expect(apiResponse.ok()).toBeTruthy();
    const data = (await apiResponse.json()) as Record<string, unknown>;
    expect(data.type).toBe("intent");

    if (data.type === "intent") {
      const intent = data.intent as Record<string, unknown>;
      expect(intent.slippageBps).toBe(1000); // 10% in normal mode
    }
  });

  test("respects safe mode max slippage limit (5%)", async ({ page }) => {
    await page.goto("/");

    const safeModeArtifact = {
      ...buildDelegationArtifact(),
      mode: "safe",
      pairAddresses: [
        "0x0000000000000000000000000000000000000000",
        "0x0F0BDEbF0F83cD1EE3974779Bcb7315f9808c714",
      ],
    };

    const payload = {
      message: "swap 1 MON to DAK with max slippage",
      delegation: {
        artifact: safeModeArtifact,
        tokens: allowedTokens,
      },
    };

    const apiResponse = await page.request.post("/api/chat/respond", {
      data: payload,
    });

    expect(apiResponse.ok()).toBeTruthy();
    const data = (await apiResponse.json()) as Record<string, unknown>;
    expect(data.type).toBe("intent");

    if (data.type === "intent") {
      const intent = data.intent as Record<string, unknown>;
      expect(intent.slippageBps).toBe(500); // 5% in safe mode
    }
  });

  test("parses 'half my MON' as fraction", async ({ page }) => {
    await page.goto("/");

    const payload = {
      message: "swap half my MON to DAK",
      delegation: {
        artifact: buildDelegationArtifact(),
        tokens: allowedTokens,
      },
    };

    const apiResponse = await page.request.post("/api/chat/respond", {
      data: payload,
    });

    expect(apiResponse.ok()).toBeTruthy();
    const data = (await apiResponse.json()) as Record<string, unknown>;
    expect(data.type).toBe("intent");

    if (data.type === "intent") {
      const intent = data.intent as Record<string, unknown>;
      const amount = intent.amount as Record<string, unknown>;
      expect(amount.kind).toBe("fraction");
      // Check that numerator/denominator represent 1/2
      const ratio = (amount.numerator as number) / (amount.denominator as number);
      expect(Math.abs(ratio - 0.5)).toBeLessThan(0.001);
    }
  });

  test("parses 'quarter of my MON' as fraction", async ({ page }) => {
    await page.goto("/");

    const payload = {
      message: "swap quarter of my MON to DAK",
      delegation: {
        artifact: buildDelegationArtifact(),
        tokens: allowedTokens,
      },
    };

    const apiResponse = await page.request.post("/api/chat/respond", {
      data: payload,
    });

    expect(apiResponse.ok()).toBeTruthy();
    const data = (await apiResponse.json()) as Record<string, unknown>;
    expect(data.type).toBe("intent");

    if (data.type === "intent") {
      const intent = data.intent as Record<string, unknown>;
      const amount = intent.amount as Record<string, unknown>;
      expect(amount.kind).toBe("fraction");
      // Check that numerator/denominator represent 1/4
      const ratio = (amount.numerator as number) / (amount.denominator as number);
      expect(Math.abs(ratio - 0.25)).toBeLessThan(0.001);
    }
  });

  test("parses 'three quarters of my MON' as fraction", async ({ page }) => {
    await page.goto("/");

    const payload = {
      message: "swap three quarters of my MON to DAK",
      delegation: {
        artifact: buildDelegationArtifact(),
        tokens: allowedTokens,
      },
    };

    const apiResponse = await page.request.post("/api/chat/respond", {
      data: payload,
    });

    expect(apiResponse.ok()).toBeTruthy();
    const data = (await apiResponse.json()) as Record<string, unknown>;
    expect(data.type).toBe("intent");

    if (data.type === "intent") {
      const intent = data.intent as Record<string, unknown>;
      const amount = intent.amount as Record<string, unknown>;
      expect(amount.kind).toBe("fraction");
      // Check that numerator/denominator represent 3/4
      const ratio = (amount.numerator as number) / (amount.denominator as number);
      expect(Math.abs(ratio - 0.75)).toBeLessThan(0.001);
    }
  });
});
