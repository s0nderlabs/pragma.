import { test, expect } from "@playwright/test";

/**
 * Comprehensive Agent Insight Test Suite
 *
 * Purpose: Diagnose response truncation issue where "what is pragma?"
 * shows only last sentence instead of full description.
 *
 * Tests verify:
 * 1. Backend API returns complete response
 * 2. Frontend parses complete response correctly
 * 3. UI displays complete response to user
 */

test.describe("Agent Insight - Response Completeness", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app and wait for ready state
    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");
  });

  // NOTE: These tests require live OpenAI API access and may be flaky
  // They depend on external service availability and response times
  // Skipping to avoid false failures in CI/CD
  test.skip("API returns complete response for 'what is pragma?'", async ({ page }) => {
    console.log("\n🧪 TEST 1: Direct API Response Verification\n");

    // Intercept API call and capture raw response
    const apiResponses: string[] = [];

    page.on("response", async (response) => {
      if (response.url().includes("/api/chat/respond")) {
        console.log("📡 API Response intercepted");
        const body = await response.text();
        apiResponses.push(body);
        console.log("📦 Raw API Response Body:");
        console.log(body);
        console.log("\n");
      }
    });

    // Type query in chat input
    const chatInput = page.locator('input[placeholder*="swap"], textarea[placeholder*="swap"], input[type="text"]').first();
    await chatInput.waitFor({ state: "visible" });
    await chatInput.fill("what is pragma?");

    // Submit query
    await chatInput.press("Enter");

    // Wait for response
    await page.waitForTimeout(5000);

    // Verify API was called
    expect(apiResponses.length).toBeGreaterThan(0);

    // Parse SSE stream
    const rawResponse = apiResponses[0] || "";
    const lines = rawResponse.split("\n");
    let aggregatedBody = "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const jsonData = line.slice(6); // Remove "data: " prefix
          const parsed = JSON.parse(jsonData);
          if (parsed.body) {
            aggregatedBody = parsed.body;
          }
        } catch (e) {
          // Ignore parse errors for non-JSON lines
        }
      }
    }

    console.log("✅ Aggregated Body from SSE:");
    console.log(aggregatedBody);
    console.log(`📏 Length: ${aggregatedBody.length} characters`);
    console.log("\n");

    // Verify complete expected content
    const expectedPhrases = [
      "pragma is an on-chain intent engine",
      "understands your intent",
      "turns it into on-chain actions",
      "s0nderlabs",
    ];

    for (const phrase of expectedPhrases) {
      const found = aggregatedBody.toLowerCase().includes(phrase.toLowerCase());
      console.log(`${found ? "✅" : "❌"} Contains: "${phrase}"`);
      expect(aggregatedBody.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });

  test.skip("Frontend displays complete response in chat UI", async ({ page }) => {
    console.log("\n🧪 TEST 2: Frontend UI Display Verification\n");

    // Type query
    const chatInput = page.locator('input[placeholder*="swap"], textarea[placeholder*="swap"], input[type="text"]').first();
    await chatInput.waitFor({ state: "visible" });
    await chatInput.fill("what is pragma?");
    await chatInput.press("Enter");

    // Wait for agent response message to appear
    await page.waitForTimeout(5000);

    // Find the agent response message
    const messages = page.locator('[class*="message"], [class*="chat"], [data-message-type]');
    const messageCount = await messages.count();

    console.log(`📨 Found ${messageCount} messages in chat`);

    // Get last message (agent response)
    const lastMessage = messages.last();
    const messageText = await lastMessage.textContent();

    console.log("💬 Displayed Message Text:");
    console.log(messageText);
    console.log(`📏 Length: ${messageText?.length || 0} characters`);
    console.log("\n");

    // Verify complete content is displayed
    const expectedPhrases = [
      "pragma is an on-chain intent engine",
      "understands your intent",
      "turns it into on-chain actions",
      "s0nderlabs",
    ];

    for (const phrase of expectedPhrases) {
      const found = messageText?.toLowerCase().includes(phrase.toLowerCase()) || false;
      console.log(`${found ? "✅" : "❌"} UI Contains: "${phrase}"`);

      if (!found) {
        console.log(`\n⚠️  TRUNCATION DETECTED: Missing phrase "${phrase}"`);
        console.log("🔍 This indicates frontend is truncating the response");
      }

      expect(messageText?.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });

  test.skip("Compare backend response vs frontend display", async ({ page }) => {
    console.log("\n🧪 TEST 3: Backend vs Frontend Comparison\n");

    let apiAggregatedBody = "";

    // Intercept API response
    page.on("response", async (response) => {
      if (response.url().includes("/api/chat/respond")) {
        const body = await response.text();
        const lines = body.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const jsonData = line.slice(6);
              const parsed = JSON.parse(jsonData);
              if (parsed.body) {
                apiAggregatedBody = parsed.body;
              }
            } catch (e) {
              // Ignore
            }
          }
        }
      }
    });

    // Type query
    const chatInput = page.locator('input[placeholder*="swap"], textarea[placeholder*="swap"], input[type="text"]').first();
    await chatInput.waitFor({ state: "visible" });
    await chatInput.fill("what is pragma?");
    await chatInput.press("Enter");

    // Wait for response
    await page.waitForTimeout(5000);

    // Get UI text
    const messages = page.locator('[class*="message"], [class*="chat"], [data-message-type]');
    const lastMessage = messages.last();
    const uiText = await lastMessage.textContent() || "";

    // Compare
    console.log("📊 COMPARISON RESULTS:\n");
    console.log(`Backend API Body Length: ${apiAggregatedBody.length} chars`);
    console.log(`Frontend UI Text Length: ${uiText.length} chars`);
    console.log(`\nDifference: ${apiAggregatedBody.length - uiText.length} chars missing`);

    console.log("\n📦 Backend API Body:");
    console.log("---");
    console.log(apiAggregatedBody);
    console.log("---\n");

    console.log("💬 Frontend UI Text:");
    console.log("---");
    console.log(uiText);
    console.log("---\n");

    if (apiAggregatedBody.length > uiText.length) {
      console.log("❌ TRUNCATION CONFIRMED: Frontend is truncating backend response");
      console.log("🔍 Likely cause: Frontend parsing in apps/web/src/lib/chat/agent.ts");

      // Check if it's the last sentence only
      const sentences = apiAggregatedBody.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
      const lastSentence = sentences[sentences.length - 1];

      if (uiText.includes(lastSentence) && !uiText.includes(sentences[0])) {
        console.log("🎯 ROOT CAUSE: Only showing LAST SENTENCE");
        console.log(`   Last sentence: "${lastSentence}"`);
        console.log("   Frontend heading detection may be stripping body content");
      }
    } else {
      console.log("✅ No truncation - backend and frontend lengths match");
    }

    // Take screenshot for visual verification
    await page.screenshot({
      path: "test-results/agent-insight-what-is-pragma.png",
      fullPage: true
    });
    console.log("📸 Screenshot saved: test-results/agent-insight-what-is-pragma.png");

    // Verify lengths match
    expect(uiText.length).toBeGreaterThan(apiAggregatedBody.length * 0.8); // Allow 20% variance for UI formatting
  });

  test.skip("Verify other quick insights work correctly", async ({ page }) => {
    console.log("\n🧪 TEST 4: Other Quick Insights Verification\n");

    const testQueries = [
      {
        query: "who built pragma?",
        expectedPhrases: ["s0nderlabs", "elpabl0.eth"],
      },
      {
        query: "what is monad?",
        expectedPhrases: ["blockchain", "testnet", "chain id 10143"],
      },
    ];

    for (const { query, expectedPhrases } of testQueries) {
      console.log(`\n🔍 Testing: "${query}"`);

      const chatInput = page.locator('input[placeholder*="swap"], textarea[placeholder*="swap"], input[type="text"]').first();
      await chatInput.fill(query);
      await chatInput.press("Enter");
      await page.waitForTimeout(5000);

      const messages = page.locator('[class*="message"], [class*="chat"], [data-message-type]');
      const lastMessage = messages.last();
      const text = await lastMessage.textContent() || "";

      console.log(`Response: ${text}`);

      for (const phrase of expectedPhrases) {
        const found = text.toLowerCase().includes(phrase.toLowerCase());
        console.log(`${found ? "✅" : "❌"} Contains: "${phrase}"`);
      }
    }
  });
});
