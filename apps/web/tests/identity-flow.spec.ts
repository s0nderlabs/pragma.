import { expect, test } from "@playwright/test";

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

const buildDelegationArtifact = (seed: number, overrideDelegator?: string) => {
  const now = Math.floor(Date.now() / 1000);
  return {
    mode: "normal",
    sessionKeyPrivateKey: "0x1",
    sessionKeyAddress: SESSION_KEY_ADDRESS,
    delegation: {
      delegate: SESSION_KEY_ADDRESS,
      delegator: overrideDelegator ?? DELEGATOR_ADDRESS,
      authority: "0x",
      caveats: [],
      salt: `0x${(seed + 1).toString(16).padStart(2, "0")}`,
      signature: `0x${"ab".repeat(65)}`,
    },
    expiresAt: now + 24 * 60 * 60,
    callLimit: null,
    callsUnlimited: true,
    sessionNonce: `0x0${seed}`,
    allowedTokens,
    kind: "swap",
    transferMaxAmount: null,
    pairAddresses: [],
    perTokenCapsWei: {},
    nativeTokenCapWei: null,
  } satisfies Record<string, unknown>;
};

const buildStoredDelegations = (count: number, delegator: string = DELEGATOR_ADDRESS) => {
  const createdAt = Date.now();
  return Array.from({ length: count }, (_, index) => ({
    id: `delegation-${index}`,
    delegator: delegator.toLowerCase(),
    createdAt: createdAt - index * 1000,
    updatedAt: createdAt - index * 1000,
    artifact: buildDelegationArtifact(index, delegator),
  }));
};

test.describe("Connected account identity flow", () => {
  test.beforeEach(async ({ page }) => {
    const delegations = buildStoredDelegations(3, DELEGATOR_ADDRESS);
    await page.addInitScript((state) => {
      const { owner, delegator, stored } = state as {
        owner: string;
        delegator: string;
        stored: unknown[];
      };

      const delegatorKey = delegator.toLowerCase();
      const ownerKey = owner.toLowerCase();

      window.localStorage.setItem(
        "pragma.h1.owner-delegators.v1",
        JSON.stringify({
          [ownerKey]: {
            delegator: delegatorKey,
            updatedAt: Date.now(),
          },
        }),
      );

      window.localStorage.setItem("pragma.h1.active-delegator.v1", delegator);

      window.localStorage.setItem(
        "pragma.h1.delegations.v1",
        JSON.stringify({
          version: 2,
          delegators: {
            [delegatorKey]: stored,
          },
        }),
      );

      window.localStorage.removeItem("pragma.h1.receipts.v1");
    }, { owner: OWNER_ADDRESS, delegator: DELEGATOR_ADDRESS, stored: delegations });
  });

  test("shows active delegations and clears state on disconnect", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

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

    const connectedButton = page.getByRole("button", { name: /Connected ·/ });
    await expect(connectedButton).toBeVisible();

    await connectedButton.click();

    const shortDelegator = `${DELEGATOR_ADDRESS.slice(0, 6)}…${DELEGATOR_ADDRESS.slice(-4)}`;

    await expect(page.getByTestId("connected-delegator")).toHaveText(shortDelegator);
    await expect(page.getByTestId("connected-smart-account")).toHaveText(/HybridDelegator ready|Awaiting issuance|Already deployed/);

    await page.getByTestId("account-nav-delegations").click();
    await expect(page.getByTestId("delegations-section")).toBeVisible();
    await expect(page.locator('[data-testid="delegations-section"]').getByText("MON", { exact: true }).first()).toBeVisible();
    await expect(page.locator('[data-testid="delegations-section"]').getByText("WMON", { exact: true }).first()).toBeVisible();

    await page.keyboard.press("Escape");

    await page.evaluate(() => {
      return (window as unknown as {
        __PRAGMA_IDENTITY_MOCK__?: { disconnect: () => Promise<void> };
      }).__PRAGMA_IDENTITY_MOCK__?.disconnect();
    });

    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll("button"))
        .some((button) => button.textContent?.trim() === "Connect account");
    });

    await page.getByRole("button", { name: "Connect account" }).click();
    await page.getByTestId("account-nav-delegations").click();
    await expect(page.getByTestId("delegations-section")).toBeVisible();
    await expect(page.getByText(/No active delegations found/i)).toBeVisible();

    expect(consoleErrors.some((text) => text.includes("400"))).toBeFalsy();
    expect(consoleErrors.some((text) => text.includes("Non-200"))).toBeFalsy();
  });

  test("revokes delegations from the connected account modal", async ({ page }) => {
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

    const connectedButton = page.getByRole("button", { name: /Connected ·/ });
    await expect(connectedButton).toBeVisible();
    await connectedButton.click();

    // Navigate to Actions section
    await page.getByTestId("account-nav-actions").click();
    await expect(page.getByTestId("actions-section")).toBeVisible();

    // Check Emergency Actions bar is visible
    await expect(page.getByText("Emergency Actions")).toBeVisible();
    await expect(page.getByRole("button", { name: "Revoke All" })).toBeVisible();

    // Click Revoke All and confirm
    await page.getByRole("button", { name: "Revoke All" }).click();
    await page.getByRole("button", { name: "Confirm Revoke" }).click();

    await expect(page.getByText(/Delegations revoked/i)).toBeVisible();

    await expect.poll(async () => page.getByTestId("connected-smart-account").innerText()).toMatch(/Delegation revoked|Awaiting issuance|HybridDelegator ready/);

    await page.getByTestId("account-nav-delegations").click();
    await expect(page.getByTestId("delegations-section")).toBeVisible();
    await expect(page.getByText(/Revoked/i).first()).toBeVisible();
  });

  test("rotates session key and reissues delegation", async ({ page }) => {
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

    const connectedButton = page.getByRole("button", { name: /Connected ·/ });
    await expect(connectedButton).toBeVisible();
    await connectedButton.click();

    const sessionKeyLocator = page.getByTestId("connected-session-key");
    const initialSessionKey = (await sessionKeyLocator.innerText()).trim();
    expect(initialSessionKey.length).toBeGreaterThan(0);

    // Navigate to Actions section
    await page.getByTestId("account-nav-actions").click();
    await expect(page.getByTestId("actions-section")).toBeVisible();

    // Check Emergency Actions bar and Rotate Key button
    await expect(page.getByText("Emergency Actions")).toBeVisible();
    await expect(page.getByRole("button", { name: "Rotate Key" })).toBeVisible();

    // Click Rotate Key button
    await page.getByRole("button", { name: "Rotate Key" }).click();

    await expect.poll(async () => (await sessionKeyLocator.innerText()).trim()).not.toBe(initialSessionKey);

    const rotatedSessionKey = (await sessionKeyLocator.innerText()).trim();
    expect(rotatedSessionKey).not.toBe(initialSessionKey);
  });

  test("shows stored receipts for the connected delegator", async ({ page }) => {
    await page.goto("/");

    const receipt = {
      id: "receipt-test",
      delegator: DELEGATOR_ADDRESS,
      storedAt: Date.now(),
      record: {
        type: "swap",
        status: "success",
        delegator: DELEGATOR_ADDRESS,
        sessionKey: SESSION_KEY_ADDRESS,
        chainId: 10143,
        mode: "normal",
        tokenIn: {
          address: DELEGATOR_ADDRESS,
          symbol: "MON",
          decimals: 18,
        },
        tokenOut: {
          address: SESSION_KEY_ADDRESS,
          symbol: "WMON",
          decimals: 18,
        },
        amountInWei: "100000000000000000",
        amountOutWei: "200000000000000000",
        minAmountOutWei: "150000000000000000",
        slippageBps: 50,
        quoteId: "quote-123",
        planHash: "0x123",
        txHash: "0xabc",
        blockNumber: 12345,
        gasUsedWei: "21000",
        createdAt: Date.now() - 1000,
        executedAt: Date.now() - 500,
        summary: "Swap 0.1 MON → 0.2 WMON",
      },
    } satisfies Record<string, unknown>;

    await page.evaluate(([delegator, entry]) => {
      const existing = window.localStorage.getItem("pragma.h1.receipts.v1");
      const parsed = existing ? JSON.parse(existing) : {};
      parsed[(delegator as string).toLowerCase()] = [entry];
      window.localStorage.setItem("pragma.h1.receipts.v1", JSON.stringify(parsed));
    }, [DELEGATOR_ADDRESS, receipt]);

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

    const connectedButton = page.getByRole("button", { name: /Connected ·/ });
    await expect(connectedButton).toBeVisible();
    await connectedButton.click();

    await page.getByTestId("account-nav-receipts").click();

    await expect(page.getByTestId("receipts-section")).toBeVisible();
    await expect(page.getByText(/Swap 0.1 MON → 0.2 WMON/)).toBeVisible();
    await expect(page.getByText(/Success/)).toBeVisible();

    await page.getByTestId("receipt-row").first().click();
    await expect(page.getByTestId("receipt-detail-dialog")).toBeVisible();
    await expect(page.getByTestId("receipt-detail-dialog").getByRole("button", { name: "Close" })).toBeVisible();
    await page.getByTestId("receipt-detail-dialog").getByRole("button", { name: "Close" }).click();
  });

  test("displays Emergency Actions bar and OnboardingPanel in Actions section", async ({ page }) => {
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

    const connectedButton = page.getByRole("button", { name: /Connected ·/ });
    await expect(connectedButton).toBeVisible();
    await connectedButton.click();

    // Navigate to Actions section
    await page.getByTestId("account-nav-actions").click();
    await expect(page.getByTestId("actions-section")).toBeVisible();

    // Verify Emergency Actions bar
    await expect(page.getByText("Emergency Actions")).toBeVisible();
    await expect(page.getByText(/Use these controls if your account is compromised/i)).toBeVisible();

    // Verify both emergency buttons are present
    await expect(page.getByRole("button", { name: "Revoke All" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rotate Key" })).toBeVisible();

    // Verify funding tips info icon is present (check for the tooltip trigger)
    const fundingTipsButton = page.locator('button[title="Funding tips"]');
    await expect(fundingTipsButton).toBeVisible();

    // Verify OnboardingPanel is present in Actions section
    await expect(page.getByText(/Safe mode|Normal mode/i)).toBeVisible();
    await expect(page.getByText(/Issue Delegation|Reissue Delegation/i)).toBeVisible();
  });
});
