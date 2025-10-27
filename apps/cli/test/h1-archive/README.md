# H1 CLI Test Archive

**Archived:** 2025-10-27
**Phase:** H2 Planning - Test Suite Restructure
**Reason:** H2 architecture changes require fresh CLI test suite

---

## 📦 What's Archived (4 tests - ALL CLI tests)

### 1. agentTelemetry.test.ts
**What it tested:** H1 Phase 2 AI agent telemetry tracking
**Why archived:** H2 uses LangChain with different telemetry structure
**Lines of code:** ~80 lines

**Test scenarios:**
- Track AI agent calls
- Measure response times
- Monitor token usage
- Log agent decisions

**H2 replacement:** LangChain has built-in callbacks and tracing

---

### 2. errors.test.ts
**What it tested:** H1 error handling and messaging
**Why archived:** H2 has LangChain-specific errors + multi-step error handling
**Lines of code:** ~40 lines

**Test scenarios:**
- Insufficient balance errors
- Invalid token errors
- Delegation errors
- RPC errors

**H2 changes:**
- LangChain tool execution errors
- Multi-step partial failure handling
- AI error recovery suggestions

---

### 3. receiptStore.test.ts
**What it tested:** H1 receipt storage and retrieval
**Why archived:** H2 receipts have multi-step structure (different format)
**Lines of code:** ~60 lines

**Test scenarios:**
- Store single swap receipt
- Retrieve receipt by plan_hash
- List all receipts
- Round-trip serialization

**H2 changes:**
- Multi-step receipts (swap → stake)
- Real-time status updates during execution
- Tool execution metadata
- LangChain cost tracking

---

### 4. swapCaps.test.ts
**What it tested:** Per-token swap cap enforcement (H1)
**Why archived:** H2 caps apply to multi-step flows (more complex)
**Lines of code:** ~100 lines

**Test scenarios:**
- Decrement per-token caps
- Enforce cap limits
- Track remaining capacity
- Reset caps on new delegation

**H2 changes:**
- Caps enforced across multi-step (swap → stake both decrement)
- Ephemeral delegations (caps per request, not session)
- Protocol-specific caps (staking limits separate from swap limits)

---

## 🔄 What Changed in H2

### CLI Architecture Shifts

**H1 → H2 Execution Flow:**
```
H1: User intent → Parser → Quote → Confirm → Execute → Receipt
H2: User intent → LangChain Agent → Tools → Multi-step Execute → Real-time Updates → Receipt
```

**H1 → H2 Feature Changes:**
- ❌ **Phase 2 AI (optional)** → ✅ **LangChain Agent (always active)**
- ❌ **Single-step receipts** → ✅ **Multi-step receipts with timeline**
- ❌ **Simple error messages** → ✅ **AI-generated error recovery suggestions**
- ❌ **Per-session caps** → ✅ **Per-request ephemeral caps**

**H1 → H2 Testing Challenges:**
- LangChain introduces non-determinism (AI responses vary)
- Multi-step execution creates complex state transitions
- Real-time updates require async testing patterns
- Cost tracking needs AI usage monitoring

---

## 🏃 Running H1 Tests

These archived tests remain runnable against H1 frozen baseline:

```bash
# Checkout H1 frozen baseline
git checkout h1-frozen-baseline

# Run archived tests
cd apps/cli
pnpm test h1-archive/agentTelemetry.test.ts
pnpm test h1-archive/errors.test.ts
pnpm test h1-archive/receiptStore.test.ts
pnpm test h1-archive/swapCaps.test.ts

# Or run all archived tests
pnpm test h1-archive/
```

**Note:** These tests require H1 CLI implementation and will fail on H2 codebase.

---

## 🆕 H2 Test Replacements

See `apps/cli/test/h2/` for equivalent H2 test coverage.

### H2 Test Plan (To Be Implemented)

```
test/h2/
├── langchain/
│   ├── toolSelection.test.ts        # AI picks correct tools for intent
│   ├── multiStep.test.ts            # swap → stake sequencing logic
│   ├── errorRecovery.test.ts        # AI suggests alternatives on errors
│   ├── costTracking.test.ts         # Monitor AI usage costs
│   └── callbacks.test.ts            # Real-time status updates
├── protocols/
│   ├── aprioriStaking.test.ts       # E2E stake/unstake flows
│   ├── poplyNFT.test.ts             # E2E NFT purchase flows
│   └── monorailSwap.test.ts         # E2E swap via Monorail
├── execution/
│   ├── ephemeralDelegation.test.ts  # Auto-create after quote confirmed
│   ├── multiStepReceipts.test.ts    # Multi-step receipt generation
│   ├── multiStepCaps.test.ts        # Cap enforcement across steps
│   └── realTimeUpdates.test.ts      # Status updates during execution
└── errors/
    ├── langchainErrors.test.ts      # LangChain-specific error handling
    ├── partialFailure.test.ts       # Multi-step partial failure recovery
    └── aiSuggestions.test.ts        # AI-generated error alternatives
```

**Priority H2 Tests (P0):**
1. **toolSelection.test.ts** - Core LangChain functionality
2. **multiStep.test.ts** - Multi-step sequencing accuracy
3. **ephemeralDelegation.test.ts** - Auto-creation pattern
4. **multiStepReceipts.test.ts** - Receipt format correctness
5. **aprioriStaking.test.ts** - E2E staking flow

---

## 📊 Test Coverage Comparison

| Category | H1 Tests | Archived | Active | H2 Tests (Planned) |
|----------|----------|----------|--------|-------------------|
| Agent/AI | 1 | 1 ⚠️ | 0 | 5 (LangChain) |
| Errors | 1 | 1 ⚠️ | 0 | 3 (multi-step) |
| Receipts | 1 | 1 ⚠️ | 0 | 2 (multi-step) |
| Caps | 1 | 1 ⚠️ | 0 | 1 (multi-step) |
| Protocols | 0 | 0 | 0 | 3 (new) |
| Execution | 0 | 0 | 0 | 4 (new) |
| **Total** | **4** | **4** | **0** | **18** |

**Note:** H2 requires ~4.5x more tests due to increased complexity (LangChain, multi-step, new protocols).

---

## 🎯 Key Differences: H1 vs H2 CLI Testing

### H1 Testing (Simple)
```typescript
// H1: Test single swap with deterministic parser
test("swap 1 MON to USDC", async () => {
  const intent = parseIntent("swap 1 mon to usdc");
  const quote = await getQuote(intent);
  const result = await executeSwap(quote);
  assert.equal(result.status, "success");
});
```

### H2 Testing (Complex)
```typescript
// H2: Test multi-step with LangChain non-determinism
test("swap USDC to MON and stake", async () => {
  // AI tool selection (non-deterministic)
  const tools = await agent.planExecution("swap 10 usdc to mon and stake");
  assert.equal(tools.length, 2); // swapTool, stakeTool

  // Multi-step execution with real-time updates
  const updates: string[] = [];
  await executeMultiStep(tools, (status) => updates.push(status));

  // Verify both steps completed
  assert.equal(updates.length >= 4); // planning, swap, stake, complete

  // Verify multi-step receipt
  const receipt = await getLastReceipt();
  assert.equal(receipt.steps.length, 2);
  assert.equal(receipt.steps[0].tool, "swap");
  assert.equal(receipt.steps[1].tool, "stake");
});
```

**H2 adds complexity:**
- AI non-determinism (tool selection may vary)
- Async multi-step execution
- Real-time status updates
- More edge cases (partial failures, tool chaining)

---

## 🎯 Key Takeaways

1. **H1 CLI tests prove H1 CLI works** - preserved as historical record
2. **ALL CLI tests archived** - H2 CLI fundamentally different
3. **H2 needs 4.5x more tests** - LangChain + multi-step complexity
4. **Fresh start enables TDD** - Build H2 tests as features implemented

---

**Last Updated:** 2025-10-27
**Related Docs:**
- [H2 LangChain Architecture](/.claude/memory/features/h2-langchain-agent-architecture.md)
- [H2 Protocol Integrations](/.claude/memory/features/h2-protocol-integrations.md)
- [Test Archiving Strategy](/.claude/memory/features/test-suite-archive-h1-to-h2.md)
