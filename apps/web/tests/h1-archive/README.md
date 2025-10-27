# H1 Web Test Archive

**Archived:** 2025-10-27
**Phase:** H2 Planning - Test Suite Restructure
**Reason:** H2 web UI changes require fresh test suite aligned with new architecture

---

## 📦 What's Archived (12 tests - ALL web tests)

### H1 Agent Architecture Tests (2 tests)

#### 1. agent-insight.spec.ts
**What it tested:** H1 Phase 2 AI agent insights and educational responses
**Why archived:** H2 uses LangChain with different response patterns
**Lines of code:** ~250 lines

**Test scenarios:**
- Educational Q&A about Pragma
- Delegation mode explanations
- Trending token data display
- Safety warnings for low balances

**H2 changes:** LangChain agent generates responses differently

---

#### 2. chat-agent.spec.ts
**What it tested:** H1 agent response rendering in chat UI
**Why archived:** H2 LangChain agent has different message structure
**Lines of code:** ~130 lines

**Test scenarios:**
- Agent message rendering
- Token symbol display
- Mock delegation artifacts
- Response formatting

**H2 changes:** LangChain tool calls displayed differently in UI

---

### H1 Chat & UI Tests (3 tests)

#### 3. chat-ui.spec.ts
**What it tested:** H1 chat interface rendering and interactions
**Why archived:** H2 adds multi-step timeline + real-time updates
**Lines of code:** ~320 lines

**Test scenarios:**
- Chat input and message sending
- Agent response rendering
- Swap preview display
- Balance information parsing
- Message history

**H2 changes:**
- Multi-step execution timeline (vertical)
- Real-time status updates during execution
- Tool execution visualization
- Cost display (~$0.0005/intent)

---

#### 4. identity-flow.spec.ts
**What it tested:** H1 wallet connection and delegation modal
**Why archived:** H2 removes delegation modal (auto-created invisibly)
**Lines of code:** ~400 lines

**Test scenarios:**
- Wallet connection via "Connect account"
- **Delegation issuance with mode selection** (removed in H2)
- Session key rotation
- Delegation revocation
- Disconnect functionality

**H2 changes:**
- No delegation modal (biggest UI change)
- Delegations created automatically after quote confirmed
- Simplified onboarding flow

---

#### 5. revoke-all.spec.ts
**What it tested:** H1 delegation revocation flow with UI
**Why archived:** H2 revoke flow simpler (no delegation list UI)
**Lines of code:** ~370 lines

**Test scenarios:**
- Revoke all button functionality
- Confirmation modal
- State cleanup after revoke
- Delegation list clearing

**H2 changes:** Ephemeral delegations (one per request, auto-revoked)

---

### H1 Onboarding Tests (1 test)

#### 6. onboarding.spec.ts
**What it tested:** H1 onboarding with delegation modal and token selection
**Why archived:** H2 removes delegation step (simplified)
**Lines of code:** ~75 lines (skipped test)

**Test scenarios:**
- Token allowlist rendering in delegation modal
- Mode selection (Safe/Normal)
- Token chip selection

**H2 changes:** No delegation modal → simplified onboarding

---

### H1 Mobile & Responsive Tests (2 tests)

#### 7. mobile-responsive.spec.ts
**What it tested:** H1 mobile viewport rendering (375px - iPhone SE)
**Why archived:** H2 UI structure different (new components)
**Lines of code:** ~600 lines

**Test scenarios:**
- Connected Account modal on mobile
- Mobile close button (X icon)
- Touch target sizes (44x44px WCAG)
- ESC key modal dismissal

**H2 changes:** Different modal structure, new mobile patterns

---

#### 8. mobile-ui-complete.spec.ts
**What it tested:** H1 comprehensive mobile UI across multiple devices
**Why archived:** H2 UI components different
**Lines of code:** ~370 lines

**Test devices:**
- iPhone SE (375px)
- iPhone 12 (390px)
- iPhone 14 Pro Max (430px)
- iPad Mini (768px)
- Desktop (1280px)

**Test scenarios:**
- Quick Mode button responsiveness
- Button alignment
- Connected Account modal tabs
- Cross-device consistency

**H2 changes:** New UI components require fresh responsive tests

---

### H1 Feature-Specific Tests (4 tests)

#### 9. slippage-and-fractions.spec.ts
**What it tested:** H1 "max slippage" keyword + fraction display
**Why archived:** H2 has Quick Mode (1 AI call) + Yolo Mode (unverified tokens)
**Lines of code:** ~220 lines
**Added:** Oct 25, 2025 (very recent!)

**Test scenarios:**
- "max slippage" keyword in Normal mode (10%)
- "max slippage" in Safe mode (2%)
- Fraction display (e.g., "1/2 MON")

**H2 changes:**
- Quick Mode: 1 AI call, auto-execute (no confirmation)
- Yolo Mode: Allow unverified tokens
- Different slippage handling (5% Normal, 2% Safe)

---

#### 10. theme-toggle.spec.ts
**What it tested:** H1 theme switching (dark/light)
**Why archived:** H2 may have different theme system (liquid glass aesthetic)
**Lines of code:** ~45 lines

**Test scenarios:**
- Toggle theme button
- Theme persistence in localStorage
- Theme applied to UI

**H2 changes:** New liquid glass design system

---

#### 11. token-fallback-rendering.spec.ts
**What it tested:** H1 token fallback display logic
**Why archived:** H2 token system may differ (new protocols)
**Lines of code:** ~165 lines

**Test scenarios:**
- Token symbol fallback rendering
- Category display
- Unknown token handling

**H2 changes:** New tokens (aprMON for aPriori, etc.)

---

#### 12. token-fallback.spec.ts
**What it tested:** H1 token fallback behavior in chat
**Why archived:** H2 chat UI structure different
**Lines of code:** ~375 lines

**Test scenarios:**
- Token rendering in messages
- Fallback symbols
- Category badges

**H2 changes:** LangChain responses formatted differently

---

## 🔄 What Changed in H2

### Major UI Architecture Shifts

**H1 → H2 Visual Changes:**
- ❌ **Delegation modal** → ✅ **No delegation UI** (invisible to users)
- ❌ **Single-step swap preview** → ✅ **Multi-step execution timeline**
- ❌ **Static chat** → ✅ **Real-time status updates**
- ❌ **Simple receipts** → ✅ **Multi-step receipts with tool metadata**

**H1 → H2 Design System:**
- ❌ **Standard UI** → ✅ **Liquid glass aesthetic**
- ❌ **Simple animations** → ✅ **GSAP + Framer Motion + Lenis**
- ❌ **Static layouts** → ✅ **Floating glass panels** (sidebar + chat)

**H1 → H2 Interaction Patterns:**
- ❌ **Manual delegation issuance** → ✅ **Auto-delegation after quote**
- ❌ **Mode selection during onboarding** → ✅ **Mode selected in chat**
- ❌ **Confirmation modal** → ✅ **Inline confirmation in chat**

---

## 🏃 Running H1 Tests

These archived tests remain runnable against H1 frozen baseline:

```bash
# Checkout H1 frozen baseline
git checkout h1-frozen-baseline

# Install Playwright browsers (if not already)
cd apps/web
pnpm exec playwright install

# Run archived tests
pnpm exec playwright test h1-archive/agent-insight.spec.ts
pnpm exec playwright test h1-archive/chat-agent.spec.ts
pnpm exec playwright test h1-archive/identity-flow.spec.ts
# ... etc

# Or run all archived tests
pnpm exec playwright test h1-archive/
```

**Note:** These tests require H1 web implementation and will fail on H2 codebase.

---

## 🆕 H2 Test Replacements

See `apps/web/tests/h2/` for equivalent H2 test coverage.

### H2 Test Plan (To Be Implemented)

```
tests/h2/
├── agent/
│   ├── langchain-tool-calling.spec.ts       # AI selects correct tools
│   ├── complex-intents.spec.ts              # "buy cheapest NFT"
│   ├── error-suggestions.spec.ts            # AI suggests alternatives
│   └── cost-display.spec.ts                 # Show AI cost (~$0.0005)
├── execution/
│   ├── real-time-updates.spec.ts            # Multi-step progress timeline
│   ├── multi-step-timeline.spec.ts          # Vertical status indicators
│   ├── quick-mode.spec.ts                   # 1 AI call, auto-execute
│   └── yolo-mode.spec.ts                    # Unverified tokens allowed
├── protocols/
│   ├── staking-ui.spec.ts                   # aPriori staking interface
│   ├── nft-ui.spec.ts                       # Poply NFT browse/buy
│   └── swap-ui.spec.ts                      # Monorail swap interface
├── flows/
│   ├── simplified-onboarding.spec.ts        # No delegation modal
│   ├── auto-delegation.spec.ts              # Created after quote confirmed
│   ├── multi-step-swap-stake.spec.ts        # E2E multi-step flow
│   └── revoke-ephemeral.spec.ts             # Ephemeral delegation cleanup
├── design/
│   ├── liquid-glass-aesthetic.spec.ts       # Glass panels, blur effects
│   ├── animations-gsap.spec.ts              # GSAP timeline animations
│   ├── floating-panels.spec.ts              # Sidebar + chat layout
│   └── theme-system.spec.ts                 # Dual theme (dark/light)
├── mobile/
│   ├── responsive-timeline.spec.ts          # Multi-step timeline on mobile
│   ├── mobile-staking.spec.ts               # Staking UI on mobile
│   └── mobile-nft.spec.ts                   # NFT UI on mobile
└── receipts/
    ├── multi-step-receipts.spec.ts          # Multi-step receipt display
    ├── receipt-archive.spec.ts              # Receipt history with filters
    └── ai-generated-summaries.spec.ts       # AI-generated receipt text
```

**Priority H2 Tests (P0):**
1. **langchain-tool-calling.spec.ts** - Core AI functionality
2. **real-time-updates.spec.ts** - Multi-step execution visualization
3. **simplified-onboarding.spec.ts** - Onboarding without delegation modal
4. **quick-mode.spec.ts** - Quick Mode flow (1 AI call)
5. **staking-ui.spec.ts** - aPriori staking interface
6. **nft-ui.spec.ts** - Poply NFT interface

---

## 📊 Test Coverage Comparison

| Category | H1 Tests | Archived | Active | H2 Tests (Planned) |
|----------|----------|----------|--------|-------------------|
| Agent/AI | 2 | 2 ⚠️ | 0 | 4 (LangChain) |
| Chat/UI | 3 | 3 ⚠️ | 0 | 3 (multi-step) |
| Onboarding | 1 | 1 ⚠️ | 0 | 2 (simplified) |
| Mobile | 2 | 2 ⚠️ | 0 | 3 (new components) |
| Features | 4 | 4 ⚠️ | 0 | 4 (Quick/Yolo) |
| Protocols | 0 | 0 | 0 | 3 (new) |
| Execution | 0 | 0 | 0 | 4 (new) |
| Design | 0 | 0 | 0 | 4 (new) |
| Receipts | 0 | 0 | 0 | 3 (new) |
| **Total** | **12** | **12** | **0** | **30** |

**Note:** H2 requires 2.5x more tests due to:
- LangChain agent complexity
- Multi-step execution flows
- New protocol integrations (aPriori, Poply)
- Richer UI (liquid glass, real-time updates)
- More interaction modes (Quick, Yolo)

---

## 🎯 Key UI Differences: H1 vs H2

### H1 UI Flow
```
1. Connect wallet
2. Open delegation modal
3. Select mode (Safe/Normal)
4. Select tokens
5. Issue delegation
6. Type intent in chat
7. View swap preview
8. Confirm swap
9. Execute (single-step)
10. View receipt
```

### H2 UI Flow
```
1. Connect wallet
   (No delegation modal!)
2. Type intent in chat
3. AI plans execution (tool selection shown)
4. View quote with auto-delegation preview
5. Confirm
6. Watch real-time multi-step execution:
   - Step 1: Swap USDC → MON ⏳
   - Step 2: Stake MON → aprMON ⏳
7. View multi-step receipt with AI summary
```

**H2 simplifications:**
- 10 steps → 7 steps (30% shorter)
- No delegation UI (3 steps removed)
- Real-time feedback (better UX)

---

## 🎯 Key Takeaways

1. **H1 web tests prove H1 UI works** - preserved as historical record
2. **ALL 12 web tests archived** - H2 UI fundamentally different
3. **H2 needs 2.5x more tests** - Richer UI, more protocols, more modes
4. **Delegation modal removal** - Biggest UI change (4+ tests obsolete)
5. **Multi-step execution** - Core H2 feature requiring extensive testing

---

**Last Updated:** 2025-10-27
**Related Docs:**
- [H2 Web UI Design](/.claude/memory/features/h2-web-ui-design.md)
- [H2 LangChain Architecture](/.claude/memory/features/h2-langchain-agent-architecture.md)
- [Test Archiving Strategy](/.claude/memory/features/test-suite-archive-h1-to-h2.md)
