import { expect, test } from "@playwright/test";

const TOKEN_FIXTURE_RESPONSE = [
  {
    address: "0x0000000000000000000000000000000000000000",
    symbol: "MON",
    name: "Monad",
    decimals: 18,
    categories: ["fallback"],
  },
  {
    address: "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701",
    symbol: "WMON",
    name: "Wrapped Monad",
    decimals: 18,
    categories: ["fallback"],
  },
];

test.describe("Onboarding surface", () => {
  test("loads fallback tokens without Monorail availability", async ({ page }) => {
    await page.route(/\/tokens(?:\/.*)?$/, async (route) => {
      if (route.request().url().includes("monorail")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(TOKEN_FIXTURE_RESPONSE),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Chat console" })).toBeVisible();

    await expect(page.getByText(/Failed to fetch/i)).toHaveCount(0);

    await expect(
      page.getByText(
        /Open the Connected account menu to configure your delegation/i,
      ),
    ).toBeVisible();

    await expect(
      page.getByPlaceholder(
        /Ask Pragma to swap, transfer, wrap, or explain capabilities/i,
      ),
    ).toBeVisible();
  });
});
