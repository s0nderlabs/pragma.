# H2 CLI Tests

**Created:** 2025-10-27
**Status:** 🚧 To Be Implemented
**Phase:** H2 Development - Fresh Test Suite

---

## 🎯 H2 Test Strategy

H2 CLI tests focus on:
- **LangChain agent** (tool selection, multi-step planning)
- **Protocol integrations** (aPriori, Poply E2E flows)
- **Ephemeral delegations** (auto-creation patterns)
- **Multi-step execution** (receipts, caps, real-time updates)

---

## 📁 Test Structure

```
h2/
├── langchain/         # LangChain agent tests
│   ├── toolSelection.test.ts
│   ├── multiStep.test.ts
│   ├── errorRecovery.test.ts
│   ├── costTracking.test.ts
│   └── callbacks.test.ts
├── protocols/         # Protocol integration E2E
│   ├── aprioriStaking.test.ts
│   ├── poplyNFT.test.ts
│   └── monorailSwap.test.ts
├── execution/         # Execution patterns
│   ├── ephemeralDelegation.test.ts
│   ├── multiStepReceipts.test.ts
│   ├── multiStepCaps.test.ts
│   └── realTimeUpdates.test.ts
└── errors/            # Error handling
    ├── langchainErrors.test.ts
    ├── partialFailure.test.ts
    └── aiSuggestions.test.ts
```

---

## 🆕 Tests To Implement

### Priority 0 (P0) - Core Functionality

#### 1. langchain/toolSelection.test.ts
**Purpose:** Test LangChain agent selects correct tools for intents

**Test scenarios:**
```typescript
test("selects swapTool for simple swap", async () => {
  const tools = await agent.planExecution("swap 1 mon to usdc");
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "swap");
});

test("selects swapTool then stakeTool for multi-step", async () => {
  const tools = await agent.planExecution("swap 10 usdc to mon and stake it");
  assert.equal(tools.length, 2);
  assert.equal(tools[0].name, "swap");
  assert.equal(tools[1].name, "stake");
});

test("selects nftBuyTool for NFT purchase", async () => {
  const tools = await agent.planExecution("buy pudgy penguin #123");
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "nftBuy");
});
```

---

#### 2. langchain/multiStep.test.ts
**Purpose:** Test multi-step sequencing accuracy

**Test scenarios:**
```typescript
test("sequences tools correctly", async () => {
  const plan = await agent.planExecution("swap usdc to mon and stake");
  assert.equal(plan.steps[0].tool, "swap");
  assert.equal(plan.steps[0].input.from, "USDC");
  assert.equal(plan.steps[0].input.to, "MON");
  assert.equal(plan.steps[1].tool, "stake");
  assert.equal(plan.steps[1].input.token, "MON");
  // Step 1 output feeds into Step 2 input
  assert.equal(plan.steps[1].input.amount, plan.steps[0].output.amountOut);
});

test("handles complex intent: swap half and stake", async () => {
  const plan = await agent.planExecution("swap half my usdc to mon and stake it");
  const balance = await getBalance("USDC");
  assert.equal(plan.steps[0].input.amount, balance / 2);
});
```

---

#### 3. execution/ephemeralDelegation.test.ts
**Purpose:** Test ephemeral delegation auto-creation

**Test scenarios:**
```typescript
test("creates delegation after quote confirmed", async () => {
  const quote = await getQuote("swap 1 mon to usdc");
  assert.equal(quote.delegationCreated, false);

  await confirmQuote(quote.id);
  const delegation = await getCurrentDelegation();
  assert.ok(delegation);
  assert.equal(delegation.callLimit, 1);
});

test("delegation auto-revoked after execution", async () => {
  await executeIntent("swap 1 mon to usdc");
  const delegation = await getCurrentDelegation();
  assert.equal(delegation, null);
});

test("multi-step creates delegation with N calls", async () => {
  const quote = await getQuote("swap usdc to mon and stake");
  await confirmQuote(quote.id);
  const delegation = await getCurrentDelegation();
  assert.equal(delegation.callLimit, 2); // swap + stake
});
```

---

#### 4. execution/multiStepReceipts.test.ts
**Purpose:** Test multi-step receipt generation

**Test scenarios:**
```typescript
test("generates receipt with multiple steps", async () => {
  const result = await executeIntent("swap 10 usdc to mon and stake");
  const receipt = await getReceipt(result.planHash);

  assert.equal(receipt.steps.length, 2);
  assert.equal(receipt.steps[0].tool, "swap");
  assert.equal(receipt.steps[0].status, "success");
  assert.equal(receipt.steps[1].tool, "stake");
  assert.equal(receipt.steps[1].status, "success");
});

test("receipt includes AI cost", async () => {
  const receipt = await getLastReceipt();
  assert.ok(receipt.aiCost);
  assert.ok(receipt.aiCost < 0.001); // ~$0.0005 expected
});
```

---

#### 5. protocols/aprioriStaking.test.ts
**Purpose:** E2E test aPriori staking flow

**Test scenarios:**
```typescript
test("stake MON on aPriori E2E", async () => {
  const balanceBefore = await getBalance("MON");
  const result = await executeIntent("stake 1 mon");

  assert.equal(result.status, "success");
  const balanceAfter = await getBalance("MON");
  const aprMONBalance = await getBalance("aprMON");

  assert.equal(balanceAfter, balanceBefore - 1);
  assert.ok(aprMONBalance > 0);
});

test("unstake aprMON returns MON E2E", async () => {
  await executeIntent("stake 1 mon");
  const result = await executeIntent("unstake 1 apriori");
  assert.equal(result.status, "success");
  // MON balance restored (with rewards)
});

test("multi-step: swap USDC to MON then stake", async () => {
  const result = await executeIntent("swap 10 usdc to mon and stake it");
  assert.equal(result.steps.length, 2);
  const aprMONBalance = await getBalance("aprMON");
  assert.ok(aprMONBalance > 0);
});
```

---

### Priority 1 (P1) - Enhanced Features

#### 6. langchain/errorRecovery.test.ts
**Purpose:** Test AI error recovery and suggestions

#### 7. langchain/costTracking.test.ts
**Purpose:** Monitor AI usage costs

#### 8. execution/realTimeUpdates.test.ts
**Purpose:** Test real-time status callbacks

#### 9. protocols/poplyNFT.test.ts
**Purpose:** E2E NFT purchase flow

#### 10. errors/langchainErrors.test.ts
**Purpose:** LangChain-specific error handling

---

## 🧪 Running H2 Tests

```bash
cd apps/cli

# Run all H2 tests
pnpm test h2/

# Run specific category
pnpm test h2/langchain/
pnpm test h2/protocols/

# Run specific test
pnpm test h2/langchain/toolSelection.test.ts

# With coverage
pnpm test --coverage h2/
```

---

## 📊 Test Coverage Goals

| Category | Tests Planned | Priority | Target Coverage |
|----------|---------------|----------|-----------------|
| LangChain | 5 | P0 | 90% |
| Protocols | 3 | P0 | 100% |
| Execution | 4 | P0 | 100% |
| Errors | 3 | P1 | 80% |
| **Total** | **15** | **Mixed** | **92%** |

---

## 🔗 Related H1 Tests

See `test/h1-archive/` for H1 tests that were replaced:
- agentTelemetry.test.ts → costTracking.test.ts
- receiptStore.test.ts → multiStepReceipts.test.ts
- swapCaps.test.ts → multiStepCaps.test.ts
- errors.test.ts → langchainErrors.test.ts

---

**Last Updated:** 2025-10-27
**Status:** Ready for implementation as H2 CLI features are built
