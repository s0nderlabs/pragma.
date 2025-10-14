import { expect, test, type Route } from "@playwright/test";

const mockStream = async (route: Route, body = "Pragma here with your overview.") => {
  await route.fulfill({
    status: 200,
    headers: {
      "content-type": "text/event-stream",
    },
    body: [
      "event: chunk\n",
      `data: {"type":"chunk","content":"${body}"}\n\n`,
      "event: done\n",
      'data: {"type":"done"}\n\n',
    ].join(""),
  });
};

const OWNER_ADDRESS = "0x1111111111111111111111111111111111111111";
const DELEGATOR_ADDRESS = "0x2222222222222222222222222222222222222222";
const SESSION_KEY_ADDRESS = "0x3333333333333333333333333333333333333333";

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

const buildDelegationArtifact = () => {
  const now = Math.floor(Date.now() / 1000);
  return {
    mode: "normal",
    sessionKeyPrivateKey: "0x1",
    sessionKeyAddress: SESSION_KEY_ADDRESS,
    delegation: {
      delegate: SESSION_KEY_ADDRESS,
      delegator: DELEGATOR_ADDRESS,
      authority: "0x",
      caveats: [],
      salt: "0x1",
      signature: `0x${"ab".repeat(65)}`,
    },
    expiresAt: now + 24 * 60 * 60,
    callLimit: null,
    callsUnlimited: true,
    sessionNonce: "0x01",
    allowedTokens,
    kind: "swap",
    transferMaxAmount: null,
    pairAddresses: [],
    perTokenCapsWei: {},
    nativeTokenCapWei: null,
  } as const;
};

test.describe("Chat UI", () => {
  test.beforeEach(async ({ page }) => {
    const artifact = buildDelegationArtifact();
    await page.addInitScript((state) => {
      const { owner, delegator, artifact: artifactState } = state as {
        owner: string;
        delegator: string;
        artifact: ReturnType<typeof buildDelegationArtifact>;
      };
      const delegatorKey = delegator.toLowerCase();
      const ownerKey = owner.toLowerCase();
      const now = Date.now();

      window.localStorage.setItem(
        "pragma.h1.owner-delegators.v1",
        JSON.stringify({
          [ownerKey]: {
            delegator: delegatorKey,
            updatedAt: now,
          },
        }),
      );

      window.localStorage.setItem("pragma.h1.active-delegator.v1", delegator);

      window.localStorage.setItem(
        "pragma.h1.delegations.v1",
        JSON.stringify({
          version: 2,
          delegators: {
            [delegatorKey]: [
              {
                id: "delegation-chat",
                delegator: delegatorKey,
                createdAt: now,
                updatedAt: now,
                revokedAt: null,
                artifact: artifactState,
              },
            ],
          },
        }),
      );

      window.localStorage.removeItem("pragma.h1.receipts.v1");
    }, { owner: OWNER_ADDRESS, delegator: DELEGATOR_ADDRESS, artifact });

    await page.route("**/api/chat/respond", (route) => mockStream(route));
    await page.goto("/");

    await page.waitForFunction(() => {
      return typeof (window as unknown as { __PRAGMA_IDENTITY_MOCK__?: unknown }).__PRAGMA_IDENTITY_MOCK__ !== "undefined";
    });

    await page.evaluate(
      ([owner, delegator]) => {
        (window as unknown as {
          __PRAGMA_IDENTITY_MOCK__?: { connect: (o: string, d?: string) => void };
        }).__PRAGMA_IDENTITY_MOCK__?.connect(owner, delegator);
      },
      [OWNER_ADDRESS, DELEGATOR_ADDRESS],
    );

    await expect(page.getByRole("button", { name: /Connected ·/ })).toBeVisible();
  });

  test("renders flattened system response panel", async ({ page }) => {
    const textarea = page.getByPlaceholder(/Ask Pragma to swap/i);
    await textarea.fill("Give me an update");
    await textarea.press("Enter");

    const systemPanel = page.locator("[data-testid=system-message]").last();
    await expect(systemPanel).toBeVisible();
    await expect(systemPanel).not.toHaveText(/Analyzing intent…/);
    await expect(systemPanel).not.toHaveClass(/bg-gradient-to-br/);
    await expect(async () => {
      const text = await systemPanel.textContent();
      expect((text ?? "").trim().length).toBeGreaterThan(0);
    }).toPass();
  });

  test("keeps user messages as terracotta bubbles", async ({ page }) => {
    const textarea = page.getByPlaceholder(/Ask Pragma to swap/i);
    await textarea.fill("swap 1 mon to wmon");
    await textarea.press("Enter");

    const userBubble = page.locator("[data-testid=user-message]").first();
    await expect(userBubble).toHaveClass(/bg-gradient-to-br/);
    await expect(userBubble).toHaveClass(/from-\[#E07A5F\]/);
  });

  test("displays loading pulse before system response completes", async ({ page }) => {
    await page.route("**/api/chat/respond", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await mockStream(route, "Pending");
    });

    const textarea = page.getByPlaceholder(/Ask Pragma to swap/i);
    await textarea.fill("status?");
    await textarea.press("Enter");

    const dots = page.locator("[data-testid=system-message] [data-testid=loading-dots]");
    await expect(dots).toBeVisible();
  });
});
