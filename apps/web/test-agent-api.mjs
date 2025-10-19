#!/usr/bin/env node

/**
 * Direct API Test for Agent Insight
 *
 * Tests the /api/chat/respond endpoint directly without Playwright
 * to verify backend is sending complete responses.
 */

const testQuery = "what is pragma?";

const testAPIResponse = async () => {
  console.log("\n🧪 Testing API Response for:", testQuery);
  console.log("=".repeat(60));

  const mockDelegationArtifact = {
    mode: "normal",
    sessionKeyPrivateKey: "0x1",
    sessionKeyAddress: "0x3333333333333333333333333333333333333333",
    delegation: {
      delegate: "0x3333333333333333333333333333333333333333",
      delegator: "0x2222222222222222222222222222222222222222",
      authority: "0x",
      caveats: [],
      salt: "0x01",
      signature: "0x" + "ab".repeat(65),
    },
    expiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    callLimit: null,
    callsUnlimited: true,
    sessionNonce: "0x00",
    allowedTokens: [
      {
        address: "0x0000000000000000000000000000000000000000",
        symbol: "MON",
        name: "Monad",
        decimals: 18,
        kind: "native",
      },
      {
        address: "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701",
        symbol: "WMON",
        name: "Wrapped Monad",
        decimals: 18,
        kind: "wrappedNative",
      },
    ],
    kind: "swap",
    transferMaxAmount: null,
    pairAddresses: [],
    perTokenCapsWei: {},
    nativeTokenCapWei: null,
  };

  try {
    const response = await fetch("http://localhost:3000/api/chat/respond", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: testQuery,
        chainId: 10143,
        delegation: {
          artifact: mockDelegationArtifact,
          tokens: mockDelegationArtifact.allowedTokens,
        },
      }),
    });

    if (!response.ok) {
      console.error(`❌ API returned status: ${response.status}`);
      const text = await response.text();
      console.error(`Response: ${text}`);
      return;
    }

    console.log("✅ API responded with status 200");
    console.log("\n📦 Reading SSE stream...\n");

    const text = await response.text();
    const lines = text.split("\n");

    console.log(`Total lines in response: ${lines.length}`);
    console.log("\nRaw SSE Stream:");
    console.log("---");
    console.log(text);
    console.log("---\n");

    // Parse SSE stream
    let aggregatedContent = "";
    let title = "";
    let type = "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const jsonData = line.slice(6); // Remove "data: " prefix
          const parsed = JSON.parse(jsonData);

          if (parsed.type) {
            type = parsed.type;
          }
          if (parsed.title) {
            title = parsed.title;
          }
          if (parsed.content) {
            aggregatedContent += parsed.content;
          }

          console.log(`📨 SSE Event: type="${parsed.type}", hasContent=${!!parsed.content}, contentLength=${parsed.content?.length || 0}, content="${parsed.content || ''}"`);
        } catch (e) {
          // Ignore parse errors for non-JSON lines
        }
      }
    }

    console.log("\n📊 AGGREGATED RESULT:");
    console.log("---");
    console.log(`Type: ${type}`);
    console.log(`Title: ${title}`);
    console.log(`Content Length: ${aggregatedContent.length} characters`);
    console.log("\nContent:");
    console.log(aggregatedContent);
    console.log("---\n");

    // Verify expected content
    const expectedPhrases = [
      "pragma is an on-chain intent engine",
      "understands your intent",
      "turns it into on-chain actions",
      "s0nderlabs",
    ];

    console.log("✅ VERIFICATION CHECKS:\n");

    let allFound = true;
    for (const phrase of expectedPhrases) {
      const found = aggregatedContent.toLowerCase().includes(phrase.toLowerCase());
      console.log(`${found ? "✅" : "❌"} Contains: "${phrase}"`);
      if (!found) {
        allFound = false;
      }
    }

    console.log("\n" + "=".repeat(60));

    if (allFound) {
      console.log("✅ SUCCESS: All expected content found in backend response!");
      console.log("🔍 Backend is working correctly. If issue persists in UI, check frontend parsing.\n");
    } else {
      console.log("❌ FAILURE: Some expected content missing from response");
      console.log("🔍 This indicates backend is sending incomplete response\n");
    }

    // Check if it's only the last sentence
    const sentences = aggregatedContent.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    if (sentences.length > 0) {
      console.log(`\n📝 Response has ${sentences.length} sentence(s):`);
      sentences.forEach((s, i) => console.log(`${i + 1}. ${s}`));

      if (sentences.length === 1 && sentences[0].includes("s0nderlabs.xyz")) {
        console.log("\n⚠️  ROOT CAUSE: Only showing last sentence!");
        console.log("   This suggests quick action response instead of AI insight");
      }
    }

  } catch (error) {
    console.error("❌ Error testing API:", error.message);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
  }
};

testAPIResponse();
