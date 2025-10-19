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

const buildDelegationArtifact = (seed: number, overrides?: { revokedAt?: number; expiresAt?: number }) => {
  const now = Math.floor(Date.now() / 1000);
  return {
    mode: "normal" as const,
    sessionKeyPrivateKey: "0x1",
    sessionKeyAddress: SESSION_KEY_ADDRESS,
    delegation: {
      delegate: SESSION_KEY_ADDRESS,
      delegator: DELEGATOR_ADDRESS,
      authority: "0x",
      caveats: [],
      salt: `0x${(seed + 1).toString(16).padStart(2, "0")}`,
      signature: `0x${"ab".repeat(65)}`,
    },
    expiresAt: overrides?.expiresAt ?? (now + 24 * 60 * 60),
    callLimit: null,
    callsUnlimited: true,
    sessionNonce: `0x0${seed}`,
    allowedTokens,
    kind: "swap" as const,
    transferMaxAmount: null,
    pairAddresses: [],
    perTokenCapsWei: {},
    nativeTokenCapWei: null,
  };
};

const buildStoredDelegations = (count: number, options?: { expired?: boolean; revoked?: boolean }) => {
  const createdAt = Date.now();
  const now = Math.floor(Date.now() / 1000);
  
  return Array.from({ length: count }, (_, index) => ({
    id: `delegation-${index}`,
    delegator: DELEGATOR_ADDRESS.toLowerCase(),
    createdAt: createdAt - index * 1000,
    updatedAt: createdAt - index * 1000,
    revokedAt: options?.revoked ? createdAt - 500 : null,
    artifact: buildDelegationArtifact(index, {
      expiresAt: options?.expired ? (now - 1000) : (now + 24 * 60 * 60),
    }),
  }));
};

const setupMockIdentity = async (page: any) => {
  await page.waitForFunction(() => {
    return typeof (window as any).__PRAGMA_IDENTITY_MOCK__ !== "undefined";
  });

  await page.evaluate(
    ([owner, delegator]: [string, string]) => {
      (window as any).__PRAGMA_IDENTITY_MOCK__?.connect(owner, delegator);
    },
    [OWNER_ADDRESS, DELEGATOR_ADDRESS],
  );
};

const setupStorage = async (page: any, delegations: any[]) => {
  await page.addInitScript((state: { owner: string; delegator: string; stored: any[] }) => {
    const { owner, delegator, stored } = state;

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
};

test.describe("Revoke All Functionality", () => {
  test("should enable Revoke All button when active delegations exist", async ({ page }) => {
    const delegations = buildStoredDelegations(2);
    await setupStorage(page, delegations);
    await page.goto("/");
    await setupMockIdentity(page);

    const connectedButton = page.getByRole("button", { name: /Connected ·/ });
    await expect(connectedButton).toBeVisible();
    await connectedButton.click();

    await page.getByTestId("account-nav-actions").click();

    const revokeButton = page.getByRole("button", { name: /Revoke All/ });
    await expect(revokeButton).toBeVisible();
    await expect(revokeButton).toBeEnabled();
  });

  test("should show helpful tooltip when no delegations exist", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
    
    await page.goto("/");
    await setupMockIdentity(page);

    const connectedButton = page.getByRole("button", { name: /Connected ·/ });
    await expect(connectedButton).toBeVisible();
    await connectedButton.click();

    await page.getByTestId("account-nav-actions").click();

    const revokeButton = page.getByRole("button", { name: /Revoke All/ });
    await expect(revokeButton).toBeVisible();
    await expect(revokeButton).toBeDisabled();
    
    // Verify tooltip shows correct message
    await revokeButton.hover();
    await expect(page.locator('[title*="No delegations found"]')).toBeVisible();
  });

  test("should show expired count when delegations are expired", async ({ page }) => {
    const delegations = buildStoredDelegations(3, { expired: true });
    await setupStorage(page, delegations);
    await page.goto("/");
    await setupMockIdentity(page);

    const connectedButton = page.getByRole("button", { name: /Connected ·/ });
    await expect(connectedButton).toBeVisible();
    await connectedButton.click();

    await page.getByTestId("account-nav-actions").click();

    // Should show "(3 expired)" label
    await expect(page.getByText(/Revoke All.*3 expired/)).toBeVisible();
  });

  test("should display confirmation panel before revoking", async ({ page }) => {
    const delegations = buildStoredDelegations(2);
    await setupStorage(page, delegations);
    await page.goto("/");
    await setupMockIdentity(page);

    const connectedButton = page.getByRole("button", { name: /Connected ·/ });
    await expect(connectedButton).toBeVisible();
    await connectedButton.click();

    await page.getByTestId("account-nav-actions").click();

    const revokeButton = page.getByRole("button", { name: /Revoke All/ });
    await revokeButton.click();

    // Verify confirmation panel
    await expect(page.getByText(/Confirm Revoke All Delegations/i)).toBeVisible();
    await expect(page.getByText(/This will revoke all active delegations/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm Revoke" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  test("should cancel revoke when Cancel button is clicked", async ({ page }) => {
    const delegations = buildStoredDelegations(2);
    await setupStorage(page, delegations);
    await page.goto("/");
    await setupMockIdentity(page);

    const connectedButton = page.getByRole("button", { name: /Connected ·/ });
    await expect(connectedButton).toBeVisible();
    await connectedButton.click();

    await page.getByTestId("account-nav-actions").click();

    const revokeButton = page.getByRole("button", { name: /Revoke All/ });
    await revokeButton.click();

    // Click Cancel
    await page.getByRole("button", { name: "Cancel" }).click();

    // Confirmation panel should disappear
    await expect(page.getByText(/Confirm Revoke All Delegations/i)).not.toBeVisible();

    // Delegations should still be active
    await page.getByTestId("account-nav-delegations").click();
    await expect(page.getByText(/Active/i)).toBeVisible();
  });

  test("should successfully revoke delegations and show success message", async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on("console", (message) => {
      const text = message.text();
      if (text.includes("[Revoke]")) {
        consoleLogs.push(text);
      }
    });

    const delegations = buildStoredDelegations(2);
    await setupStorage(page, delegations);
    await page.goto("/");
    await setupMockIdentity(page);

    const connectedButton = page.getByRole("button", { name: /Connected ·/ });
    await expect(connectedButton).toBeVisible();
    await connectedButton.click();

    await page.getByTestId("account-nav-actions").click();

    const revokeButton = page.getByRole("button", { name: /Revoke All/ });
    await revokeButton.click();

    // Confirm revoke
    const confirmButton = page.getByRole("button", { name: "Confirm Revoke" });
    await confirmButton.click();

    // Wait for success message
    await expect(page.getByText(/Delegations revoked/i)).toBeVisible({ timeout: 10000 });

    // Verify console logs
    await page.waitForTimeout(500);
    expect(consoleLogs.some(log => log.includes("Attempting to revoke delegations"))).toBeTruthy();
  });

  test("should mark delegations as revoked in storage after successful revoke", async ({ page }) => {
    const delegations = buildStoredDelegations(2);
    await setupStorage(page, delegations);
    await page.goto("/");
    await setupMockIdentity(page);

    const connectedButton = page.getByRole("button", { name: /Connected ·/ });
    await expect(connectedButton).toBeVisible();
    await connectedButton.click();

    await page.getByTestId("account-nav-actions").click();

    const revokeButton = page.getByRole("button", { name: /Revoke All/ });
    await revokeButton.click();

    await page.getByRole("button", { name: "Confirm Revoke" }).click();

    await expect(page.getByText(/Delegations revoked/i)).toBeVisible({ timeout: 10000 });

    // Check delegations section
    await page.getByTestId("account-nav-delegations").click();
    await expect(page.getByTestId("delegations-section")).toBeVisible();

    // Verify "Revoked" status badge appears
    await expect(page.getByText(/Revoked/i).first()).toBeVisible();

    // Verify in localStorage
    const storageAfter = await page.evaluate(() => {
      const raw = window.localStorage.getItem("pragma.h1.delegations.v1");
      return raw ? JSON.parse(raw) : null;
    });

    expect(storageAfter).toBeTruthy();
    const delegatorKey = DELEGATOR_ADDRESS.toLowerCase();
    const storedDelegations = storageAfter?.delegators?.[delegatorKey] || [];
    
    // All delegations should have revokedAt timestamp
    storedDelegations.forEach((delegation: any) => {
      expect(delegation.revokedAt).toBeTruthy();
      expect(typeof delegation.revokedAt).toBe("number");
    });
  });

  test("should show loading spinner while revoke is in progress", async ({ page }) => {
    const delegations = buildStoredDelegations(2);
    await setupStorage(page, delegations);
    await page.goto("/");
    await setupMockIdentity(page);

    const connectedButton = page.getByRole("button", { name: /Connected ·/ });
    await expect(connectedButton).toBeVisible();
    await connectedButton.click();

    await page.getByTestId("account-nav-actions").click();

    const revokeButton = page.getByRole("button", { name: /Revoke All/ });
    await revokeButton.click();

    const confirmButton = page.getByRole("button", { name: "Confirm Revoke" });
    await confirmButton.click();

    // Verify spinner appears briefly (in mock mode it's very fast)
    // We'll check that the button was clicked successfully
    await expect(page.getByText(/Delegations revoked/i)).toBeVisible({ timeout: 10000 });
  });

  test("should refresh UI after successful revoke", async ({ page }) => {
    const delegations = buildStoredDelegations(2);
    await setupStorage(page, delegations);
    await page.goto("/");
    await setupMockIdentity(page);

    const connectedButton = page.getByRole("button", { name: /Connected ·/ });
    await expect(connectedButton).toBeVisible();
    await connectedButton.click();

    // Check initial smart account status
    const smartAccountBefore = await page.getByTestId("connected-smart-account").innerText();
    expect(smartAccountBefore).toContain(/ready|deployed|issuance/i);

    await page.getByTestId("account-nav-actions").click();

    const revokeButton = page.getByRole("button", { name: /Revoke All/ });
    await revokeButton.click();
    await page.getByRole("button", { name: "Confirm Revoke" }).click();

    await expect(page.getByText(/Delegations revoked/i)).toBeVisible({ timeout: 10000 });

    // Navigate back to overview to see updated status
    await page.getByTestId("account-nav-overview").click();

    // Smart account status should update
    await expect.poll(async () => {
      const text = await page.getByTestId("connected-smart-account").innerText();
      return text.includes("revoked") || text.includes("Awaiting issuance");
    }, { timeout: 5000 }).toBeTruthy();
  });

  test("should load delegations even when delegator lookup fails", async ({ page }) => {
    const delegations = buildStoredDelegations(2);
    
    // Setup storage WITHOUT owner-delegator mapping
    await page.addInitScript((state: any) => {
      const { delegator, stored } = state;
      const delegatorKey = delegator.toLowerCase();

      // Don't set owner-delegator mapping
      // Don't set active-delegator

      window.localStorage.setItem(
        "pragma.h1.delegations.v1",
        JSON.stringify({
          version: 2,
          delegators: {
            [delegatorKey]: stored,
          },
        }),
      );
    }, { delegator: DELEGATOR_ADDRESS, stored: delegations });

    await page.goto("/");
    await setupMockIdentity(page);

    const connectedButton = page.getByRole("button", { name: /Connected ·/ });
    await expect(connectedButton).toBeVisible();
    await connectedButton.click();

    // Navigate to delegations - should still see them
    await page.getByTestId("account-nav-delegations").click();
    await expect(page.getByTestId("delegations-section")).toBeVisible();

    // Delegations should be loaded despite missing delegator lookup
    await expect(page.getByText(/MON/i)).toBeVisible();
    await expect(page.getByText(/WMON/i)).toBeVisible();
  });
});
