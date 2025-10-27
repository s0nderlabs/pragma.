# H2 Web Tests

**Created:** 2025-10-27
**Status:** 🚧 To Be Implemented
**Phase:** H2 Development - Fresh Test Suite

---

## 🎯 H2 Test Strategy

H2 web tests focus on:
- **LangChain UI** (tool calling visualization, AI responses)
- **Multi-step execution** (real-time timeline, status updates)
- **Simplified onboarding** (no delegation modal)
- **Protocol UIs** (aPriori staking, Poply NFT)
- **Liquid glass aesthetic** (new design system)

---

## 📁 Test Structure

```
h2/
├── agent/             # LangChain agent UI
│   ├── langchain-tool-calling.spec.ts
│   ├── complex-intents.spec.ts
│   ├── error-suggestions.spec.ts
│   └── cost-display.spec.ts
├── execution/         # Multi-step execution UI
│   ├── real-time-updates.spec.ts
│   ├── multi-step-timeline.spec.ts
│   ├── quick-mode.spec.ts
│   └── yolo-mode.spec.ts
├── protocols/         # Protocol-specific UIs
│   ├── staking-ui.spec.ts
│   ├── nft-ui.spec.ts
│   └── swap-ui.spec.ts
├── flows/             # User flows
│   ├── simplified-onboarding.spec.ts
│   ├── auto-delegation.spec.ts
│   ├── multi-step-swap-stake.spec.ts
│   └── revoke-ephemeral.spec.ts
├── design/            # Design system
│   ├── liquid-glass-aesthetic.spec.ts
│   ├── animations-gsap.spec.ts
│   ├── floating-panels.spec.ts
│   └── theme-system.spec.ts
├── mobile/            # Mobile responsiveness
│   ├── responsive-timeline.spec.ts
│   ├── mobile-staking.spec.ts
│   └── mobile-nft.spec.ts
└── receipts/          # Receipt system
    ├── multi-step-receipts.spec.ts
    ├── receipt-archive.spec.ts
    └── ai-generated-summaries.spec.ts
```

---

## 🆕 Tests To Implement

### Priority 0 (P0) - Core Functionality

#### 1. agent/langchain-tool-calling.spec.ts
**Purpose:** Test LangChain tool calling visualization

**Test scenarios:**
```typescript
test("displays tool selection in chat", async ({ page }) => {
  await page.goto("/");
  await connectWallet(page);

  await page.getByRole("textbox").fill("swap 10 usdc to mon and stake it");
  await page.keyboard.press("Enter");

  // AI planning message
  await expect(page.getByText("Planning execution...")).toBeVisible();

  // Tools selected
  await expect(page.getByText("Step 1: Swap USDC → MON")).toBeVisible();
  await expect(page.getByText("Step 2: Stake MON on aPriori")).toBeVisible();

  // Cost display
  await expect(page.getByText(/AI cost: ~\$0\.0005/)).toBeVisible();
});

test("complex intent: buy cheapest NFT", async ({ page }) => {
  await page.getByRole("textbox").fill("buy cheapest pudgy penguin");
  await page.keyboard.press("Enter");

  // AI queries Poply
  await expect(page.getByText("Finding cheapest listing...")).toBeVisible();
  await expect(page.getByText(/Found: Pudgy Penguin #\d+ for \d+\.\d+ MON/)).toBeVisible();
});
```

---

#### 2. execution/real-time-updates.spec.ts
**Purpose:** Test real-time multi-step execution updates

**Test scenarios:**
```typescript
test("displays real-time progress for multi-step", async ({ page }) => {
  await executeIntent(page, "swap 10 usdc to mon and stake");

  // Vertical timeline appears
  const timeline = page.getByTestId("execution-timeline");
  await expect(timeline).toBeVisible();

  // Step 1: Swap
  const step1 = page.getByTestId("step-0");
  await expect(step1).toContainText("Swap USDC → MON");
  await expect(step1.getByTestId("status-pending")).toBeVisible();

  // Wait for step 1 completion
  await expect(step1.getByTestId("status-success")).toBeVisible({ timeout: 30000 });
  await expect(step1).toContainText(/Swapped \d+\.\d+ USDC → \d+\.\d+ MON/);

  // Step 2: Stake
  const step2 = page.getByTestId("step-1");
  await expect(step2.getByTestId("status-pending")).toBeVisible();

  // Wait for step 2 completion
  await expect(step2.getByTestId("status-success")).toBeVisible({ timeout: 30000 });
  await expect(step2).toContainText(/Staked \d+\.\d+ MON → \d+\.\d+ aprMON/);
});
```

---

#### 3. flows/simplified-onboarding.spec.ts
**Purpose:** Test simplified onboarding (no delegation modal)

**Test scenarios:**
```typescript
test("no delegation modal during onboarding", async ({ page }) => {
  await page.goto("/");

  // Connect wallet button
  await page.getByRole("button", { name: "Connect account" }).click();

  // Mock wallet connection
  await mockWalletConnect(page, "0x123...");

  // Connected state - NO delegation modal appears
  await expect(page.getByRole("button", { name: /Connected/ })).toBeVisible();

  // No "Issue delegation" button
  await expect(page.getByRole("button", { name: /Issue.*delegation/i })).not.toBeVisible();

  // Can start chatting immediately
  await page.getByRole("textbox").fill("swap 1 mon to usdc");
  await expect(page.getByRole("textbox")).toBeEnabled();
});

test("delegation created automatically after quote", async ({ page }) => {
  await connectWallet(page);

  // Send intent
  await page.getByRole("textbox").fill("swap 1 mon to usdc");
  await page.keyboard.press("Enter");

  // Quote displayed
  await expect(page.getByText(/You'll receive ~\d+\.\d+ USDC/)).toBeVisible();

  // Confirm button
  await page.getByRole("button", { name: "Confirm" }).click();

  // Delegation created (invisible to user, but verifiable in dev tools)
  const delegationCreated = await page.evaluate(() => {
    return window.localStorage.getItem("pragma:active-delegation") !== null;
  });
  assert.ok(delegationCreated);
});
```

---

#### 4. flows/multi-step-swap-stake.spec.ts
**Purpose:** E2E test multi-step flow in UI

**Test scenarios:**
```typescript
test("complete multi-step flow: swap → stake", async ({ page }) => {
  await connectWallet(page);

  // Send multi-step intent
  await page.getByRole("textbox").fill("swap 10 usdc to mon and stake it");
  await page.keyboard.press("Enter");

  // AI plans execution
  await expect(page.getByText("Step 1: Swap USDC → MON")).toBeVisible();
  await expect(page.getByText("Step 2: Stake MON on aPriori")).toBeVisible();

  // Quote displayed
  await expect(page.getByText(/You'll receive ~\d+\.\d+ aprMON/)).toBeVisible();

  // Confirm
  await page.getByRole("button", { name: "Confirm" }).click();

  // Real-time execution
  await expect(page.getByTestId("step-0").getByTestId("status-pending")).toBeVisible();
  await expect(page.getByTestId("step-0").getByTestId("status-success")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("step-1").getByTestId("status-success")).toBeVisible({ timeout: 30000 });

  // Receipt displayed
  await expect(page.getByText("Multi-step execution complete")).toBeVisible();
  await expect(page.getByText(/Final result: \d+\.\d+ aprMON/)).toBeVisible();
});
```

---

#### 5. protocols/staking-ui.spec.ts
**Purpose:** Test aPriori staking UI

**Test scenarios:**
```typescript
test("stake MON on aPriori via UI", async ({ page }) => {
  await connectWallet(page);

  // Navigate to staking (or use chat)
  await page.getByRole("textbox").fill("stake 1 mon");
  await page.keyboard.press("Enter");

  // Quote displayed
  await expect(page.getByText(/Stake 1 MON on aPriori/)).toBeVisible();
  await expect(page.getByText(/You'll receive ~1 aprMON/)).toBeVisible();
  await expect(page.getByText(/Earn variable APR from staking \+ MEV/)).toBeVisible();

  // Confirm
  await page.getByRole("button", { name: "Confirm" }).click();

  // Execution
  await expect(page.getByText("Staking...")).toBeVisible();
  await expect(page.getByText("Staked successfully")).toBeVisible({ timeout: 30000 });

  // Receipt
  await expect(page.getByText(/Staked 1 MON → \d+\.\d+ aprMON/)).toBeVisible();
});
```

---

#### 6. protocols/nft-ui.spec.ts
**Purpose:** Test Poply NFT UI

**Test scenarios:**
```typescript
test("buy NFT via Poply UI", async ({ page }) => {
  await connectWallet(page);

  await page.getByRole("textbox").fill("buy pudgy penguin #123");
  await page.keyboard.press("Enter");

  // NFT preview
  await expect(page.getByText("Pudgy Penguin #123")).toBeVisible();
  await expect(page.getByText(/Price: \d+\.\d+ MON/)).toBeVisible();
  await expect(page.getByTestId("nft-image")).toBeVisible();

  // Confirm
  await page.getByRole("button", { name: "Confirm Purchase" }).click();

  // Execution
  await expect(page.getByText("Purchasing NFT...")).toBeVisible();
  await expect(page.getByText("Purchase successful")).toBeVisible({ timeout: 30000 });
});
```

---

### Priority 1 (P1) - Enhanced Features

#### 7. execution/quick-mode.spec.ts
**Purpose:** Test Quick Mode (1 AI call, auto-execute)

#### 8. execution/yolo-mode.spec.ts
**Purpose:** Test Yolo Mode (unverified tokens)

#### 9. design/liquid-glass-aesthetic.spec.ts
**Purpose:** Test liquid glass design system

#### 10. mobile/responsive-timeline.spec.ts
**Purpose:** Multi-step timeline on mobile

---

## 🧪 Running H2 Tests

```bash
cd apps/web

# Run all H2 tests
pnpm exec playwright test h2/

# Run specific category
pnpm exec playwright test h2/agent/
pnpm exec playwright test h2/execution/

# Run specific test
pnpm exec playwright test h2/agent/langchain-tool-calling.spec.ts

# With UI mode
pnpm exec playwright test h2/ --ui

# With headed browser
pnpm exec playwright test h2/ --headed
```

---

## 📊 Test Coverage Goals

| Category | Tests Planned | Priority | Target Coverage |
|----------|---------------|----------|-----------------|
| Agent | 4 | P0 | 90% |
| Execution | 4 | P0 | 100% |
| Protocols | 3 | P0 | 100% |
| Flows | 4 | P0 | 100% |
| Design | 4 | P1 | 80% |
| Mobile | 3 | P1 | 90% |
| Receipts | 3 | P1 | 80% |
| **Total** | **25** | **Mixed** | **92%** |

---

## 🔗 Related H1 Tests

See `tests/h1-archive/` for H1 tests that were replaced:
- agent-insight.spec.ts → langchain-tool-calling.spec.ts
- chat-ui.spec.ts → real-time-updates.spec.ts
- identity-flow.spec.ts → simplified-onboarding.spec.ts
- slippage-and-fractions.spec.ts → quick-mode.spec.ts

---

**Last Updated:** 2025-10-27
**Status:** Ready for implementation as H2 web UI features are built
