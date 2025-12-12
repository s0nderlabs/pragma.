# PragmaFeeEnforcer v1.0.0

**Contract Type:** ERC-7710 Caveat Enforcer
**Status:** ✅ Production Ready (Testnet)
**Deployed Address:** `0x3748f88864Af3802dbbacb58B83411A246f023A1`
**Chain:** Monad Testnet (Chain ID: 10143)

---

## ⚠️ CRITICAL: Version Information

**v1.0.0 (Nested Delegation)** - ✅ **USE THIS VERSION**
- Architecture: Nested delegation pattern
- Status: Production ready, deployed, and validated
- This documentation covers v1.0.0 only

**v1.0.1 (Batch Execution)** - ❌ **DO NOT USE**
- Alternative approach that was investigated but ABANDONED
- No deployment exists for v1.0.1
- If you see references to v1.0.1, disregard them

---

## Overview

PragmaFeeEnforcer is a custom ERC-7710 caveat enforcer that collects protocol fees for Pragma operations on Monad. It implements a nested delegation pattern where users sign a separate fee allowance delegation that is redeemed automatically after the main operation completes.

### Key Features

- **Generic execution support** - Works with swaps, stakes, NFTs, transfers, and ANY future operation
- **Configurable fees** - Fee amount set per-delegation, no hardcoded percentages onchain
- **Multi-token support** - Collect fees in native MON or any ERC20 token
- **Fee-on-transfer handling** - Validates actual received amount (90% threshold)
- **Safety limits** - Maximum fee cap (1000 MON), minimum fee validation (>= 100 wei)
- **Proven pattern** - Follows MetaMask's NativeTokenPaymentEnforcer reference implementation

---

## Architecture

### Nested Delegation Pattern

PragmaFeeEnforcer uses a two-delegation system:

1. **Main Delegation** - Executes the user's intended operation (swap/stake/NFT/etc.)
   - Includes PragmaFeeEnforcer as a caveat
   - Caveat args contain the fee allowance delegation (added after signing)

2. **Fee Allowance Delegation** - Grants permission to collect fee
   - Separate delegation signed by user
   - Redeemed by PragmaFeeEnforcer's `afterAllHook()`
   - Uses ArgsEqualityCheckEnforcer to bind to specific main delegation

### Flow

```
User prepares main operation (swap 0.1 MON → USDC, fee 0.0005 MON)
  ↓
1. Sign main delegation (with PragmaFeeEnforcer caveat, empty args)
  ↓
2. Calculate main delegation hash
  ↓
3. Sign fee allowance delegation (with hash in terms)
  ↓
4. Update main delegation's caveat args (with fee allowance delegation)
  ↓
5. Session key redeems main delegation → Swap executes
  ↓
6. PragmaFeeEnforcer.afterAllHook() called
  ↓
7. Enforcer redeems fee allowance delegation → 0.0005 MON to treasury
  ↓
Done: User received USDC, Pragma treasury received fee
```

### Why This Pattern?

**Problem:** How to collect fees without requiring two separate user actions?

**Solution:** Nested delegation allows:
- User signs fee allowance ONCE (reusable across operations)
- Fee collection automatic after main operation
- Main operation failure doesn't trigger fee collection
- No additional user interaction needed

---

## Technical Specification

### Contract Interface

```solidity
contract PragmaFeeEnforcer is CaveatEnforcer {
    address public immutable delegationManager;
    address public immutable TREASURY;
    address public immutable ARGS_EQUALITY_CHECK_ENFORCER;
    uint256 public constant MAX_FEE_AMOUNT = 1000 ether;
    string public constant VERSION = "1.0.0";

    constructor(address _delegationManager, address _treasury);

    function beforeHook(
        bytes calldata _terms,
        bytes calldata _args,
        ModeCode _mode,
        bytes calldata _executionCallData,
        bytes32 _delegationHash,
        address _delegator,
        address _redeemer
    ) public view override;

    function afterAllHook(
        bytes calldata _terms,
        bytes calldata _args,
        ModeCode _mode,
        bytes calldata _executionCallData,
        bytes32 _delegationHash,
        address _delegator,
        address _redeemer
    ) public override;

    function getTermsInfo(bytes calldata _terms)
        public pure returns (bool isNative, address token, uint256 amount);
}
```

### Terms Encoding

**Format:** `isNative (1 byte) | token (20 bytes) | amount (32 bytes)` = 53 bytes total

```typescript
const terms = encodePacked(
  ["uint8", "address", "uint256"],
  [
    isNative ? 1 : 0,      // 1 for native MON, 0 for ERC20
    tokenAddress,          // Token contract address (or MON address for native)
    feeAmount              // Fee amount in wei
  ]
);
```

**Example:**
```typescript
// Collect 0.0005 MON fee
const terms = encodePacked(
  ["uint8", "address", "uint256"],
  [1, MON_ADDRESS, parseEther("0.0005")]
);
```

### Args Encoding

**Format:** Array of Delegation structs (typically 1 element)

```typescript
const args = encodeAbiParameters(
  [{
    type: "tuple[]",
    components: [
      { name: "delegate", type: "address" },
      { name: "delegator", type: "address" },
      { name: "authority", type: "bytes32" },
      { name: "caveats", type: "tuple[]", components: [...] },
      { name: "salt", type: "uint256" },
      { name: "signature", type: "bytes" },
    ]
  }],
  [[feeAllowanceDelegation]]
);
```

### Fee Allowance Delegation Structure

```typescript
const feeAllowanceDelegation: Delegation = {
  delegate: PRAGMA_FEE_ENFORCER_ADDRESS,  // Contract that redeems
  delegator: smartAccountAddress,          // User's smart account
  authority: ROOT_AUTHORITY,               // 0xff... (root authority)
  caveats: [{
    enforcer: ARGS_EQUALITY_CHECK_ENFORCER_ADDRESS,
    terms: encodePacked(
      ["bytes32", "address"],
      [mainDelegationHash, sessionKeyAddress]  // Bind to specific delegation + redeemer
    ),
    args: "0x" as Hex,  // Empty - enforcer injects at runtime
  }],
  salt: 0n,
  signature: "0x..." as Hex,  // ERC-1271 signature from smart account
};
```

---

## Integration Guide

### Step-by-Step Implementation

#### 1. Create Main Delegation

```typescript
import { createSwapDelegation } from "@pragma/core/h2/delegation/swapDelegation";
import { encodePacked } from "viem";

// Create base delegation (swap/stake/NFT/etc.)
const mainDelegation = createSwapDelegation({
  aggregator: quote.aggregator,
  transactionData: quote.transactionData,
  transactionValue: BigInt(quote.transactionValue),
  destination: smartAccountAddress,
  delegator: smartAccountAddress,
  sessionKey: sessionKeyAddress,
  nonce,
  chainId,
  delegationManager,
});

// Calculate fee (0.5% of swap amount)
const feeAmount = (swapAmount * 5n) / 1000n;

// Add PragmaFeeEnforcer caveat (with EMPTY args initially)
const feeEnforcerTerms = encodePacked(
  ["uint8", "address", "uint256"],
  [1, MON_ADDRESS, feeAmount]  // Native MON fee
);

mainDelegation.delegation.caveats.push({
  enforcer: PRAGMA_FEE_ENFORCER_ADDRESS,
  terms: feeEnforcerTerms,
  args: "0x" as Hex,  // EMPTY - will update after signing
});
```

#### 2. Sign Main Delegation

```typescript
import { buildDelegationTypedData } from "@pragma/core/h2/delegation/utils";

const mainTypedData = buildDelegationTypedData(
  mainDelegation.delegation,
  chainId,
  delegationManager
);

const mainSignature = await ownerWallet.signTypedData(mainTypedData);
mainDelegation.delegation.signature = mainSignature;
```

#### 3. Get Main Delegation Hash

```typescript
const mainDelegationHash = await publicClient.readContract({
  address: DELEGATION_MANAGER_ADDRESS,
  abi: [{
    type: "function",
    name: "getDelegationHash",
    inputs: [{ name: "delegation", type: "tuple", components: [...] }],
    outputs: [{ name: "", type: "bytes32" }],
  }],
  functionName: "getDelegationHash",
  args: [mainDelegation.delegation],
});
```

#### 4. Create Fee Allowance Delegation

```typescript
const feeAllowanceTerms = encodePacked(
  ["bytes32", "address"],
  [mainDelegationHash, sessionKeyAddress]
);

const feeAllowanceDelegation: Delegation = {
  delegate: PRAGMA_FEE_ENFORCER_ADDRESS,
  delegator: smartAccountAddress,
  authority: ROOT_AUTHORITY as Hex,  // 0xfff...fff
  caveats: [{
    enforcer: ARGS_EQUALITY_CHECK_ENFORCER_ADDRESS,
    terms: feeAllowanceTerms,
    args: "0x" as Hex,
  }],
  salt: 0n,
  signature: "0x" as Hex,
};
```

#### 5. Sign Fee Allowance Delegation

```typescript
const feeTypedData = buildDelegationTypedData(
  feeAllowanceDelegation,
  chainId,
  delegationManager
);

const feeSignature = await ownerWallet.signTypedData(feeTypedData);
feeAllowanceDelegation.signature = feeSignature;
```

#### 6. Update Main Delegation Args

```typescript
import { encodeAbiParameters } from "viem";

const feeEnforcerArgs = encodeAbiParameters(
  [{ type: "tuple[]", components: [...] }],
  [[feeAllowanceDelegation]]
);

// Update the PragmaFeeEnforcer caveat args
const feeEnforcerCaveatIndex = mainDelegation.delegation.caveats.length - 1;
mainDelegation.delegation.caveats[feeEnforcerCaveatIndex].args = feeEnforcerArgs;

// NOTE: Signature is STILL VALID because args are NOT hashed!
```

#### 7. Execute

```typescript
import { redeemDelegations, ExecutionMode } from "@metamask/delegation-toolkit";

const txHash = await redeemDelegations(
  sessionWalletClient,
  publicClient,
  DELEGATION_MANAGER_ADDRESS,
  [{
    permissionContext: [mainDelegation.delegation],
    executions: [operationExecution],
    mode: ExecutionMode.SingleDefault,
  }]
);
```

---

## Configuration

### Fee Rates by Operation Type

Recommended configuration in `packages/core/src/h2/config.ts`:

```typescript
export const PROTOCOL_FEES = {
  swap: 0.005,      // 0.5% for swaps
  stake: 0.005,     // 0.5% for staking
  nftBuy: 0.005,    // 0.5% for NFT purchases
  nftSell: 0,       // FREE for NFT sales
  transfer: 0,      // FREE for transfers
  wrap: 0,          // FREE for wrap/unwrap
  unwrap: 0,
} as const;

export const PRAGMA_FEE_ENFORCER_ADDRESS =
  "0x3748f88864Af3802dbbacb58B83411A246f023A1" as const;

export const PRAGMA_TREASURY_ADDRESS =
  "0x0F7f2dc632ce4668574249961B79D8DaAF804bB9" as const;
```

### Fee Calculation Helper

```typescript
export function calculateFee(
  amount: bigint,
  feeRate: number
): bigint {
  if (feeRate === 0) return 0n;
  return (amount * BigInt(Math.floor(feeRate * 1000))) / 1000n;
}

// Usage
const swapAmount = parseEther("0.1");
const feeAmount = calculateFee(swapAmount, PROTOCOL_FEES.swap);
// feeAmount = 0.0005 MON
```

---

## Testing

### Test Files

- **Working Solution:** `dev-scripts/test-fee-enforcer-correct-authority.ts`
- **Baseline Test:** `dev-scripts/test-baseline-swap.ts` (proves basic delegation works)
- **Signature Test:** `dev-scripts/test-erc1271-signing.ts` (validates ERC-1271 signatures)

### Successful Test Transaction

**Transaction:** `0xcc7c7a679740d6b998045df2ae0b834052be670bef9a96ca77fa5e1920e13f54`

**Operation:** Swap 0.1 MON → USDC (Monorail DEX)
- **Block:** 47960097
- **Gas:** 887,436
- **Swap Amount:** 0.1 MON
- **Fee Collected:** 0.0005 MON
- **USDC Received:** 0.385384

**Balance Changes:**
```
Smart Account (0x4c6c4f382b051c291248f5cb2e1a1c7f5ac9960e):
  MON:  5.142466 → 5.041966 (-0.1005) ✅
  USDC: 1.210224 → 1.595608 (+0.385384) ✅

Treasury (0x0f7f2dc632ce4668574249961b79d8daaf804bb9):
  MON:  0.00021 → 0.00071 (+0.0005) ✅
```

### Testing Checklist

Before production deployment:
- [x] Swap operations (Monorail) - DONE
- [ ] Stake operations (aPriori)
- [ ] NFT purchases (Poply)
- [ ] ERC20 fee tokens (non-native)
- [ ] Fee-on-transfer tokens
- [ ] Zero fee operations (free transfers)
- [ ] Multi-step intents
- [ ] Treasury balance monitoring

---

## Security Considerations

### Audit Fixes (2025-11-07)

**HIGH Severity:**
1. **H-01:** Integer division precision loss - Added `amount >= 100 wei` validation
2. **H-02:** Balance manipulation protection - Added `balanceAfter >= balanceBefore` check

**MEDIUM Severity:**
3. **M-02:** Enforce exactly 1 allowance delegation (not 1-10)
4. **M-01:** ReentrancyGuard skipped (confirmed not needed - stateless design)

### Safety Features

1. **Maximum Fee Cap** - 1000 MON limit prevents misconfiguration
2. **Minimum Fee Amount** - >= 100 wei prevents dust/rounding issues
3. **Balance Validation** - Actual received amount must be >= 90% of expected (fee-on-transfer support)
4. **Delegation Binding** - ArgsEqualityCheckEnforcer ensures fee delegation only works with specific main delegation
5. **No Reentrancy Risk** - Stateless design, no storage updates
6. **Contract Verification** - VERSION constant enables deployment verification

---

## Troubleshooting

### Common Errors

#### `InvalidAuthority()`
**Cause:** Fee allowance delegation has wrong authority field
**Fix:** Use `ROOT_AUTHORITY` (0xfff...fff), NOT 0x000...000

#### `InvalidDelegate()`
**Cause:** Fee allowance delegation has wrong delegate field
**Fix:** Set `delegate = PRAGMA_FEE_ENFORCER_ADDRESS`, NOT session key

#### `ArgsEqualityCheckEnforcer:different-args-and-terms`
**Cause:** Main delegation was re-signed after updating caveat args
**Fix:** Sign main delegation ONCE before getting hash, then update args without re-signing

#### `PragmaFeeEnforcer:invalid-terms-length`
**Cause:** Terms field is not exactly 53 bytes
**Fix:** Use `encodePacked(["uint8", "address", "uint256"], [...])` correctly

#### `PragmaFeeEnforcer:amount-too-small`
**Cause:** Fee amount < 100 wei
**Fix:** Ensure fee amount >= 100 wei (minimum validation)

---

## Key Technical Insights

### 1. Caveat Args Are NOT Hashed

From `EncoderLib._getDelegationHash()`:
```solidity
caveats[i] = abi.encode(
    _input.caveats[i].enforcer,
    keccak256(_input.caveats[i].terms)  // Only terms hashed, NOT args!
);
```

**Implication:** You can update caveat args after signing without invalidating the signature. This is CRITICAL to the nested delegation pattern.

### 2. Runtime Args Injection

```solidity
// PragmaFeeEnforcer.sol:230
allowanceDelegations[0].caveats[0].args = abi.encodePacked(_delegationHash, _redeemer);
```

The enforcer injects runtime parameters (delegation hash + redeemer) into the args field, which ArgsEqualityCheckEnforcer validates against the pre-signed terms.

### 3. No Circular Dependency

**Initial concern:** "Parent hash depends on fee delegation, which depends on parent hash"

**Reality:**
1. Parent delegation signed (with enforcer caveat, empty args) → hash calculated
2. Fee delegation created with that hash in terms → signed
3. Parent's caveat args updated (doesn't change hash because args aren't hashed!)

No circular dependency exists.

---

## Deployment Information

### Monad Testnet

- **Address:** `0x3748f88864Af3802dbbacb58B83411A246f023A1`
- **Chain ID:** 10143
- **Block:** 47957820
- **Deployer:** `0x2902508823B156bA359c0a0F8d4421186bc3E23f` (Pragma Admin)
- **Treasury:** `0x0F7f2dc632ce4668574249961B79D8DaAF804bB9`
- **Gas Used:** 3,620,861
- **Verification:** Pending on Sourcify (Monad chain not fully supported)

### Constructor Parameters

```solidity
constructor(
    address _delegationManager,  // 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
    address _treasury            // 0x0F7f2dc632ce4668574249961B79D8DaAF804bB9
)
```

### Deployment Script

```bash
# Using Foundry
forge script script/DeployPragmaFeeEnforcer.s.sol:DeployPragmaFeeEnforcer \
  --rpc-url $MONAD_RPC_URL \
  --broadcast \
  --private-key $PRAGMA_ADMIN_TEST_PK
```

---

## References

- **Full Documentation:** [.claude/memory/features/pragma-fee-enforcer-v1.md](../../.claude/memory/features/pragma-fee-enforcer-v1.md)
- **Investigation Report:** [NESTED_DELEGATION_SUCCESS.md](../../NESTED_DELEGATION_SUCCESS.md)
- **Deployment Guide:** [packages/contracts/DEPLOY_PRAGMA_FEE_ENFORCER.md](../../packages/contracts/DEPLOY_PRAGMA_FEE_ENFORCER.md)
- **DTK Reference:** NativeTokenPaymentEnforcer test (delegation-framework/test/enforcers/NativeTokenPaymentEnforcer.t.sol)
- **ERC-7710 Spec:** [MetaMask Delegation Toolkit](https://docs.metamask.io/delegation-toolkit)

---

**Last Updated:** 2025-11-07
**Status:** Production Ready (Testnet)
**Version:** v1.0.0
