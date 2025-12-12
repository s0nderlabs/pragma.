# Managing Session Keys

Learn how to monitor, fund, and manage your session key for optimal gas handling.

## Prerequisites

- [ ] Connected wallet
- [ ] Basic understanding of [session keys](../concepts/session-keys.md)

## Understanding Your Session Key

Your session key is a temporary address that:
- Pays for transaction gas
- Executes delegated actions
- Is automatically funded from your smart account
- Can be managed manually if needed

## Checking Session Key Balance

### Basic Check

**Type:**
```
What's my session key balance?
```

**Response (Healthy):**
```
Session Key Balance: 0.45 MON

Address: 0xabcd...1234
Status: Active

This balance is used for gas fees.
Auto-refills when below 0.1 MON.
```

**Response (Low):**
```
⚠️ Session Key Balance: 0.05 MON (LOW)

Address: 0xabcd...1234
Threshold: 0.1 MON

Will auto-fund on next transaction.
Or manually: "fund my session key"
```

### Detailed Info

**Type:**
```
What's my account info?
```

Shows session key address along with other account details.

## Automatic Funding

Session keys auto-fund in two scenarios:

### 1. Initial Setup
When you first connect, your session key is funded with ~0.5 MON.

### 2. Low Balance Trigger
When balance drops below 0.1 MON and you initiate a transaction:
- Pragma checks balance before execution
- If low, funds first, then executes
- Refill amount: ~0.5 MON

## Manual Funding

### Basic Fund

**Type:**
```
Fund my session key
```

**Response:**
```
Session Key Funding:

Current Balance: 0.05 MON
Adding: 0.5 MON
New Balance: ~0.55 MON

Would you like to proceed?
```

**Type:**
```
yes
```

### Fund for Specific Operations

If you're planning multiple operations:

**Type:**
```
Fund my session key for 5 swaps
```

Pragma calculates the needed amount:
- Swaps use ~0.14 MON each
- 5 swaps = ~0.70 MON needed
- Funds accordingly

## Withdrawing Session Key Balance

If you have excess MON in your session key:

### Withdraw All

**Type:**
```
Withdraw all session key balance
```

**Response:**
```
Session Key Withdrawal:

Current Balance: 0.85 MON
Gas Reserve: 0.005 MON
Withdrawing: 0.845 MON
To: Your smart account

Would you like to proceed?
```

### Withdraw Specific Amount

**Type:**
```
Withdraw 0.5 MON from session key
```

### Withdraw to Different Address

**Type:**
```
Withdraw session key balance to 0x1234...
```

## Monitoring Gas Usage

### Check After Operations

After transactions, note the gas used:

```
Swap Complete!
...
Gas Used: 0.015 MON
```

### Estimate Before Operations

**Type:**
```
Check if session key has enough for 3 swaps
```

**Response:**
```
Session Key Check:

Current Balance: 0.45 MON
Required for 3 swaps: ~0.42 MON
Status: ✅ Sufficient

You have enough for the planned operations.
```

## Gas Costs Reference

| Operation | Typical Gas Cost |
|-----------|-----------------|
| Swap | ~0.14 MON |
| Stake | ~0.07 MON |
| Unstake Request | ~0.075 MON |
| Unstake Claim | ~0.07 MON |
| Transfer | ~0.04 MON |
| Wrap/Unwrap | ~0.04 MON |
| NFT Buy | ~0.12 MON |
| NFT List | ~0.08 MON |
| NFT Transfer | ~0.05 MON |

## Session Key Security

### What Session Keys Can Do
- Execute delegated transactions
- Pay gas for those transactions
- Access only their own MON balance

### What Session Keys Cannot Do
- Access your smart account directly
- Execute unauthorized transactions
- Drain your main wallet

### If Compromised
If you suspect your session key is compromised:

1. **Risk is limited**: Only the session key balance (~0.5 MON)
2. **Revoke it**:
   ```
   Revoke my session key
   ```
3. **Reconnect**: A new session key is generated

## Troubleshooting

### "Session Key Low Balance"

**Cause:** Balance below 0.1 MON threshold

**Solutions:**
1. Let it auto-fund on next transaction
2. Manually fund:
   ```
   Fund my session key
   ```

### "Funding Failed"

**Cause:** Smart account doesn't have enough MON

**Solution:** Add MON to your smart account first:
```
What's my MON balance?
```

### "Withdrawal Failed"

**Cause:** Not enough balance for withdrawal + gas

**Solution:** Leave small amount for gas:
```
Withdraw 0.4 MON from session key
```

### "Session Key Not Found"

**Cause:** Session may have expired or been revoked

**Solution:** Disconnect and reconnect:
1. Settings > Disconnect
2. Connect again
3. New session key generated

## Best Practices

### Let Auto-Funding Work
The automatic system handles most cases. Manual intervention rarely needed.

### Don't Over-Fund
~0.5 MON is enough for many transactions. No need to keep more.

### Withdraw Before Large Breaks
If not using Pragma for a while:
```
Withdraw all session key balance
```

### Monitor Occasionally
Check balance periodically:
```
What's my session key balance?
```

### Revoke If Concerned
When in doubt:
```
Revoke my session key
```

## Advanced: Two Funding Methods

Pragma uses different methods based on balance:

### UserOp Funding (Balance < 0.02 MON)
- Uses bundler to fund
- Session key doesn't pay gas
- Used for initial funding

### Delegation Funding (Balance >= 0.02 MON)
- Session key pays for its own refill
- More gas efficient
- Used for refills

You don't need to manage this - it's automatic!

## Summary

| Task | Command |
|------|---------|
| Check balance | `What's my session key balance?` |
| Manual fund | `Fund my session key` |
| Fund for operations | `Fund my session key for 5 swaps` |
| Withdraw all | `Withdraw all session key balance` |
| Withdraw specific | `Withdraw 0.5 MON from session key` |
| Check sufficiency | `Check if session key has enough for 3 swaps` |
| Revoke | `Revoke my session key` |
