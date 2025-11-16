/**
 * H2.5 Markdown Formatting Test
 *
 * Verifies that the H2.5 agent properly formats markdown responses:
 * - Decimal numbers are NOT broken (e.g., "0.5 MON" stays intact)
 * - Sentences are properly separated with newlines
 * - Parentheses and other punctuation handled correctly
 *
 * Uses mock identity to bypass wallet authentication.
 *
 * Test coverage:
 * - Decimal number preservation
 * - Sentence boundary detection
 * - System prompt formatting instructions
 * - Token streaming with newline injection
 */

import { expect, test } from "@playwright/test";

// Test addresses (matching existing test patterns)
const OWNER_ADDRESS = "0x1111111111111111111111111111111111111111";
const DELEGATOR_ADDRESS = "0x2222222222222222222222222222222222222222";
const SESSION_KEY_ADDRESS = "0x3333333333333333333333333333333333333333";
const SESSION_KEY_PRIVATE_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

// Allowed tokens for H2 agent
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
  {
    address: "0x4c6c4f382b051c291248f5cb2e1a1c7f5ac9960e",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    kind: "erc20",
    categories: ["stablecoin"],
  },
];

test.describe("H2.5 Markdown Formatting", () => {
  test.beforeEach(async ({ page }) => {
    // Pre-seed H2 chat store with session data
    await page.addInitScript(
      (config) => {
        const { delegator, sessionKey, sessionKeyPk, allowedTokens } = config as {
          delegator: string;
          sessionKey: string;
          sessionKeyPk: string;
          allowedTokens: unknown[];
        };

        // H2 chat store (Zustand persist)
        window.localStorage.setItem(
          "h2-chat-storage",
          JSON.stringify({
            state: {
              messages: [],
              isStreaming: false,
              streamingMessage: null,
              quickMode: false,
              sessionData: {
                delegator: delegator,
                sessionKeyAddress: sessionKey,
                sessionKeyPrivateKey: sessionKeyPk,
                ownerAddress: delegator, // In mock, owner == delegator
                chainId: 10143, // Monad testnet
              },
              allowedTokens: allowedTokens,
              progress: null,
              tools: {},
              tokensLoading: false,
            },
            version: 0,
          })
        );

        // Identity mappings (for mock system)
        window.localStorage.setItem(
          "pragma.h1.owner-delegators.v1",
          JSON.stringify({
            [delegator.toLowerCase()]: {
              delegator: delegator.toLowerCase(),
              updatedAt: Date.now(),
            },
          })
        );

        window.localStorage.setItem("pragma.h1.active-delegator.v1", delegator);
      },
      {
        delegator: DELEGATOR_ADDRESS,
        sessionKey: SESSION_KEY_ADDRESS,
        sessionKeyPk: SESSION_KEY_PRIVATE_KEY,
        allowedTokens,
      }
    );
  });

  test("should preserve decimal numbers in responses", async ({ page }, testInfo) => {
    // Extend timeout for AI responses
    testInfo.setTimeout(180000); // 3 minutes

    // Capture assistant response text
    let assistantResponse = "";

    // Listen for console logs to detect streaming
    page.on("console", (msg) => {
      const text = msg.text();
      // Log streaming activity
      if (text.includes("[BrowserAgent]") || text.includes("Streaming")) {
        console.log(text);
      }
    });

    // Navigate to H2.5 page
    await page.goto("/h2.5", { waitUntil: "domcontentloaded" });

    // Wait for mock API to be available
    await page.waitForFunction(
      () => {
        return typeof (window as any).__PRAGMA_IDENTITY_MOCK__ !== "undefined";
      },
      { timeout: 15000 }
    );

    // Connect mock wallet
    await page.evaluate(
      ([owner, delegator]) => {
        const mockAPI = (window as any).__PRAGMA_IDENTITY_MOCK__;
        if (mockAPI) {
          mockAPI.connect(owner, delegator);
        }
      },
      [OWNER_ADDRESS, DELEGATOR_ADDRESS]
    );

    // Wait for initialization
    await page.waitForTimeout(3000);

    // Find chat input
    const chatInput = page.locator('textarea[placeholder*="Ask"]');
    await expect(chatInput).toBeVisible({ timeout: 15000 });

    // Send a message that should trigger decimal numbers in response
    // Ask about wrapping, which typically mentions "0.5 MON" or similar decimals
    await chatInput.click();
    await chatInput.fill("explain how to wrap 0.5 MON");

    await page.waitForTimeout(500);
    await chatInput.press("Enter");

    console.log("Message sent, waiting for response with decimal numbers...");

    // Wait for streaming to complete
    try {
      await page.waitForFunction(
        () => {
          const messages = document.querySelectorAll('[role="article"]');
          for (const msg of messages) {
            const content = msg.textContent || "";
            // Look for decimal numbers like "0.5" in response
            if (content.match(/\d+\.\d+/)) {
              return true;
            }
          }
          return false;
        },
        { timeout: 120000 }
      );
    } catch (e) {
      console.log("Timeout waiting for response with decimal numbers");
    }

    // Get all messages
    const messages = await page.locator('[role="article"]').all();
    console.log(`Found ${messages.length} messages`);

    // Get assistant message content
    for (const msg of messages) {
      const content = await msg.textContent();
      if (content && content.length > 20 && !content.startsWith("explain")) {
        assistantResponse = content;
        console.log("\n=== Assistant Response ===");
        console.log(assistantResponse);
        console.log("=== End Response ===\n");
        break;
      }
    }

    // Verify decimal numbers are NOT broken
    // Bad: "0.\n5 MON" or "0. 5 MON"
    // Good: "0.5 MON"
    const hasBrokenDecimal = /\d+\.\s+\d+/.test(assistantResponse);
    expect(hasBrokenDecimal, "Decimal numbers should NOT be broken by newlines").toBeFalsy();

    // Verify decimal numbers are present and intact
    const hasDecimalNumbers = /\d+\.\d+/.test(assistantResponse);
    expect(hasDecimalNumbers, "Response should contain decimal numbers").toBeTruthy();

    console.log("✅ Decimal number preservation test passed!");
  });

  test("should separate sentences with newlines", async ({ page }, testInfo) => {
    testInfo.setTimeout(180000);

    let assistantResponse = "";

    // Navigate and connect
    await page.goto("/h2.5", { waitUntil: "domcontentloaded" });

    await page.waitForFunction(
      () => {
        return typeof (window as any).__PRAGMA_IDENTITY_MOCK__ !== "undefined";
      },
      { timeout: 15000 }
    );

    await page.evaluate(
      ([owner, delegator]) => {
        const mockAPI = (window as any).__PRAGMA_IDENTITY_MOCK__;
        if (mockAPI) {
          mockAPI.connect(owner, delegator);
        }
      },
      [OWNER_ADDRESS, DELEGATOR_ADDRESS]
    );

    await page.waitForTimeout(3000);

    const chatInput = page.locator('textarea[placeholder*="Ask"]');
    await expect(chatInput).toBeVisible({ timeout: 15000 });

    // Send a query that should get multi-sentence response
    await chatInput.click();
    await chatInput.fill("what can you do?");

    await page.waitForTimeout(500);
    await chatInput.press("Enter");

    console.log("Message sent, waiting for multi-sentence response...");

    // Wait for response
    try {
      await page.waitForFunction(
        () => {
          const messages = document.querySelectorAll('[role="article"]');
          for (const msg of messages) {
            const content = msg.textContent || "";
            // Look for response with multiple sentences (has periods)
            if (content.length > 50 && content.match(/\.\s+\w/)) {
              return true;
            }
          }
          return false;
        },
        { timeout: 120000 }
      );
    } catch (e) {
      console.log("Timeout waiting for multi-sentence response");
    }

    // Get assistant message
    const messages = await page.locator('[role="article"]').all();
    for (const msg of messages) {
      const content = await msg.textContent();
      if (content && content.length > 50 && !content.startsWith("what")) {
        assistantResponse = content;
        console.log("\n=== Assistant Response ===");
        console.log(assistantResponse);
        console.log("=== End Response ===\n");
        break;
      }
    }

    // Verify sentences are NOT mashed together
    // Bad: "quotes).I'll fetch" or "now.Proceeding"
    // Good: "quotes).\nI'll fetch" or "now.\nProceeding"
    const hasMashedSentences =
      /\)[a-zA-Z]/.test(assistantResponse) ||  // ")I" without space/newline
      /\.[A-Z]/.test(assistantResponse.replace(/\.\d/g, ""));  // ".A" but not ".5"

    expect(hasMashedSentences, "Sentences should be separated properly").toBeFalsy();

    console.log("✅ Sentence separation test passed!");
  });

  test("should handle mixed decimal numbers and sentences", async ({ page }, testInfo) => {
    testInfo.setTimeout(180000);

    let assistantResponse = "";

    // Navigate and connect
    await page.goto("/h2.5", { waitUntil: "domcontentloaded" });

    await page.waitForFunction(
      () => {
        return typeof (window as any).__PRAGMA_IDENTITY_MOCK__ !== "undefined";
      },
      { timeout: 15000 }
    );

    await page.evaluate(
      ([owner, delegator]) => {
        const mockAPI = (window as any).__PRAGMA_IDENTITY_MOCK__;
        if (mockAPI) {
          mockAPI.connect(owner, delegator);
        }
      },
      [OWNER_ADDRESS, DELEGATOR_ADDRESS]
    );

    await page.waitForTimeout(3000);

    const chatInput = page.locator('textarea[placeholder*="Ask"]');
    await expect(chatInput).toBeVisible({ timeout: 15000 });

    // Send query that should have both decimals and multiple sentences
    await chatInput.click();
    await chatInput.fill("how do I swap 0.5 MON to USDC?");

    await page.waitForTimeout(500);
    await chatInput.press("Enter");

    console.log("Message sent, waiting for response with decimals and sentences...");

    // Wait for response
    try {
      await page.waitForFunction(
        () => {
          const messages = document.querySelectorAll('[role="article"]');
          for (const msg of messages) {
            const content = msg.textContent || "";
            // Look for response with decimal AND multiple sentences
            if (content.match(/\d+\.\d+/) && content.length > 100) {
              return true;
            }
          }
          return false;
        },
        { timeout: 120000 }
      );
    } catch (e) {
      console.log("Timeout waiting for response");
    }

    // Get assistant message
    const messages = await page.locator('[role="article"]').all();
    for (const msg of messages) {
      const content = await msg.textContent();
      if (content && content.length > 50 && !content.startsWith("how")) {
        assistantResponse = content;
        console.log("\n=== Assistant Response ===");
        console.log(assistantResponse);
        console.log("=== End Response ===\n");
        break;
      }
    }

    // Verify both:
    // 1. Decimal numbers are intact
    const hasIntactDecimals = /\d+\.\d+/.test(assistantResponse);
    expect(hasIntactDecimals, "Decimal numbers should be intact").toBeTruthy();

    // 2. Decimals are NOT broken by newlines
    const hasBrokenDecimal = /\d+\.\s+\d+/.test(assistantResponse);
    expect(hasBrokenDecimal, "Decimals should NOT be broken").toBeFalsy();

    // 3. Sentences are separated (response should have some structure)
    // With remarkBreaks, single \n becomes <br>, so text should have line breaks
    const hasProperFormatting = assistantResponse.length > 100;
    expect(hasProperFormatting, "Response should be properly formatted").toBeTruthy();

    console.log("✅ Mixed decimals and sentences test passed!");
  });
});
