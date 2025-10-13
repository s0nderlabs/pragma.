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
    address: "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701",
    symbol: "WMON",
    name: "Wrapped Monad",
    decimals: 18,
    kind: "wrappedNative",
    categories: ["fallback"],
  },
];

test.describe("Chat agent", () => {
  test("returns a helpful response for conversational prompts", async ({ page }) => {
    await page.goto("/");

    const payload = {
      message: "hello there",
      delegation: {
        artifact: buildDelegationArtifact(),
        tokens: allowedTokens,
      },
    };

    const apiResponse = await page.request.post("/api/chat/respond", {
      data: payload,
    });

    expect(apiResponse.ok()).toBeTruthy();
    const contentType = apiResponse.headers()["content-type"] ?? "";

    if (contentType.includes("text/event-stream")) {
      const text = await apiResponse.text();
      expect(text).not.toContain('"type":"error"');
      expect(text).toContain('"type":"chunk"');
      expect(text).toContain('"type":"done"');
    } else {
      const data = (await apiResponse.json()) as Record<string, unknown>;
      expect(data.type).not.toBe("error");
      if (data.type === "insight") {
        expect(String(data.body ?? "").length).toBeGreaterThan(0);
      }
    }
  });

  test("streams balances insight for quick commands", async ({ page }) => {
    await page.goto("/");

    const payload = {
      message: "show my balances",
      delegation: {
        artifact: buildDelegationArtifact(),
        tokens: allowedTokens,
      },
    };

    const apiResponse = await page.request.post("/api/chat/respond", {
      data: payload,
    });

    expect(apiResponse.ok()).toBeTruthy();
    const contentType = apiResponse.headers()["content-type"] ?? "";
    expect(contentType).toContain("text/event-stream");
    const text = await apiResponse.text();
    expect(text).toContain("\"type\":\"chunk\"");
    expect(text).toContain("Portfolio overview");
    expect(text).toContain("\"type\":\"done\"");
  });

  test("streams delegation insight for status prompts", async ({ page }) => {
    await page.goto("/");

    const payload = {
      message: "what does my delegation allow right now?",
      delegation: {
        artifact: buildDelegationArtifact(),
        tokens: allowedTokens,
      },
    };

    const apiResponse = await page.request.post("/api/chat/respond", {
      data: payload,
    });

    expect(apiResponse.ok()).toBeTruthy();
    const contentType = apiResponse.headers()["content-type"] ?? "";
    expect(contentType).toContain("text/event-stream");
    const text = await apiResponse.text();
    expect(text).toContain("Delegation summary");
    expect(text).toContain("type\":\"done");
  });
});
