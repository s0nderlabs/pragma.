# PragmaFeeEnforcer Deployment Guide

This guide provides step-by-step instructions for deploying **PragmaFeeEnforcer** using CREATE2 for deterministic addresses.

## Overview

**PragmaFeeEnforcer** is a caveat enforcer that collects 0.5% protocol fees for Pragma operations (swaps, stakes, NFT purchases). It uses the MetaMask Delegation Toolkit (DTK) framework and requires specific configuration.

### Key Features
- **CREATE2 Deployment**: Deterministic addresses across networks
- **Immutable Configuration**: Treasury, DelegationManager, and ArgsEqualityCheckEnforcer set at deployment
- **Security Hardened**: 100% test coverage, audited for vulnerabilities
- **Fee-on-Transfer Support**: Compatible with tokens charging up to 10% transfer fees

### Contract Version
`1.0.0` (deployed with salt: `keccak256("PRAGMA_FEE_ENFORCER_v1.0.0")`)

---

## Prerequisites

### 1. Environment Setup

Ensure you have the following installed:
- **Foundry** ([installation guide](https://book.getfoundry.sh/getting-started/installation))
- **Node.js** (v18+)
- **pnpm** (v8+)

### 2. Network Configuration

This deployment targets **Monad Testnet** with the following addresses:

| Component | Address |
|-----------|---------|
| DelegationManager | `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` |
| ArgsEqualityCheckEnforcer | `0x44B8C6ae3C304213c3e298495e12497Ed3E56E41` |

### 3. Treasury Address

You need an **EOA (Externally Owned Account)** to serve as the Pragma treasury:
- Must have **no code** (cannot be a contract)
- Will receive all protocol fees
- Should be a secure address (hardware wallet recommended)

### 4. Deployer Account

The deployer account needs:
- **MON tokens** for gas fees
- **Private key** with deployment permissions

---

## Step-by-Step Deployment

### Step 1: Configure Environment Variables

Create or update `.env` in the `packages/contracts` directory:

```bash
# Network
MONAD_RPC_URL=https://testnet.monad.xyz

# Deployer (account that will deploy the contract)
PRIVATE_KEY=your_private_key_here

# Treasury (MUST be EOA - will receive protocol fees)
PRAGMA_TREASURY_ADDRESS=0x1234567890123456789012345678901234567890

# (Optional) Deployed contract address (for verification after deployment)
PRAGMA_FEE_ENFORCER_ADDRESS=
```

**Security Note**: Never commit `.env` to version control. Use `.env.example` as template.

### Step 2: Validate Configuration

Before deploying, validate your configuration:

```bash
# Check if treasury is EOA
cast code $PRAGMA_TREASURY_ADDRESS --rpc-url $MONAD_RPC_URL

# Expected output: 0x (no code = EOA ✓)
# If you see hex code, that's a contract and deployment will fail
```

### Step 3: Predict Deployment Address

Predict the deployment address before deploying:

```bash
forge script script/PredictPragmaFeeEnforcerAddress.s.sol:PredictPragmaFeeEnforcerAddress \
  --rpc-url $MONAD_RPC_URL
```

**Expected Output**:
```
==========================================
PragmaFeeEnforcer Address Prediction
==========================================

Deployer: 0xYourDeployerAddress
Treasury: 0xYourTreasuryAddress
Treasury is EOA: YES

Predicted Address: 0xPredictedContractAddress
Deployment Status: NOT YET DEPLOYED

Configuration:
  DelegationManager: 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
  ArgsEqualityCheckEnforcer: 0x44B8C6ae3C304213c3e298495e12497Ed3E56E41

CREATE2 Salt: 0x...
==========================================
```

**Save the predicted address** - this will be your contract's permanent address.

### Step 4: Deploy PragmaFeeEnforcer

Deploy the contract:

```bash
forge script script/DeployPragmaFeeEnforcer.s.sol:DeployPragmaFeeEnforcer \
  --rpc-url $MONAD_RPC_URL \
  --broadcast \
  --verify
```

**Expected Output**:
```
==========================================
PragmaFeeEnforcer Deployment
==========================================

Deployer: 0xYourDeployerAddress
Treasury: 0xYourTreasuryAddress
Predicted address: 0xDeployedAddress

PragmaFeeEnforcer deployed at: 0xDeployedAddress

==========================================
Deployment Summary
==========================================

Contract: PragmaFeeEnforcer
Version: 1.0.0
Address: 0xDeployedAddress
Status: NEWLY DEPLOYED

Configuration:
  DelegationManager: 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
  ArgsEqualityCheckEnforcer: 0x44B8C6ae3C304213c3e298495e12497Ed3E56E41
  Treasury: 0xYourTreasuryAddress

CREATE2 Details:
  Salt: 0x...

Next Steps:
  1. Verify contract on block explorer
  2. Update configuration files with deployed address
  3. Run verification script: forge script script/VerifyPragmaFeeEnforcer.s.sol
  4. Test fee collection in testnet environment

Add to .env:
  PRAGMA_FEE_ENFORCER_ADDRESS= 0xDeployedAddress
==========================================
```

### Step 5: Update Configuration

Update your `.env` with the deployed address:

```bash
PRAGMA_FEE_ENFORCER_ADDRESS=0xDeployedAddress
```

### Step 6: Verify Deployment

Run the verification script to ensure correct configuration:

```bash
forge script script/VerifyPragmaFeeEnforcer.s.sol:VerifyPragmaFeeEnforcer \
  --rpc-url $MONAD_RPC_URL
```

**Expected Output**:
```
==========================================
PragmaFeeEnforcer Verification
==========================================

Contract Address: 0xDeployedAddress

[✓ PASS] Contract Deployment: Contract deployed
[✓ PASS] Version: Correct (1.0.0)
[✓ PASS] DelegationManager: Correct
[✓ PASS] ArgsEqualityCheckEnforcer: Correct
[✓ PASS] Treasury Address: Correct
[✓ PASS] Treasury is EOA: Correct (no code)
[✓ PASS] MAX_FEE_AMOUNT: Correct (1000000000000000000000 wei)

==========================================
Verification Result: ALL CHECKS PASSED ✓
==========================================
```

All checks must pass before using the contract in production.

---

## Post-Deployment Integration

### Update Pragma Configuration

Update the following files with the deployed address:

#### 1. Core Configuration (`packages/core/src/config.ts`)
```typescript
export const PRAGMA_FEE_ENFORCER_ADDRESS = "0xDeployedAddress";
```

#### 2. CLI Configuration (`apps/cli/src/config/contracts.ts`)
```typescript
export const ENFORCERS = {
  pragmaFee: "0xDeployedAddress",
  // ... other enforcers
};
```

#### 3. Web Configuration (`apps/web/src/config/contracts.ts`)
```typescript
export const CONTRACT_ADDRESSES = {
  pragmaFeeEnforcer: "0xDeployedAddress",
  // ... other contracts
};
```

### Update Documentation

Update deployment documentation:

1. Add deployment record to `.claude/memory/features/pragma-fee-enforcer.md`
2. Update `RECENT_CHANGES.md` with deployment details
3. Document the deployed address in team knowledge base

---

## Testing Fee Collection

After deployment, test the fee collection flow:

### 1. Create Test User Account
```typescript
// In packages/core tests
const testUser = await createSmartAccount();
```

### 2. Create Fee Delegation
```typescript
const feeDelegation = {
  delegate: sessionKey,
  authority: ROOT_AUTHORITY,
  caveats: [
    {
      enforcer: PRAGMA_FEE_ENFORCER_ADDRESS,
      terms: encodeFeeTerms(true, address(0), feeAmount), // 0.5% of swap amount
      args: "0x"
    }
  ]
};
```

### 3. Execute Operation with Fee
```typescript
// Swap triggers PragmaFeeEnforcer
const swapIntent = await parseIntent("swap 10 MON to USDC");
const receipt = await executeIntent(swapIntent);

// Verify fee was collected
const treasuryBalance = await getTreasuryBalance();
expect(treasuryBalance).toBeGreaterThan(previousBalance);
```

---

## Troubleshooting

### Issue: "treasury must be EOA" Error

**Cause**: `PRAGMA_TREASURY_ADDRESS` is a contract address

**Solution**:
```bash
# Verify treasury has no code
cast code $PRAGMA_TREASURY_ADDRESS --rpc-url $MONAD_RPC_URL

# Should return: 0x (empty)
# If it returns hex code, use a different EOA address
```

### Issue: Address Mismatch After Deployment

**Cause**: Different deployer address or environment variables changed

**Solution**:
```bash
# Check deployer
cast wallet address --private-key $PRIVATE_KEY

# Ensure environment variables match prediction script:
# - Same PRAGMA_TREASURY_ADDRESS
# - Same deployer private key
```

### Issue: "already deployed" Message

**Cause**: Contract already exists at predicted address

**Solution**: This is normal if you're re-running the script. The script will detect existing deployment and skip re-deployment. No action needed.

### Issue: Verification Fails

**Cause**: Configuration mismatch or network issue

**Solution**:
```bash
# Re-run verification with detailed logging
forge script script/VerifyPragmaFeeEnforcer.s.sol:VerifyPragmaFeeEnforcer \
  --rpc-url $MONAD_RPC_URL \
  -vvv

# Check specific values
cast call $PRAGMA_FEE_ENFORCER_ADDRESS "VERSION()(string)" --rpc-url $MONAD_RPC_URL
cast call $PRAGMA_FEE_ENFORCER_ADDRESS "TREASURY()(address)" --rpc-url $MONAD_RPC_URL
```

---

## Security Considerations

### Treasury Security
- Use hardware wallet for treasury address
- Consider multi-sig for production treasury
- Monitor treasury balance regularly
- Set up alerts for unexpected fee collection patterns

### Deployment Security
- Verify deployer account security
- Use `.env` and **never commit private keys**
- Test on testnet thoroughly before mainnet
- Run full test suite before deployment:
  ```bash
  forge test --match-contract PragmaFeeEnforcer -vvv
  ```

### Operational Security
- Monitor `ValidatedPayment` events for all fee collections
- Monitor `FeeOnTransferDetected` events for tokens with transfer fees
- Set up block explorer notifications for treasury address
- Regular audits of fee collection amounts

---

## Additional Resources

### Documentation
- PragmaFeeEnforcer Implementation: `.claude/memory/features/pragma-fee-enforcer.md`
- MetaMask DTK Docs: https://docs.metamask.io/delegation-toolkit
- Foundry CREATE2 Guide: https://book.getfoundry.sh/guides/create2

### Testing
- Test Suite: `packages/contracts/test/PragmaFeeEnforcer.t.sol`
- Run Tests: `forge test --match-contract PragmaFeeEnforcer`
- Coverage: `forge coverage --match-contract PragmaFeeEnforcer`

### Support
- GitHub Issues: [pragma-v2/issues](https://github.com/s0nderlabs/pragma-v2/issues)
- Team Contact: [team channels]

---

## Appendix: Environment Variable Reference

Complete `.env` template:

```bash
# ===== Network Configuration =====
MONAD_RPC_URL=https://testnet.monad.xyz

# ===== Deployer Account =====
# Private key of account deploying contracts
# NEVER commit this to version control
PRIVATE_KEY=0x...

# ===== Pragma Treasury =====
# MUST be EOA (no code)
# Receives all protocol fees (0.5% of operations)
PRAGMA_TREASURY_ADDRESS=0x...

# ===== Deployed Contracts =====
# PragmaFeeEnforcer address (set after deployment)
PRAGMA_FEE_ENFORCER_ADDRESS=0x...

# ===== Framework Contracts (Hardcoded) =====
# These are set in deployment scripts - no need to configure
# DELEGATION_MANAGER=0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
# ARGS_EQUALITY_CHECK_ENFORCER=0x44B8C6ae3C304213c3e298495e12497Ed3E56E41
```

---

**Deployment Complete!** 🎉

Your PragmaFeeEnforcer is now ready to collect protocol fees for all Pragma operations.
