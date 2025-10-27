# H2 Contract Tests

**Created:** 2025-10-27
**Status:** 🚧 To Be Implemented
**Phase:** H2 Development - Fresh Test Suite

---

## 🎯 H2 Test Strategy

H2 contract tests focus on:
- **Protocol adapters** (aPriori, Poply, Monorail)
- **LangChain tool contracts** (stake, nftBuy, swap tools)
- **Multi-step execution** (swap → stake atomicity)
- **Security** (access control, parameter validation)

---

## 📁 Test Structure

```
h2/
├── adapters/          # Protocol integration adapters
│   ├── AprioriAdapter.t.sol
│   ├── PoplyAdapter.t.sol
│   └── MonorailAdapter.t.sol
├── tools/             # LangChain tool execution contracts
│   ├── StakeTool.t.sol
│   ├── NFTBuyTool.t.sol
│   └── SwapTool.t.sol
├── execution/         # Multi-step execution logic
│   ├── MultiStepExecution.t.sol
│   └── EphemeralDelegation.t.sol
└── security/          # Security-specific tests
    ├── ToolAccessControl.t.sol
    └── ParameterValidation.t.sol
```

---

## 🆕 Tests To Implement

### Priority 0 (P0) - Core Functionality

#### 1. adapters/AprioriAdapter.t.sol
**Purpose:** Test MON → aprMON liquid staking adapter

**Test scenarios:**
```solidity
function testStakeMON() public
function testUnstakeMON() public
function testStakeRevertsOnZeroAmount() public
function testAprioriFeesApplied() public
function testAprMONReceived() public
```

**Assertions:**
- User receives aprMON (approximately 1:1 initially)
- Pragma 0.5% fee deducted before staking
- aprMON balance increases (not rebases)
- Can unstake to receive MON back (with rewards)

---

#### 2. adapters/MonorailAdapter.t.sol
**Purpose:** Test swap routing via Monorail aggregator

**Test scenarios:**
```solidity
function testSwapViaMonorail() public
function testMonorailFindsOptimalRoute() public
function testSlippageProtection() public
function testPragmaFeeDeducted() public
```

**Assertions:**
- Monorail returns optimal route across Monad DEXs
- Slippage enforced (2% Safe, 5% Normal)
- Pragma 0.5% fee applied on input
- Output amount matches quote (within slippage)

---

#### 3. adapters/PoplyAdapter.t.sol
**Purpose:** Test NFT buy/sell/transfer via Poply

**Test scenarios:**
```solidity
function testBuyNFT() public
function testSellNFT() public
function testTransferNFT() public
function testBuyRevertsOnPriceExceeded() public
```

**Assertions:**
- NFT ownership transferred correctly
- Payment amount correct (including Pragma 0.5% fee on buy)
- Poply marketplace fees handled
- No fees on sell/transfer

---

#### 4. tools/StakeTool.t.sol
**Purpose:** Test LangChain stake tool contract

**Test scenarios:**
```solidity
function testOnlyHybridDelegatorCanCall() public
function testStakeExecutesCorrectly() public
function testParametersValidatedOnChain() public
function testReturnsAprMONAmount() public
```

**Assertions:**
- Only HybridDelegator can call (access control)
- AI-generated parameters validated (amount > 0, valid address)
- Calls aPriori adapter internally
- Returns aprMON amount for LangChain agent

---

#### 5. execution/MultiStepExecution.t.sol
**Purpose:** Test multi-step execution (swap → stake)

**Test scenarios:**
```solidity
function testSwapThenStake() public
function testPartialFailureHandling() public
function testCaveatEnforcementAcrossSteps() public
function testGasOptimization() public
```

**Assertions:**
- Step 1 output feeds into Step 2 input
- If Step 2 fails, Step 1 already executed (not atomic by default)
- Caveats enforced on both steps
- Gas efficient (batched where possible)

---

#### 6. execution/EphemeralDelegation.t.sol
**Purpose:** Test ephemeral delegation auto-creation

**Test scenarios:**
```solidity
function testDelegationCreatedAfterQuote() public
function testOneUseOnly() public
function testAutoRevoked() public
function testLimitedCallsEnforcer() public
```

**Assertions:**
- Delegation created automatically after quote confirmed
- Limited to 1 call (or N calls if multi-step)
- Auto-revoked after execution
- Nonce incremented

---

#### 7. security/ToolAccessControl.t.sol
**Purpose:** Test tool contract access control

**Test scenarios:**
```solidity
function testOnlyDelegatorCanCallTools() public
function testDirectCallReverts() public
function testUnauthorizedDelegatorReverts() public
```

**Assertions:**
- Only HybridDelegator can call tool contracts
- Direct calls from EOAs revert
- Unauthorized delegators cannot call

---

#### 8. security/ParameterValidation.t.sol
**Purpose:** Test AI-generated parameter validation

**Test scenarios:**
```solidity
function testZeroAmountReverts() public
function testInvalidAddressReverts() public
function testNegativeAmountReverts() public
function testMaxSlippageEnforced() public
```

**Assertions:**
- All AI-generated parameters validated on-chain
- Invalid parameters cause revert (fail-safe)
- No malicious parameters can bypass validation

---

### Priority 1 (P1) - Enhanced Functionality

#### 9. tools/NFTBuyTool.t.sol
**Purpose:** Test LangChain NFT buy tool

#### 10. tools/SwapTool.t.sol
**Purpose:** Test LangChain swap tool

---

## 🧪 Running H2 Tests

```bash
cd packages/contracts

# Run all H2 tests
forge test --match-path 'test/h2/**/*.sol'

# Run specific category
forge test --match-path 'test/h2/adapters/**/*.sol'
forge test --match-path 'test/h2/tools/**/*.sol'

# Run specific test
forge test --match-path test/h2/adapters/AprioriAdapter.t.sol

# With gas reporting
forge test --match-path 'test/h2/**/*.sol' --gas-report

# With coverage
forge coverage --match-path 'test/h2/**/*.sol'
```

---

## 📊 Test Coverage Goals

| Category | Tests Planned | Priority | Target Coverage |
|----------|---------------|----------|-----------------|
| Adapters | 3 | P0 | 100% |
| Tools | 3 | P0 | 100% |
| Execution | 2 | P0 | 100% |
| Security | 2 | P0 | 100% |
| **Total** | **10** | **P0** | **100%** |

---

## 🔗 Related H1 Tests

See `test/h1-archive/` for H1 tests that were replaced:
- DelegationFork.t.sol → MonorailAdapter.t.sol
- integration/DelegationManager.t.sol → EphemeralDelegation.t.sol

---

**Last Updated:** 2025-10-27
**Status:** Ready for implementation as H2 contracts are built
