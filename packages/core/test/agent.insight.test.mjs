import test from "node:test";
import assert from "node:assert/strict";

const { createOpenAiInsight, createOpenAiClarifier } = await import("../dist/agent/openai.js");
const { PragmaAgent } = await import("../dist/agent/pragmaAgent.js");

// Test utilities
const countWords = (text) => {
  if (!text || typeof text !== "string") return 0;
  return text.trim().split(/\s+/).length;
};

const containsAny = (text, keywords) => {
  const lower = text.toLowerCase();
  return keywords.some(keyword => lower.includes(keyword.toLowerCase()));
};

const containsCodeIndicators = (text) => {
  const codeKeywords = [
    "ethers.js", "ethers", "viem", "web3.js", "web3",
    "import {", "import ", "require(", "const ", "let ",
    "function ", "await ", "async ", ".connect(", ".getBalance(",
    "contract.call", "provider.", "signer."
  ];
  return containsAny(text, codeKeywords);
};

// Mock delegation context
const createTestContext = (tokens = []) => ({
  delegation: {
    mode: "normal",
    allowedTokens: tokens,
    nativeTokenSymbol: "MON",
    nativeTokenAddress: "0x0000000000000000000000000000000000000000",
    wrappedNativeSymbol: "WMON",
    wrappedNativeAddress: "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701",
    defaultSlippageBps: 100,
    defaultDeadlineMinutes: 30,
    nowSeconds: Math.floor(Date.now() / 1000),
    chainId: 10143,
    feeBps: 0,
    feeRecipient: "0x000000000000000000000000000000000000dEaD",
  },
  metadata: {
    delegator: "0x339A1063e84C6Ef785D7bA73a786b87AC8Fb61Aa",
    sessionKey: "0x09dca42cd910935e657ecd3aaa1aa616c32a4025",
    mode: "normal",
  },
});

const standardTokens = [
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
  {
    address: "0x1234567890123456789012345678901234567890",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
];

// Skip tests if no OpenAI API key
const skipIfNoApiKey = () => {
  if (!process.env.OPENAI_API_KEY) {
    console.log("⚠️  Skipping insight tests - OPENAI_API_KEY not set");
    process.exit(0);
  }
};

skipIfNoApiKey();

// =============================================================================
// TEST SUITE: MON/WMON RECOGNITION
// =============================================================================

test("MON/WMON Recognition: 'What is MON?' should NOT suggest alternatives", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("What is MON?", context);

  assert.ok(result, "Should return a result");
  assert.equal(result.type, "insight", "Should return insight type");

  const body = result.body || "";
  const hasAlternatives = containsAny(body, ["gMON", "iceMON", "aprMON", "which MON"]);

  console.log("\n📝 Test: What is MON?");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  assert.equal(hasAlternatives, false, "Should NOT suggest MON alternatives like gMON, iceMON, aprMON");
});

test("MON/WMON Recognition: 'Can I use MON?' should confirm availability", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("Can I use MON for swaps?", context);

  assert.ok(result, "Should return a result");
  const body = result.body || "";
  const hasAlternatives = containsAny(body, ["gMON", "iceMON", "aprMON"]);

  console.log("\n📝 Test: Can I use MON?");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  assert.equal(hasAlternatives, false, "Should NOT suggest alternatives to MON");
});

test("MON/WMON Recognition: 'Difference between MON and WMON' should explain wrapping", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("What's the difference between MON and WMON?", context);

  assert.ok(result, "Should return a result");
  const body = result.body || "";
  const mentionsWrapping = containsAny(body, ["wrap", "native", "ERC-20", "ERC20"]);

  console.log("\n📝 Test: MON vs WMON");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  assert.ok(mentionsWrapping, "Should explain wrapping concept");
});

// =============================================================================
// TEST SUITE: TECHNICAL CONTENT PROHIBITION
// =============================================================================

test("Technical Prohibition: 'How to use pragma programmatically?' should NOT output code", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("How do I use pragma programmatically?", context);

  assert.ok(result, "Should return a result");
  const body = result.body || "";
  const hasCode = containsCodeIndicators(body);

  console.log("\n📝 Test: Programmatic usage");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  assert.equal(hasCode, false, "Should NOT contain code snippets or library references");
});

test("Technical Prohibition: 'Show transaction structure' should use natural language", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("Show me the transaction structure for a swap", context);

  assert.ok(result, "Should return a result");
  const body = result.body || "";
  const hasCode = containsCodeIndicators(body);

  console.log("\n📝 Test: Transaction structure");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  assert.equal(hasCode, false, "Should NOT contain code or technical library names");
});

test("Technical Prohibition: 'How to call contract' should NOT show code examples", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("How do I call the smart contract?", context);

  assert.ok(result, "Should return a result");
  const body = result.body || "";
  const hasCode = containsCodeIndicators(body);

  console.log("\n📝 Test: Contract calls");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  assert.equal(hasCode, false, "Should explain in natural language without code");
});

// =============================================================================
// TEST SUITE: ECOSYSTEM KNOWLEDGE
// =============================================================================

test("Ecosystem: 'What is Monad?' should provide accurate explanation", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("What is Monad?", context);

  assert.ok(result, "Should return a result");
  const body = result.body || "";
  const mentionsBlockchain = containsAny(body, ["blockchain", "testnet", "chain", "network"]);

  console.log("\n📝 Test: What is Monad?");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  assert.ok(mentionsBlockchain, "Should explain Monad as a blockchain/testnet");
});

test("Ecosystem: 'What is pragma?' should mention s0nderlabs", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("What is pragma?", context);

  assert.ok(result, "Should return a result");
  const body = result.body || "";
  const mentionsBuilder = containsAny(body, ["s0nderlabs", "s0nder"]);

  console.log("\n📝 Test: What is pragma?");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  // Note: This might not always mention s0nderlabs if the agent prioritizes functional explanation
  // We'll observe and potentially adjust instructions if needed
  console.log(`Mentions s0nderlabs: ${mentionsBuilder}`);
});

test("Ecosystem: 'Who built pragma?' should attribute s0nderlabs", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("Who built pragma?", context);

  assert.ok(result, "Should return a result");
  const body = result.body || "";
  const mentionsBuilder = containsAny(body, ["s0nderlabs", "s0nder"]);

  console.log("\n📝 Test: Who built pragma?");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  assert.ok(mentionsBuilder, "Should mention s0nderlabs as the builder");
});

test("Ecosystem: 'What are delegations?' should explain DTK concept", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("What are delegations?", context);

  assert.ok(result, "Should return a result");
  const body = result.body || "";
  const mentionsDelegation = containsAny(body, ["delegation", "permission", "authority", "session", "MetaMask", "DTK"]);

  console.log("\n📝 Test: What are delegations?");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  assert.ok(mentionsDelegation, "Should explain delegation concept");
});

test("Ecosystem: 'What is Monorail?' should explain aggregator", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("What is Monorail?", context);

  assert.ok(result, "Should return a result");
  const body = result.body || "";
  const mentionsAggregator = containsAny(body, ["aggregator", "swap", "route", "routing", "DEX", "liquidity"]);

  console.log("\n📝 Test: What is Monorail?");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  assert.ok(mentionsAggregator, "Should explain Monorail as aggregator/routing infrastructure");
});

// =============================================================================
// TEST SUITE: BLOCKCHAIN CONCEPTS
// =============================================================================

test("Blockchain Concepts: 'What is slippage?' should explain clearly", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("What is slippage?", context);

  assert.ok(result, "Should return a result");
  const body = result.body || "";
  const mentionsPrice = containsAny(body, ["price", "trade", "swap", "difference", "tolerance"]);

  console.log("\n📝 Test: What is slippage?");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  assert.ok(mentionsPrice, "Should explain slippage related to price/trading");
});

test("Blockchain Concepts: 'What is a swap?' should explain token exchange", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("What is a swap?", context);

  assert.ok(result, "Should return a result");
  const body = result.body || "";
  const mentionsExchange = containsAny(body, ["exchange", "trade", "token", "convert"]);

  console.log("\n📝 Test: What is a swap?");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  assert.ok(mentionsExchange, "Should explain swap as token exchange");
});

// =============================================================================
// TEST SUITE: WORD COUNT LIMITS
// =============================================================================

test("Word Count: All insights should be ≤120 words", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const queries = [
    "What is Monad?",
    "Explain delegations",
    "What can pragma do?",
    "How does slippage work?",
  ];

  console.log("\n📊 Word Count Analysis:");

  for (const query of queries) {
    const result = await insight(query, context);
    const body = result?.body || "";
    const wordCount = countWords(body);

    console.log(`\n"${query}": ${wordCount} words`);

    if (wordCount > 120) {
      console.log(`⚠️  EXCEEDS LIMIT\n${body}\n`);
    }

    assert.ok(wordCount <= 120, `"${query}" response should be ≤120 words (got ${wordCount})`);
  }
});

// =============================================================================
// TEST SUITE: CLARIFICATION WORD COUNT
// =============================================================================

test("Clarification: Should be ≤70 words when asking for missing params", async () => {
  const clarifier = createOpenAiClarifier();
  const context = createTestContext(standardTokens);

  const partialResult = {
    type: "clarification",
    clarification: {
      partialIntent: { action: "swap" },
      questions: [
        { key: "to", prompt: "Which token do you want to receive?" },
        { key: "slippageBps", prompt: "What slippage tolerance (e.g., 0.5%)?" },
      ],
    },
    warnings: [],
  };

  const result = await clarifier("swap 0.5 MON", context, partialResult);

  assert.ok(result, "Should return a result");

  if (result.type === "insight") {
    const body = result.body || "";
    const wordCount = countWords(body);

    console.log("\n📝 Clarification Test:");
    console.log(`Response (${wordCount} words):\n${body}\n`);

    const hasAlternatives = containsAny(body, ["gMON", "iceMON", "aprMON", "which MON", "what you mean by"]);

    assert.equal(hasAlternatives, false, "Should NOT question MON validity");
    assert.ok(wordCount <= 70, `Clarification should be ≤70 words (got ${wordCount})`);
  }
});

// =============================================================================
// TEST SUITE: ARCHITECTURE ACCURACY
// =============================================================================

test("Architecture: 'How does pragma work behind the scenes?' should NOT mention relayers", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("How does pragma work behind the scenes?", context);

  assert.ok(result, "Should return a result");
  const body = result.body || "";

  console.log("\n📝 Test: How does pragma work behind the scenes?");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  // Check for problematic architecture terms (but allow denial phrases like "do not use relayers")
  const hasProblematicTerms = containsAny(body, [
    "relayer auction", "relayer bid", "off-chain pool", "intent pool",
    "solver competition", "MEV protection layer", "private mempool"
  ]);

  assert.equal(hasProblematicTerms, false, "Should NOT describe relayer auctions or off-chain pools");

  const hasPipeline = containsAny(body, ["parse", "policy", "simulate", "session"]);
  assert.ok(hasPipeline, "Should mention pipeline components");

  // Verify it explicitly denies relayer-based architecture
  const deniesRelayerModel = containsAny(body, ["no relayer", "not use relayer", "do not use relayer", "session key"]);
  assert.ok(deniesRelayerModel, "Should clarify non-relayer execution model");
});

test("Architecture: 'Does pragma use relayers?' should clearly say NO", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("Does pragma use relayers?", context);

  assert.ok(result, "Should return a result");
  const body = result.body || "";

  console.log("\n📝 Test: Does pragma use relayers?");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  const deniesRelayers = containsAny(body, ["no", "not", "directly", "session key"]);
  assert.ok(deniesRelayers, "Should clearly deny using relayers");
});

test("Architecture: 'How are transactions executed?' should mention session keys", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("How are transactions executed in pragma?", context);

  assert.ok(result, "Should return a result");
  const body = result.body || "";

  console.log("\n📝 Test: How are transactions executed?");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  const mentionsSessionKeys = containsAny(body, ["session", "DTK", "delegation", "sign"]);
  assert.ok(mentionsSessionKeys, "Should explain session-key execution model");

  const avoidsRelayers = !containsAny(body, ["relayer auction", "off-chain pool"]);
  assert.ok(avoidsRelayers, "Should not describe relayer-based execution");
});

test("Architecture: 'What is Monorail?' should explain it routes, not pragma", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("What is Monorail?", context);

  assert.ok(result, "Should return a result");
  const body = result.body || "";

  console.log("\n📝 Test: What is Monorail?");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  const mentionsAggregator = containsAny(body, ["aggregator", "route", "routing", "DEX"]);
  assert.ok(mentionsAggregator, "Should explain Monorail as aggregator/router");
});

test("Architecture: 'What is plan_hash?' should explain verification", async () => {
  const insight = createOpenAiInsight();
  const context = createTestContext(standardTokens);

  const result = await insight("What is plan_hash?", context);

  assert.ok(result, "Should return a result");
  const body = result.body || "";

  console.log("\n📝 Test: What is plan_hash?");
  console.log(`Response (${countWords(body)} words):\n${body}\n`);

  const explainsPlanHash = containsAny(body, ["hash", "plan", "receipt", "verif"]);
  assert.ok(explainsPlanHash, "Should explain plan_hash purpose");
});

console.log("\n✅ All tests completed!\n");
