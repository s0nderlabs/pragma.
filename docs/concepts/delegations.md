# Delegations

Delegations are time-limited permissions that allow your session key to execute specific actions on your behalf.

## What is a Delegation?

A delegation is a **signed permission** that says:
> "I (owner) allow this address (session key) to perform this specific action on my smart account, with these constraints, until this time."

## Key Properties

| Property | Value | Purpose |
|----------|-------|---------|
| **Delegate** | Session key address | Who can execute |
| **Action** | Specific function call | What they can do |
| **Constraints** | Caveats | Limitations and requirements |
| **Expiry** | 5 minutes | Time limit |

## How Delegations Work

### Step 1: You Request an Action
```
Swap 1 MON to USDC
```

### Step 2: Pragma Creates a Delegation
```
Delegation {
  delegator: your_smart_account,
  delegate: session_key_address,
  target: monorail_aggregator,
  selector: aggregate(),
  caveats: [timestamp, nonce, calldata_enforcement],
  expiry: now + 5 minutes
}
```

### Step 3: You Sign (Automatically)
Your Web3Auth key signs the delegation via EIP-712 typed data.

### Step 4: Session Key Executes
The session key submits the delegation to the blockchain with the actual calldata.

### Step 5: Blockchain Validates
The Delegation Manager contract:
1. Verifies your signature
2. Checks all caveats
3. Executes if valid

## Caveat Enforcers

Caveats are rules that must be satisfied for a delegation to be valid:

### TimestampEnforcer
Ensures the delegation hasn't expired.
- Default: 5 minutes from creation
- Prevents stale delegations from executing

### NonceEnforcer
Ensures delegations are used in order.
- Sequential nonce per smart account
- Prevents replay attacks

### LimitedCallsEnforcer
Limits how many times a delegation can be used.
- Usually: 1 call per delegation
- Prevents reuse

### AllowedMethodsEnforcer
Restricts which function can be called.
- Whitelist specific selectors
- Prevents unexpected calls

### AllowedCalldataEnforcer
Validates specific bytes in the calldata.
- **Critical for security**
- Enforces parameters like recipient, amount

### NativeTokenTransferAmountEnforcer
Limits how much native MON can be sent.
- Prevents draining more than intended

### PragmaFeeEnforcer
Collects protocol fees during execution.
- Deducts 1% from input
- Sends to protocol treasury

## Parameter Enforcement

This is the most important security feature. Pragma enforces specific calldata bytes:

### Swap Enforcement
```
Byte Offset 132: Destination address
- Ensures swap output goes to YOUR address
- Prevents output theft
```

### Transfer Enforcement
```
Byte Offset 4: Recipient address
Byte Offset 36: Amount
- Ensures correct recipient and amount
- Prevents sending to wrong address
```

### Approve Enforcement
```
Byte Offset 4: Spender address
Byte Offset 36: Amount
- Ensures correct approval target and limit
- Prevents over-approval attacks
```

## Why This Matters

### Without Enforcement
```
Malicious calldata could:
- Redirect swap output to attacker
- Send tokens to wrong recipient
- Approve unlimited amount to attacker
```

### With Enforcement
```
Blockchain validates:
- Output goes to your address (enforced)
- Correct recipient (enforced)
- Exact amount (enforced)
```

## Delegation Lifecycle

```
Created → Signed → Submitted → Validated → Executed → Consumed
   │         │         │           │          │          │
   │         │         │           │          │          └─ Can't reuse
   │         │         │           │          └─ Action performed
   │         │         │           └─ Caveats checked
   │         │         └─ Session key sends tx
   │         └─ Owner signs via EIP-712
   └─ After quote confirmed
```

## Multi-Delegation Operations

Some operations require multiple delegations:

### Swap (requires approval)
```
Delegation 1: approve(aggregator, amount)
Delegation 2: swap(tokenIn, tokenOut, amount, minOut)
```

### Stake (with fee)
```
Delegation 1: stake(amount)
Fee Delegation: allowance for fee collection
```

## Viewing Active Delegations

Currently, delegations are ephemeral (5-minute expiry). You can't "view" active delegations because they expire quickly.

## Revoking Delegations

Since delegations expire in 5 minutes, revocation is rarely needed. If you need to revoke:

1. **Wait**: Delegation expires automatically
2. **Revoke session key**: Invalidates all delegations for that key

```
Revoke my session key
```

## Security Summary

| Attack | Prevention |
|--------|------------|
| Replay | Nonce enforcer |
| Stale execution | Timestamp enforcer |
| Wrong recipient | Calldata enforcer |
| Wrong amount | Calldata enforcer |
| Over-approval | Calldata enforcer |
| Output theft | Destination enforcer |
| Unlimited calls | Limited calls enforcer |

## Technical Details

### EIP-712 Signature
Delegations are signed using EIP-712 typed data for:
- Human-readable signing
- Replay protection across chains
- Standard format

### Delegation Manager
- Contract: `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`
- Validates all delegations
- Executes via `redeemDelegations()`

### Gas Costs
Each caveat check uses gas. More caveats = higher gas. Pragma optimizes for security while minimizing gas.
