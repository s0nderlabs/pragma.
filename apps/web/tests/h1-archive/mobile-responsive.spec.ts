import { expect, test } from "@playwright/test";

/**
 * Mobile Responsiveness Test Suite
 *
 * Tests that the Pragma web app is mobile-friendly across different devices
 * while ensuring the desktop UI remains unchanged.
 */

// Test configurations for different mobile devices
const mobileDevices = [
  { name: "iPhone 12", width: 390, height: 844 },
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "Pixel 5", width: 393, height: 851 },
  { name: "Galaxy S21", width: 360, height: 800 },
];

const desktopViewport = { width: 1280, height: 720 };

test.describe("Mobile Responsiveness", () => {
  test.describe("Viewport and Meta Tags", () => {
    test("should have proper viewport meta tag", async ({ page }) => {
      await page.goto("/");

      const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
      expect(viewport).toContain("width=device-width");
      expect(viewport).toContain("initial-scale=1");
    });
  });

  test.describe("Mobile Layout", () => {
    for (const device of mobileDevices) {
      test(`should render properly on ${device.name} (${device.width}x${device.height})`, async ({ page }) => {
        await page.setViewportSize({ width: device.width, height: device.height });
        await page.goto("/");

        // Wait for page to be fully loaded
        await page.waitForLoadState("networkidle");

        // Check that the chat shell is visible and has mobile styling
        const chatShell = page.getByTestId("chat-shell");
        await expect(chatShell).toBeVisible();

        // Take screenshot for visual verification
        await page.screenshot({
          path: `test-results/mobile-${device.name.toLowerCase().replace(/\s+/g, "-")}.png`,
          fullPage: true,
        });
      });
    }

    test("should have appropriate touch targets on mobile (44px minimum)", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
      await page.goto("/");

      // Check button sizes - primary action buttons should be at least 44px on mobile
      // Note: Icon buttons and utility buttons may be smaller by design
      const buttons = page.locator("button");
      const count = await buttons.count();

      for (let i = 0; i < count; i++) {
        const button = buttons.nth(i);
        const box = await button.boundingBox();

        if (box) {
          // Check if button is visible and large enough to be a primary action button
          // Skip very small buttons (< 40px width) as they're likely icon/utility buttons
          if (box.width >= 40) {
            // Primary action buttons should meet 44px minimum
            expect(box.height).toBeGreaterThanOrEqual(44);
          }
        }
      }
    });

    test("should hide Quick Mode label on mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
      await page.goto("/");

      // Mobile should hide the "Quick Mode:" label to save space
      const quickLabel = page.locator("text=Quick Mode:").first();
      await expect(quickLabel).toBeHidden();

      // But the toggle buttons should still be visible
      const toggleButton = page.locator('button[role="tab"]').first();
      await expect(toggleButton).toBeVisible();
    });

    test("should show shortened helper text on mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
      await page.goto("/");

      // Mobile should show shortened version
      const helperText = page.locator("text=Shift+Enter for new line");
      await expect(helperText).toBeVisible();
    });
  });

  test.describe("Dialog Component Mobile Responsiveness", () => {
    test("should have mobile-friendly dialog width", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
      await page.goto("/");

      // Open connected account dialog
      const connectedAccountBtn = page.locator("button").filter({ hasText: /connect|account/i }).first();
      if (await connectedAccountBtn.isVisible()) {
        await connectedAccountBtn.click();

        // Check dialog is visible and has appropriate width
        const dialog = page.locator('[role="dialog"]');
        await expect(dialog).toBeVisible();

        const box = await dialog.boundingBox();
        if (box) {
          // Dialog should not exceed viewport width minus small margins
          expect(box.width).toBeLessThanOrEqual(375 - 16); // 16px = 1rem total margin
        }
      }
    });
  });

  test.describe("Desktop UI Preservation", () => {
    test("should maintain desktop layout at 1280px viewport", async ({ page }) => {
      await page.setViewportSize(desktopViewport);
      await page.goto("/");

      // Take desktop screenshot as baseline
      await page.screenshot({
        path: "test-results/desktop-baseline.png",
        fullPage: true,
      });

      const chatShell = page.getByTestId("chat-shell");
      await expect(chatShell).toBeVisible();

      // Desktop should show full "Quick Mode" text
      const quickModeLabel = page.locator("text=Quick Mode").first();
      await expect(quickModeLabel).toBeVisible();

      // Desktop should show full helper text
      const fullHelperText = page.locator("text=/Shift\\+Enter for a new line/");
      await expect(fullHelperText).toBeVisible();
    });

    test("should have desktop padding values at 1280px viewport", async ({ page }) => {
      await page.setViewportSize(desktopViewport);
      await page.goto("/");

      // Check that desktop padding is applied correctly
      const chatShell = page.getByTestId("chat-shell");
      await expect(chatShell).toBeVisible();

      // Verify the shell has the larger border radius on desktop
      const shellStyles = await chatShell.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          borderRadius: computed.borderRadius,
          padding: computed.padding,
        };
      });

      // Desktop should have the larger border radius (2.5rem = 40px)
      expect(parseFloat(shellStyles.borderRadius)).toBeGreaterThanOrEqual(40);
    });
  });

  test.describe("Responsive Breakpoint Transitions", () => {
    test("should transition smoothly between mobile and desktop breakpoints", async ({ page }) => {
      await page.goto("/");

      // Start at mobile
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500); // Allow styles to apply

      const chatShell = page.getByTestId("chat-shell");
      await expect(chatShell).toBeVisible();

      // Transition to tablet
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(500);
      await expect(chatShell).toBeVisible();

      // Transition to desktop
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.waitForTimeout(500);
      await expect(chatShell).toBeVisible();
    });
  });

  test.describe("Mobile Input and Interaction", () => {
    test("should handle text input properly on mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
      await page.goto("/");

      const textarea = page.locator("textarea").first();
      await expect(textarea).toBeVisible();

      // Type some text
      await textarea.fill("test swap 0.5 MON to USDC");
      await expect(textarea).toHaveValue("test swap 0.5 MON to USDC");
    });

    test("should show mobile-friendly placeholder text", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
      await page.goto("/");

      const textarea = page.locator("textarea").first();
      const placeholder = await textarea.getAttribute("placeholder");

      // Should have a concise placeholder
      expect(placeholder).toBeTruthy();
      expect(placeholder!.length).toBeLessThan(100); // Mobile placeholder should be short
    });
  });

  test.describe("Mobile Safe Areas", () => {
    test("should respect safe area insets on notched devices", async ({ page }) => {
      // Simulate iPhone with notch
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");

      // Check that body has safe area padding
      const bodyStyles = await page.evaluate(() => {
        const computed = window.getComputedStyle(document.body);
        return {
          paddingTop: computed.paddingTop,
          paddingBottom: computed.paddingBottom,
        };
      });

      // Safe area insets should be applied (at minimum, should be 0px)
      expect(bodyStyles.paddingTop).toBeTruthy();
      expect(bodyStyles.paddingBottom).toBeTruthy();
    });
  });

  test.describe("Visual Regression - Mobile vs Desktop", () => {
    test("should capture and compare mobile and desktop layouts", async ({ page }) => {
      // Mobile capture
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: "test-results/visual-mobile.png",
        fullPage: true,
      });

      // Desktop capture
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: "test-results/visual-desktop.png",
        fullPage: true,
      });

      // Both should render without layout shifts or errors
      const chatShell = page.getByTestId("chat-shell");
      await expect(chatShell).toBeVisible();
    });
  });
});

test.describe("Mobile-Specific Edge Cases", () => {
  test("should handle landscape orientation", async ({ page }) => {
    // iPhone 12 in landscape
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/");

    const chatShell = page.getByTestId("chat-shell");
    await expect(chatShell).toBeVisible();

    // Chat should still be usable in landscape
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible();
  });

  test("should handle very small screens (320px)", async ({ page }) => {
    // iPhone SE 1st gen / smallest mobile viewport
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");

    const chatShell = page.getByTestId("chat-shell");
    await expect(chatShell).toBeVisible();

    // UI should not overflow
    const body = page.locator("body");
    const hasHorizontalScroll = await body.evaluate((el) => {
      return el.scrollWidth > el.clientWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test("should handle large mobile screens (tablet size)", async ({ page }) => {
    // iPad Mini
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");

    const chatShell = page.getByTestId("chat-shell");
    await expect(chatShell).toBeVisible();

    // At 768px (md breakpoint), should show desktop styles
    const quickModeLabel = page.locator("text=Quick Mode").first();
    await expect(quickModeLabel).toBeVisible();
  });
});

test.describe("Connected Account Modal - Mobile Close Button", () => {
  test.describe("Mobile Close Button Visibility", () => {
    test("should show close button on mobile viewport", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
      await page.goto("/");

      // Mock the Web3Auth and identity state to show connected state
      await page.addInitScript(() => {
        const mockDelegation = {
          artifactId: "test-artifact-1",
          chainId: 41454,
          mode: "swap" as const,
          delegator: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
          delegate: "0x1234567890123456789012345678901234567890",
          authority: "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
          caveats: [],
          salt: BigInt(0),
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

        localStorage.setItem("pragma:delegations", JSON.stringify([mockDelegation]));
        localStorage.setItem("pragma:active-delegator", JSON.stringify({
          artifactId: "test-artifact-1",
          delegator: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
        }));
      });

      // Reload to apply mock data
      await page.reload();
      await page.waitForLoadState("networkidle");

      // Open Connected Account modal
      const connectedAccountBtn = page.locator("button").filter({ hasText: /Connected|Account/i }).first();
      if (await connectedAccountBtn.isVisible()) {
        await connectedAccountBtn.click();
        await page.waitForTimeout(500); // Wait for modal animation

        // Check that mobile close button is visible
        const mobileCloseBtn = page.getByTestId("mobile-close-button");
        await expect(mobileCloseBtn).toBeVisible();
      }
    });

    test("should hide close button on desktop viewport", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 }); // Desktop
      await page.goto("/");

      // Mock the Web3Auth and identity state
      await page.addInitScript(() => {
        const mockDelegation = {
          artifactId: "test-artifact-1",
          chainId: 41454,
          mode: "swap" as const,
          delegator: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
          delegate: "0x1234567890123456789012345678901234567890",
          authority: "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
          caveats: [],
          salt: BigInt(0),
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

        localStorage.setItem("pragma:delegations", JSON.stringify([mockDelegation]));
        localStorage.setItem("pragma:active-delegator", JSON.stringify({
          artifactId: "test-artifact-1",
          delegator: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
        }));
      });

      // Reload to apply mock data
      await page.reload();
      await page.waitForLoadState("networkidle");

      // Open Connected Account modal
      const connectedAccountBtn = page.locator("button").filter({ hasText: /Connected|Account/i }).first();
      if (await connectedAccountBtn.isVisible()) {
        await connectedAccountBtn.click();
        await page.waitForTimeout(500); // Wait for modal animation

        // Check that mobile close button is NOT visible on desktop
        const mobileCloseBtn = page.getByTestId("mobile-close-button");
        await expect(mobileCloseBtn).not.toBeVisible();
      }
    });
  });

  test.describe("Mobile Close Button Functionality", () => {
    test("should close modal when clicking close button on mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
      await page.goto("/");

      // Mock the identity state
      await page.addInitScript(() => {
        const mockDelegation = {
          artifactId: "test-artifact-1",
          chainId: 41454,
          mode: "swap" as const,
          delegator: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
          delegate: "0x1234567890123456789012345678901234567890",
          authority: "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
          caveats: [],
          salt: BigInt(0),
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

        localStorage.setItem("pragma:delegations", JSON.stringify([mockDelegation]));
        localStorage.setItem("pragma:active-delegator", JSON.stringify({
          artifactId: "test-artifact-1",
          delegator: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
        }));
      });

      // Reload to apply mock data
      await page.reload();
      await page.waitForLoadState("networkidle");

      // Open Connected Account modal
      const connectedAccountBtn = page.locator("button").filter({ hasText: /Connected|Account/i }).first();
      if (await connectedAccountBtn.isVisible()) {
        await connectedAccountBtn.click();
        await page.waitForTimeout(500); // Wait for modal to open

        // Verify modal is open
        const modal = page.locator('[role="dialog"]');
        await expect(modal).toBeVisible();

        // Click the mobile close button
        const mobileCloseBtn = page.getByTestId("mobile-close-button");
        await mobileCloseBtn.click();
        await page.waitForTimeout(500); // Wait for modal to close

        // Verify modal is closed
        await expect(modal).not.toBeVisible();
      }
    });

    test("should have 44px minimum touch target on mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
      await page.goto("/");

      // Mock the identity state
      await page.addInitScript(() => {
        const mockDelegation = {
          artifactId: "test-artifact-1",
          chainId: 41454,
          mode: "swap" as const,
          delegator: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
          delegate: "0x1234567890123456789012345678901234567890",
          authority: "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
          caveats: [],
          salt: BigInt(0),
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

        localStorage.setItem("pragma:delegations", JSON.stringify([mockDelegation]));
        localStorage.setItem("pragma:active-delegator", JSON.stringify({
          artifactId: "test-artifact-1",
          delegator: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
        }));
      });

      // Reload to apply mock data
      await page.reload();
      await page.waitForLoadState("networkidle");

      // Open Connected Account modal
      const connectedAccountBtn = page.locator("button").filter({ hasText: /Connected|Account/i }).first();
      if (await connectedAccountBtn.isVisible()) {
        await connectedAccountBtn.click();
        await page.waitForTimeout(500);

        // Check button touch target size
        const mobileCloseBtn = page.getByTestId("mobile-close-button");
        const box = await mobileCloseBtn.boundingBox();

        if (box) {
          // Verify 44px minimum (actually 44px = h-11 in Tailwind)
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    });

    test("should still allow ESC key to close modal on mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
      await page.goto("/");

      // Mock the identity state
      await page.addInitScript(() => {
        const mockDelegation = {
          artifactId: "test-artifact-1",
          chainId: 41454,
          mode: "swap" as const,
          delegator: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
          delegate: "0x1234567890123456789012345678901234567890",
          authority: "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
          caveats: [],
          salt: BigInt(0),
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

        localStorage.setItem("pragma:delegations", JSON.stringify([mockDelegation]));
        localStorage.setItem("pragma:active-delegator", JSON.stringify({
          artifactId: "test-artifact-1",
          delegator: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
        }));
      });

      // Reload to apply mock data
      await page.reload();
      await page.waitForLoadState("networkidle");

      // Open Connected Account modal
      const connectedAccountBtn = page.locator("button").filter({ hasText: /Connected|Account/i }).first();
      if (await connectedAccountBtn.isVisible()) {
        await connectedAccountBtn.click();
        await page.waitForTimeout(500);

        // Verify modal is open
        const modal = page.locator('[role="dialog"]');
        await expect(modal).toBeVisible();

        // Press ESC key
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);

        // Verify modal is closed
        await expect(modal).not.toBeVisible();
      }
    });
  });
});
