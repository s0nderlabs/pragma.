# Staking Guide

Learn how to stake MON to earn rewards via aPriori liquid staking.

## Prerequisites

- [ ] Connected wallet
- [ ] At least 1 MON in your smart account
- [ ] Basic understanding of [staking](../features/staking.md)

## Part 1: Staking MON

### Step 1: Check Your MON Balance

**Type:**
```
What's my MON balance?
```

**Expected:**
```
You have 10.0 MON (~$35.00)
```

Decide how much you want to stake. Remember to keep some for gas and transactions.

### Step 2: Request Stake

Let's stake 5 MON.

**Type:**
```
Stake 5 MON
```

**Response:**
```
Stake Ready:

Input: 5.0 MON
Protocol Fee: 0.05 MON (1%)
Net Staked: 4.95 MON
You'll Receive: ~4.95 aprMON

Would you like to proceed?
```

### Step 3: Confirm

**Type:**
```
yes
```

### Step 4: Wait for Execution

```
[Stake] Creating delegation...
[Stake] Submitting transaction...
[Stake] Waiting for confirmation...
```

### Step 5: Review Receipt

```
Stake Complete!

Staked: 4.95 MON
Received: 4.95 aprMON
Transaction: 0xabcd...
Block: 12345
Status: Success

Your MON is now earning staking rewards!
```

### Step 6: Verify

**Type:**
```
What's my balance?
```

You should see:
- 5 MON less
- ~4.95 aprMON (new)

## Part 2: Checking Rewards

aprMON uses an appreciation model. Your balance stays the same, but each aprMON becomes worth more MON over time.

### Check Current Value

**Type:**
```
What's my aprMON worth in MON?
```

Or check current rate:
```
What's the current APR on aPriori?
```

## Part 3: Unstaking (Withdrawal)

Unstaking is a two-step process with a waiting period.

### Step 1: Request Unstake

**Type:**
```
Unstake 2 aprMON
```

**Response:**
```
Unstake Request:

Amount: 2.0 aprMON
You'll Receive: ~2.0 MON (after epoch)

Note: Withdrawal requires waiting 12-18 hours.

Would you like to proceed?
```

### Step 2: Confirm

**Type:**
```
yes
```

### Step 3: Note Your Request ID

```
Unstake Request Submitted!

Request ID: 42
aprMON Locked: 2.0
Estimated Return: ~2.0 MON
Status: Pending

⏳ Wait 12-18 hours, then check status.
Use: "check unstake status"
```

**Important:** Note the Request ID (42 in this example). You'll need it to claim.

## Part 4: Waiting Period

### Check Status

After a few hours:

**Type:**
```
Check my unstake status
```

**Response (Still Waiting):**
```
Unstake Status:

Request #42: 2.0 aprMON
Status: ⏱️ PENDING
Claimable in: ~8 hours

Check again later or enable notifications.
```

**Response (Ready):**
```
Unstake Status:

Request #42: 2.0 aprMON
Status: ✅ CLAIMABLE
MON to receive: 1.998 MON

Use: "claim unstake 42"
```

## Part 5: Claiming

Once the epoch passes and status shows CLAIMABLE:

### Step 1: Claim

**Type:**
```
Claim unstake 42
```

### Step 2: Confirm

**Type:**
```
yes
```

### Step 3: Review Receipt

```
Unstake Claim Complete!

Request ID: 42
Claimed: 1.998 MON
aPriori Fee: 0.002 MON (0.1%)
Transaction: 0xefgh...
Status: Success

Your MON has been returned!
```

### Step 4: Verify

```
What's my balance?
```

You should see:
- Your MON balance increased
- aprMON balance decreased

## Claiming Multiple Requests

If you have several claimable requests:

**Type:**
```
Claim unstake 42, 43, 44
```

This claims all at once, saving gas!

## Complete Timeline

```
Day 0:
  - Stake 5 MON
  - Receive 4.95 aprMON

Day 30:
  - Request unstake 2 aprMON
  - Get Request ID #42

Day 30.5-31:
  - Wait for epoch (~12-18 hours)

Day 31:
  - Check status: CLAIMABLE
  - Claim request #42
  - Receive ~2.0 MON
```

## Tips

### Keep Some MON Liquid
Don't stake everything. Keep MON for:
- Gas fees
- Unexpected transactions
- Quick access to funds

### Batch Your Claims
Multiple claim requests? Claim them together to save gas.

### Check APR Before Staking
Rates vary. Verify current APR:
```
What's the aPriori APR?
```

### Understand the Wait
Unstaking takes 12-18 hours. Plan accordingly.

## Troubleshooting

### "Insufficient MON"
You need more MON to stake. The minimum is very small, but you need enough for the 1% fee too.

### "Request Not Found"
Double-check the request ID:
```
Check my unstake status
```

### "Not Yet Claimable"
The epoch hasn't passed. Check timing:
```
Check my unstake status
```

### "Already Claimed"
You already claimed this request. Check your MON balance.

## Summary

| Action | Fee | Time |
|--------|-----|------|
| Stake | 1% Pragma | Instant |
| Unstake Request | Free | Instant |
| Waiting Period | - | 12-18 hours |
| Claim | 0.1% aPriori | Instant |

## Next Steps

- Monitor your aprMON value over time
- Learn about [NFT Trading](buying-nft.md)
- Explore other [Features](../features/README.md)
