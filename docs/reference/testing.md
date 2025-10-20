---
title: Testing Reference
last_updated: 2025-01-20
---

# 🧪 Testing Reference

Pragma uses **Playwright** for end-to-end testing of the web app and **Node.js test runner** for unit/integration tests of core logic.

---

## 🎭 Playwright E2E Tests (Web App)

### Test Location

All Playwright tests are in `apps/web/tests/`:

```
apps/web/tests/
├── identity-flow.spec.ts       # Wallet connection, delegation, disconnect
├── chat-ui.spec.ts             # Chat interface, agent responses
├── agent-insight.spec.ts       # AI agent capabilities and insights
├── mobile-responsive.spec.ts   # Mobile UI and close button functionality
└── mobile-ui-complete.spec.ts  # Comprehensive mobile UI across devices
```

### Running Tests

**Run all tests:**
```bash
cd apps/web
pnpm exec playwright test
```

**Run specific test file:**
```bash
pnpm exec playwright test identity-flow.spec.ts
pnpm exec playwright test mobile-responsive.spec.ts
```

**Run with UI mode (interactive):**
```bash
pnpm exec playwright test --ui
```

**Run in headed mode (see browser):**
```bash
pnpm exec playwright test --headed
```

**Run with specific reporter:**
```bash
pnpm exec playwright test --reporter=list
pnpm exec playwright test --reporter=html
```

**View HTML report:**
```bash
pnpm exec playwright show-report
```

### Test Coverage

#### 1. Identity Flow (`identity-flow.spec.ts`)

**What it tests:**
- Wallet connection via "Connect account" button
- Connected account modal opening/closing
- Delegation issuance with mode selection
- Session key rotation
- Delegation revocation
- Disconnect functionality
- State persistence and cleanup

**Key scenarios:**
```typescript
✓ Connected account modal opens and displays correct information
✓ Can issue delegation and see it in delegations tab
✓ Can rotate session key and reissue delegation
✓ Revoke all clears state on disconnect
```

#### 2. Chat UI (`chat-ui.spec.ts`)

**What it tests:**
- Chat input and message sending
- Agent response rendering
- Swap preview display
- Balance information parsing
- Token allowlist display
- Message history

**Key scenarios:**
```typescript
✓ Chat UI renders properly on page load
✓ Can send messages and receive agent responses
✓ Swap previews display with correct formatting
✓ Balance information renders on dedicated lines
```

#### 3. Agent Insights (`agent-insight.spec.ts`)

**What it tests:**
- AI-powered agent responses
- Educational Q&A functionality
- Clarification requests
- System command processing
- Trending token data
- Safety warnings

**Key scenarios:**
```typescript
✓ Agent provides educational insights about Pragma
✓ Agent requests clarifications for incomplete swap intents
✓ Agent explains delegation modes
✓ Agent warns about low balances and expiring delegations
```

#### 4. Mobile Responsive (`mobile-responsive.spec.ts`)

**What it tests:**
- Mobile viewport rendering (iPhone SE - 375px)
- Connected Account modal responsiveness
- Mobile close button functionality
- Touch target sizes (44x44px WCAG compliance)
- ESC key modal dismissal

**Key scenarios:**
```typescript
✓ Modal displays properly on mobile viewports
✓ Mobile close button (X icon) is visible and clickable
✓ Close button has adequate touch target size
✓ ESC key still works to dismiss modal
✓ Clicking modal background dismisses it
```

**Test devices:**
```typescript
{ width: 375, height: 667 }  // iPhone SE
```

#### 5. Mobile UI Complete (`mobile-ui-complete.spec.ts`)

**What it tests:**
- Comprehensive mobile UI across multiple device sizes
- Quick Mode button responsiveness
- Button alignment and layouts
- Connected Account modal tabs on mobile
- Cross-device consistency
- Desktop UI preservation

**Test devices:**
```typescript
{ name: "iPhone SE", width: 375, height: 667 }
{ name: "iPhone 12", width: 390, height: 844 }
{ name: "iPhone 14 Pro Max", width: 430, height: 932 }
{ name: "iPad Mini", width: 768, height: 1024 }
{ name: "Desktop", width: 1280, height: 720 }
```

**Key scenarios:**
```typescript
✓ Quick Mode shows "Quick" on mobile, "Quick Mode" on desktop
✓ Chat console header buttons align horizontally on all devices
✓ Connected Account modal tabs navigate properly on mobile
✓ All tabs (Overview, Actions, Delegations, Receipts) work on small screens
✓ Modal content doesn't overflow on mobile
✓ Desktop close button hidden on desktop (mobile X button only)
✓ No horizontal overflow on any device size
```

---

## 🔬 Unit & Integration Tests (Core Logic)

### Test Location

Core logic tests are in `packages/core/test/`:

```
packages/core/test/
├── agent.insight.test.mjs      # Agent intent parsing and insights
└── ... (other test files)
```

### Running Core Tests

**From repo root:**
```bash
pnpm test
```

**From core package:**
```bash
cd packages/core
node test/agent.insight.test.mjs
```

**With environment variables:**
```bash
OPENAI_API_KEY="your-key" node packages/core/test/agent.insight.test.mjs
```

### Coverage Areas

**Agent Intent Engine:**
- Natural language parsing
- Swap intent normalization
- Token resolution
- Amount parsing (exact, fraction, max)
- Educational Q&A
- Clarification generation

**Execution Logic:**
- Swap simulation
- Balance checks
- Cap verification
- Delegation validation
- Receipt generation

---

## 🎯 Test Configuration

### Playwright Config (`apps/web/playwright.config.ts`)

**Key settings:**
```typescript
{
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
}
```

**Browsers tested:**
- Chromium (primary)
- Firefox (optional)
- WebKit (optional)

### Test Data & Fixtures

**Mock delegation artifacts:**
```typescript
const mockDelegation = {
  artifactId: "test-artifact-1",
  chainId: 41454,  // Monad testnet
  mode: "swap" as const,
  delegator: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
  delegate: "0x1234567890123456789012345678901234567890",
  sessionKeyAddress: "0x...",
  expiresAt: Date.now() + 86400000,  // 24 hours
  callLimit: 10,
  allowedTokens: ["0x...", "0x..."],
  // ... additional fields
};
```

**Test utilities:**
- `page.addInitScript()` - Inject localStorage data
- `page.waitForLoadState('networkidle')` - Wait for page load
- `page.setViewportSize()` - Test different screen sizes

---

## 📊 Test Reports

### HTML Report

After test run, view detailed report:

```bash
pnpm exec playwright show-report
```

**Report includes:**
- Pass/fail status for each test
- Screenshots on failure
- Video recordings (if enabled)
- Trace files for debugging
- Performance metrics

### CI/CD Integration

**GitHub Actions example:**
```yaml
- name: Install dependencies
  run: pnpm install

- name: Install Playwright browsers
  run: pnpm exec playwright install --with-deps

- name: Run Playwright tests
  run: pnpm exec playwright test

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

---

## 🐛 Debugging Tests

### Visual Debugging

**Open Playwright Inspector:**
```bash
PWDEBUG=1 pnpm exec playwright test
```

**Features:**
- Step through test line-by-line
- Inspect page state at each step
- Record and export traces
- Evaluate selectors in real-time

### Trace Viewer

**Capture trace:**
```bash
pnpm exec playwright test --trace on
```

**View trace:**
```bash
pnpm exec playwright show-trace test-results/[test-name]/trace.zip
```

### Screenshots & Videos

**Enable in config or command line:**
```bash
pnpm exec playwright test --screenshot=on --video=on
```

**Files saved to:**
```
apps/web/test-results/
├── [test-name]/
│   ├── test-failed-1.png
│   ├── video.webm
│   └── trace.zip
```

---

## 📝 Writing New Tests

### Best Practices

**1. Use data-testid for stability:**
```typescript
// Good - resilient to styling changes
const button = page.getByTestId('mobile-close-button');

// Avoid - fragile
const button = page.locator('button.absolute.right-4.top-4');
```

**2. Wait for network idle:**
```typescript
await page.goto('/');
await page.waitForLoadState('networkidle');
```

**3. Use explicit waits:**
```typescript
await expect(modal).toBeVisible();
await page.waitForTimeout(300);  // For animations
```

**4. Mock localStorage for delegation tests:**
```typescript
await page.addInitScript((delegation) => {
  localStorage.setItem('pragma:delegations', JSON.stringify([delegation]));
  localStorage.setItem('pragma:active-delegator', JSON.stringify({
    artifactId: delegation.artifactId,
    delegator: delegation.delegator,
  }));
}, mockDelegation);
```

**5. Test across viewports:**
```typescript
const devices = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "Desktop", width: 1280, height: 720 },
];

for (const device of devices) {
  test(`should work on ${device.name}`, async ({ page }) => {
    await page.setViewportSize(device);
    // ... test logic
  });
}
```

---

## 🔍 Troubleshooting

### Common Issues

**1. Tests timing out:**
```bash
# Increase timeout
pnpm exec playwright test --timeout=60000
```

**2. Flaky tests:**
- Add explicit waits for animations
- Use `waitForLoadState('networkidle')`
- Check for race conditions

**3. Selector not found:**
```typescript
// Debug selector
await page.locator('your-selector').highlight();
```

**4. Clean test environment:**
```bash
# Clear test results and cache
rm -rf test-results/ playwright-report/
```

---

## 📚 Related Documentation

- [Playwright Official Docs](https://playwright.dev)
- [Web UI Guide](../guides/web-ui-guide.md) - What UI elements tests validate
- [API Reference](./api-reference.md) - Endpoints tests interact with
- [Troubleshooting](../appendix/troubleshooting.md) - General debugging tips
