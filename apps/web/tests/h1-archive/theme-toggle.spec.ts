import { expect, test } from "@playwright/test";

test.describe("Theme toggle", () => {
  test("switches between light and dark modes", async ({ page }) => {
    await page.goto("/");

    const toggle = page.getByTestId("theme-toggle");
    const chatShell = page.getByTestId("chat-shell");

    await expect(toggle).toBeVisible();
    await expect(chatShell).toBeVisible();

    const isDark = async () =>
      page.evaluate(() => document.documentElement.classList.contains("dark"));
    const backgroundToken = async () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--background").trim()
      );
    const chatShellBackground = async () =>
      chatShell.evaluate((element) => getComputedStyle(element).backgroundColor);

    await expect.poll(isDark).toBeFalsy();
    await expect.poll(backgroundToken).toBe("259 25% 96%");
    await expect.poll(chatShellBackground).not.toBe("");
    const initialShellBackground = await chatShellBackground();

    await toggle.click();
    await expect.poll(isDark).toBeTruthy();
    await expect.poll(backgroundToken).toBe("225 17% 8%");
    await expect.poll(chatShellBackground).not.toBe(initialShellBackground);

    await toggle.click();
    await expect.poll(isDark).toBeFalsy();
    await expect.poll(backgroundToken).toBe("259 25% 96%");
    await expect.poll(chatShellBackground).toBe(initialShellBackground);
  });
});
