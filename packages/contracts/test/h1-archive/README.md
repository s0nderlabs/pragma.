# H1 Contract Test Archive

**Archived:** 2025-10-27
**Phase:** H2 Planning - Test Suite Restructure
**Reason:** H2 architecture changes make these tests obsolete

---

## 📦 What's Archived (2 tests)

### 1. DelegationFork.t.sol
**What it tested:** Uniswap V3 swap execution via delegation on fork
**Why archived:** H2 uses Monorail aggregator, not Uniswap directly
**Lines of code:** ~200 lines

**Key interfaces:**
- `IQuoterV2` - Uniswap V3 quoter
- `ISwapRouter` - Uniswap V3 swap router

**Test scenarios:**
- Fork mainnet state
- Execute swap via Uniswap V3
- Verify delegation caveats enforced
- Check token balances after swap

### 2. integration/DelegationManager.t.sol
**What it tested:** H1 delegation issuance and management
**Why archived:** H2 uses ephemeral delegations (auto-created after quote confirmed)
**Pattern changed:** Manual delegation issuance → Auto-creation

---

## 🔄 What Changed in H2

### Architecture Shifts

**H1 → H2 Protocol Changes:**
- ❌ **Uniswap V3** → ✅ **Monorail** (DEX aggregator)
- ❌ **Manual delegation** → ✅ **Ephemeral delegation** (auto-created)
- ❌ **Single-step swaps** → ✅ **Multi-step execution** (swap → stake)

**H1 → H2 Execution Changes:**
- ❌ **Direct Uniswap calls** → ✅ **LangChain tool contracts**
- ❌ **Long-lived delegations** → ✅ **One delegation per request**
- ❌ **Delegation UI** → ✅ **Invisible to users**

### New Protocol Integrations (H2)
- **Monorail** - Swap routing (replaces Uniswap)
- **aPriori** - MON liquid staking (new in H2)
- **Poply** - NFT marketplace (new in H2)

---

## ✅ What Stayed (5 enforcer tests - still active)

**Located in:** `packages/contracts/test/enforcers/`

These tests remain active because caveat enforcers are architecture-agnostic:

1. **LimitedCallsEnforcer.t.sol** ✅
   - Tests call count limits
   - Used in both H1 and H2

2. **TimestampEnforcer.t.sol** ✅
   - Tests time window enforcement
   - Used in both H1 and H2

3. **NonceEnforcer.t.sol** ✅
   - Tests nonce management (replay prevention)
   - Used in both H1 and H2

4. **ERC20TransferAmountEnforcer.t.sol** ✅
   - Tests per-token amount limits
   - Used in both H1 and H2

5. **NativeTokenTransferAmountEnforcer.t.sol** ✅
   - Tests native token (MON) limits
   - Used in both H1 and H2

**Why these stayed:** Caveat enforcers test pure on-chain logic that doesn't depend on protocol integrations or delegation patterns.

---

## 🏃 Running H1 Tests

These archived tests remain runnable against H1 frozen baseline:

```bash
# Checkout H1 frozen baseline
git checkout h1-frozen-baseline

# Run archived tests
cd packages/contracts
forge test --match-path test/h1-archive/DelegationFork.t.sol
forge test --match-path test/h1-archive/integration/DelegationManager.t.sol

# Or run all archived tests
forge test --match-path 'test/h1-archive/**/*.sol'
```

**Note:** These tests require H1 contracts and will fail on H2 codebase.

---

## 🆕 H2 Test Replacements

See `packages/contracts/test/h2/` for equivalent H2 test coverage.

### H2 Test Plan (To Be Implemented)

```
test/h2/
├── adapters/
│   ├── AprioriAdapter.t.sol       # MON → aprMON staking
│   ├── PoplyAdapter.t.sol         # NFT buy/sell/transfer
│   └── MonorailAdapter.t.sol      # Swap routing via Monorail
├── tools/
│   ├── StakeTool.t.sol            # LangChain stake tool contract
│   ├── NFTBuyTool.t.sol           # LangChain NFT buy tool
│   └── SwapTool.t.sol             # LangChain swap tool
├── execution/
│   ├── MultiStepExecution.t.sol   # swap → stake sequencing
│   └── EphemeralDelegation.t.sol  # Auto-creation after quote
└── security/
    ├── ToolAccessControl.t.sol    # Only HybridDelegator can call tools
    └── ParameterValidation.t.sol  # AI-generated params validated on-chain
```

**Priority H2 Tests (P0):**
1. AprioriAdapter.t.sol - Staking core functionality
2. MonorailAdapter.t.sol - Swap routing (replaces DelegationFork)
3. EphemeralDelegation.t.sol - Auto-creation pattern
4. ToolAccessControl.t.sol - LangChain tool security
5. MultiStepExecution.t.sol - Multi-step flows

---

## 📊 Test Coverage Comparison

| Category | H1 Tests | Archived | Active | H2 Tests (Planned) |
|----------|----------|----------|--------|-------------------|
| Enforcers | 5 | 0 | 5 ✅ | 0 (unchanged) |
| Integration | 1 | 1 ⚠️ | 0 | 1 (ephemeral) |
| Fork Tests | 1 | 1 ⚠️ | 0 | 0 (not needed) |
| Adapters | 0 | 0 | 0 | 3 (new) |
| Tools | 0 | 0 | 0 | 3 (new) |
| Execution | 0 | 0 | 0 | 2 (new) |
| Security | 0 | 0 | 0 | 2 (new) |
| **Total** | **7** | **2** | **5** | **10** |

---

## 🎯 Key Takeaways

1. **H1 tests prove H1 works** - preserved as historical record
2. **Enforcer tests continue** - architecture-agnostic, still valid
3. **H2 needs fresh tests** - different protocols, different patterns
4. **No mixed assumptions** - clear H1/H2 separation

---

**Last Updated:** 2025-10-27
**Related Docs:**
- [H2 Protocol Integrations](/.claude/memory/features/h2-protocol-integrations.md)
- [H2 LangChain Architecture](/.claude/memory/features/h2-langchain-agent-architecture.md)
- [Test Archiving Strategy](/.claude/memory/features/test-suite-archive-h1-to-h2.md)
