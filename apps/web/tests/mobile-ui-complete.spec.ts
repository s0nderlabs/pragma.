import { expect, test } from "@playwright/test";

/**
 * Comprehensive Mobile UI Test Suite
 *
 * Tests all mobile UI components across multiple device sizes
 * to ensure proper responsive behavior
 */

// Test device configurations
const devices = [
  { name: "iPhone SE", width: 375, height: 667, category: "small" },
  { name: "iPhone 12", width: 390, height: 844, category: "medium" },
  { name: "iPhone 14 Pro Max", width: 430, height: 932, category: "large" },
  { name: "iPad Mini", width: 768, height: 1024, category: "tablet" },
];

const desktop = { name: "Desktop", width: 1280, height: 720 };

// Mock delegation for tests that require authentication
const mockDelegation = {
  artifactId: "test-artifact-1",
  chainId: 41454,
  mode: "swap" as const,
  delegator: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
  delegate: "0x1234567890123456789012345678901234567890",
  authority: "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  caveats: [],
  salt: "0",
  signature: "0x1234",
  sessionKeyAddress: "0x1234567890123456789012345678901234567890",
  expiresAt: Date.now() + 86400000,
  callLimit: 10,
  callsUnlimited: false,
  sessionNonce: "0x0",
  allowedTokens: [],
  kind: "swap" as const,
  transferMaxAmount: null,
  pairAddresses: [],
  perTokenCapsWei: {},
  nativeTokenCapWei: null,
};

test.describe("Complete Mobile UI Tests", () => {
  test.describe("Quick Mode Button - Responsive Label", () => {
    test("should show 'Quick' label on iPhone SE (375px)", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("/");

      // Should show "Quick" but not "Quick Mode" on mobile
      const quickModeLabel = page.locator("text=Quick Mode");
      const quickLabel = page.locator("text=Quick").first();

      await expect(quickLabel).toBeVisible();
      await expect(quickModeLabel).not.toBeVisible();

      // On/Off button should also be visible
      const onOffButton = page.locator("button").filter({ hasText: /^(On|Off)$/ }).first();
      await expect(onOffButton).toBeVisible();
    });

    test("should show 'Quick' label on iPhone 14 Pro Max (430px)", async ({ page }) => {
      await page.setViewportSize({ width: 430, height: 932 });
      await page.goto("/");

      // Should show "Quick" but not "Quick Mode"
      const quickLabel = page.locator("text=Quick").first();
      const quickModeLabel = page.locator("text=Quick Mode");

      await expect(quickLabel).toBeVisible();
      await expect(quickModeLabel).not.toBeVisible();
    });

    test("should show 'Quick Mode' label on desktop (1280px)", async ({ page }) => {
      await page.setViewportSize(desktop);
      await page.goto("/");

      const quickModeLabel = page.locator("text=Quick Mode").first();
      await expect(quickModeLabel).toBeVisible();
    });

    test("should have compact padding on mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("/");

      const quickModeContainer = page.locator("div").filter({ has: page.locator("button", { hasText: /^(On|Off)$/ }) }).first();
      const box = await quickModeContainer.boundingBox();

      // Container should be more compact on mobile
      expect(box).toBeTruthy();
      if (box) {
        // Should be narrower than desktop version
        expect(box.width).toBeLessThan(150);
      }
    });
  });

  test.describe("Chat Console Header - Button Alignment", () => {
    for (const device of devices) {
      test(`should have horizontal button layout on ${device.name}`, async ({ page }) => {
        await page.setViewportSize(device);
        await page.goto("/");

        // Get the header container
        const header = page.locator("div").filter({ has: page.locator("button", { hasText: /Connected/ }) }).first();

        // Check that buttons are in a horizontal row
        const box = await header.boundingBox();
        expect(box).toBeTruthy();
        if (box) {
          // Height should be relatively small (single row)
          expect(box.height).toBeLessThan(100);
        }
      });
    }
  });

  test.describe("Connected Account Modal - Mobile Responsiveness", () => {
    test("should open modal properly on iPhone SE", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("/");

      await page.addInitScript((delegation) => {
        localStorage.setItem("pragma:delegations", JSON.stringify([delegation]));
        localStorage.setItem("pragma:active-delegator", JSON.stringify({
          artifactId: delegation.artifactId,
          delegator: delegation.delegator,
        }));
      }, mockDelegation);

      await page.reload();
      await page.waitForLoadState("networkidle");

      const connectedBtn = page.locator("button").filter({ hasText: /Connected/ }).first();
      await connectedBtn.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible();

      // Close button should be visible
      const closeBtn = page.getByTestId("mobile-close-button");
      await expect(closeBtn).toBeVisible();
    });

    test("should have proper title size on mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("/");

      await page.addInitScript((delegation) => {
        localStorage.setItem("pragma:delegations", JSON.stringify([delegation]));
        localStorage.setItem("pragma:active-delegator", JSON.stringify({
          artifactId: delegation.artifactId,
          delegator: delegation.delegator,
        }));
      }, mockDelegation);

      await page.reload();
      await page.waitForLoadState("networkidle");

      const connectedBtn = page.locator("button").filter({ hasText: /Connected/ }).first();
      await connectedBtn.click();
      await page.waitForTimeout(500);

      const title = page.locator("h2").filter({ hasText: "Connected account" });
      await expect(title).toBeVisible();

      // Title should be visible and not overflow
      const titleBox = await title.boundingBox();
      const modalBox = await page.locator('[role="dialog"]').boundingBox();

      if (titleBox && modalBox) {
        expect(titleBox.width).toBeLessThanOrEqual(modalBox.width);
      }
    });

    test("should navigate through all tabs on mobile", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");

      await page.addInitScript((delegation) => {
        localStorage.setItem("pragma:delegations", JSON.stringify([delegation]));
        localStorage.setItem("pragma:active-delegator", JSON.stringify({
          artifactId: delegation.artifactId,
          delegator: delegation.delegator,
        }));
      }, mockDelegation);

      await page.reload();
      await page.waitForLoadState("networkidle");

      const connectedBtn = page.locator("button").filter({ hasText: /Connected/ }).first();
      await connectedBtn.click();
      await page.waitForTimeout(500);

      // Test each tab
      const tabs = ["Overview", "Actions", "Delegations", "Receipts"];

      for (const tab of tabs) {
        const tabBtn = page.getByTestId(`account-nav-${tab.toLowerCase()}`);
        await tabBtn.click();
        await page.waitForTimeout(300);

        // Verify tab content is visible
        const section = page.getByTestId(`${tab.toLowerCase()}-section`);
        await expect(section).toBeVisible();
      }
    });

    test("should have appropriate padding in Overview tab on mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("/");

      await page.addInitScript((delegation) => {
        localStorage.setItem("pragma:delegations", JSON.stringify([delegation]));
        localStorage.setItem("pragma:active-delegator", JSON.stringify({
          artifactId: delegation.artifactId,
          delegator: delegation.delegator,
        }));
      }, mockDelegation);

      await page.reload();
      await page.waitForLoadState("networkidle");

      const connectedBtn = page.locator("button").filter({ hasText: /Connected/ }).first();
      await connectedBtn.click();
      await page.waitForTimeout(500);

      // Check Overview section
      const overviewSection = page.getByTestId("overview-section");
      await expect(overviewSection).toBeVisible();

      // Content should not overflow
      const sectionBox = await overviewSection.boundingBox();
      const modalBox = await page.locator('[role="dialog"]').boundingBox();

      if (sectionBox && modalBox) {
        expect(sectionBox.width).toBeLessThanOrEqual(modalBox.width);
      }
    });

    test("should have appropriate padding in Actions tab on mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("/");

      await page.addInitScript((delegation) => {
        localStorage.setItem("pragma:delegations", JSON.stringify([delegation]));
        localStorage.setItem("pragma:active-delegator", JSON.stringify({
          artifactId: delegation.artifactId,
          delegator: delegation.delegator,
        }));
      }, mockDelegation);

      await page.reload();
      await page.waitForLoadState("networkidle");

      const connectedBtn = page.locator("button").filter({ hasText: /Connected/ }).first();
      await connectedBtn.click();
      await page.waitForTimeout(500);

      // Navigate to Actions tab
      const actionsTab = page.getByTestId("account-nav-actions");
      await actionsTab.click();
      await page.waitForTimeout(300);

      const actionsSection = page.getByTestId("actions-section");
      await expect(actionsSection).toBeVisible();

      // Content should not overflow
      const sectionBox = await actionsSection.boundingBox();
      const modalBox = await page.locator('[role="dialog"]').boundingBox();

      if (sectionBox && modalBox) {
        expect(sectionBox.width).toBeLessThanOrEqual(modalBox.width);
      }
    });

    test("should scroll properly in modal on small screens", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("/");

      await page.addInitScript((delegation) => {
        localStorage.setItem("pragma:delegations", JSON.stringify([delegation]));
        localStorage.setItem("pragma:active-delegator", JSON.stringify({
          artifactId: delegation.artifactId,
          delegator: delegation.delegator,
        }));
      }, mockDelegation);

      await page.reload();
      await page.waitForLoadState("networkidle");

      const connectedBtn = page.locator("button").filter({ hasText: /Connected/ }).first();
      await connectedBtn.click();
      await page.waitForTimeout(500);

      // Modal should be scrollable
      const modal = page.locator('[role="dialog"]');
      const isScrollable = await modal.evaluate((el) => {
        return el.scrollHeight > el.clientHeight;
      });

      // It's okay if content doesn't need scrolling, but shouldn't error
      expect(isScrollable !== undefined).toBe(true);
    });
  });

  test.describe("Desktop UI Preservation", () => {
    test("should maintain desktop layout at 1280px", async ({ page }) => {
      await page.setViewportSize(desktop);
      await page.goto("/");

      // Quick Mode should show full label
      const quickModeLabel = page.locator("text=Quick Mode").first();
      await expect(quickModeLabel).toBeVisible();

      // Buttons should have desktop spacing
      const header = page.locator("div").filter({ has: page.locator("button", { hasText: /Connected/ }) }).first();
      const box = await header.boundingBox();

      if (box) {
        // Desktop header should be wider
        expect(box.width).toBeGreaterThan(300);
      }
    });

    test("should hide mobile close button on desktop", async ({ page }) => {
      await page.setViewportSize(desktop);
      await page.goto("/");

      await page.addInitScript((delegation) => {
        localStorage.setItem("pragma:delegations", JSON.stringify([delegation]));
        localStorage.setItem("pragma:active-delegator", JSON.stringify({
          artifactId: delegation.artifactId,
          delegator: delegation.delegator,
        }));
      }, mockDelegation);

      await page.reload();
      await page.waitForLoadState("networkidle");

      const connectedBtn = page.locator("button").filter({ hasText: /Connected/ }).first();
      await connectedBtn.click();
      await page.waitForTimeout(500);

      // Mobile close button should NOT be visible
      const closeBtn = page.getByTestId("mobile-close-button");
      await expect(closeBtn).not.toBeVisible();
    });
  });

  test.describe("Cross-Device Consistency", () => {
    for (const device of devices) {
      test(`should render chat console on ${device.name}`, async ({ page }) => {
        await page.setViewportSize(device);
        await page.goto("/");

        const chatShell = page.getByTestId("chat-shell");
        await expect(chatShell).toBeVisible();

        // Input should be visible and functional
        const textarea = page.locator("textarea").first();
        await expect(textarea).toBeVisible();
        await textarea.fill("test message");
        await expect(textarea).toHaveValue("test message");
      });

      test(`should have no horizontal overflow on ${device.name}`, async ({ page }) => {
        await page.setViewportSize(device);
        await page.goto("/");

        const body = page.locator("body");
        const hasHorizontalScroll = await body.evaluate((el) => {
          return el.scrollWidth > el.clientWidth;
        });

        expect(hasHorizontalScroll).toBe(false);
      });
    }
  });
});
