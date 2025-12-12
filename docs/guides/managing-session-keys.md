# Understanding Session Keys

Learn how session keys work and how Pragma handles gas automatically.

## Prerequisites

- [ ] Connected wallet
- [ ] Basic understanding of [session keys](../concepts/session-keys.md)

## What is a Session Key?

Your session key is a temporary address that:
- Pays for transaction gas
- Executes delegated actions
- Is automatically funded from your smart account
- Is tied to your browser session

## How Automatic Funding Works

Pragma handles session key funding automatically. You don't need to do anything manually.

### Initial Setup
When you first connect, your session key is funded with ~0.5 MON from your smart account.

### During Use
When your session key balance drops below 0.1 MON and you initiate a transaction:
1. Pragma detects the low balance
2. Automatically funds the session key first
3. Then executes your requested operation
4. Refill amount: ~0.5 MON

### No Manual Intervention Needed
The system handles all funding automatically. Just ensure your smart account has MON.

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
```

### Detailed Info

**Type:**
```
What's my account info?
```

Shows session key address along with smart account and owner info.

## Gas Costs Reference

Different operations use different amounts of gas:

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
- Access only their own MON balance (~0.5 MON)

### What Session Keys Cannot Do
- Access your smart account directly
- Execute unauthorized transactions
- Drain your main wallet

### If Compromised
If you suspect your session key is compromised:

1. **Risk is limited**: Only the session key balance (~0.5 MON max)
2. **Delegations expire**: All delegations expire in 5 minutes
3. **Disconnect**: Settings > Disconnect to invalidate the session key
4. **Reconnect**: A new session key is generated automatically

## Troubleshooting

### "Session Key Low Balance"

**Cause:** Balance below 0.1 MON threshold

**Solution:** The system will auto-fund on your next transaction. Just ensure your smart account has MON.

### "Funding Failed"

**Cause:** Smart account doesn't have enough MON

**Solution:** Add MON to your smart account first:
```
What's my MON balance?
```

If your smart account MON is low, send more MON to your smart account address.

### "Session Key Not Found"

**Cause:** Session may have expired or browser data was cleared

**Solution:** Disconnect and reconnect:
1. Settings > Disconnect
2. Connect again
3. New session key generated automatically

## Best Practices

### Trust the Automatic System
The funding system handles everything. No manual intervention needed.

### Keep MON in Smart Account
Ensure your smart account has MON for:
- Operations you want to perform
- Session key auto-refills

### Check Balance Occasionally
If curious about gas usage:
```
What's my session key balance?
```

### Disconnect If Concerned
When in doubt about security:
1. Go to Settings
2. Click Disconnect
3. Reconnect to get a fresh session key

## Technical Details

### Two Funding Methods

Pragma uses different methods based on current balance:

**UserOp Funding (Balance < 0.02 MON)**
- Uses bundler to fund
- Session key doesn't pay gas
- Used for initial funding

**Delegation Funding (Balance >= 0.02 MON)**
- Session key pays for its own refill
- More gas efficient
- Used for refills

You don't need to manage this - it's completely automatic!

## Summary

| Task | How |
|------|-----|
| Check balance | `What's my session key balance?` |
| Funding | Automatic - no action needed |
| Security concern | Settings > Disconnect > Reconnect |
| Learn more | `What's my account info?` |

The key takeaway: **Session key management is automatic.** Just ensure your smart account has MON, and Pragma handles the rest.
