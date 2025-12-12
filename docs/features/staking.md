# Staking MON

Earn staking rewards by converting your MON to aprMON through aPriori liquid staking.

## What is aPriori?

**aPriori** is a liquid staking protocol on Monad. When you stake MON:

1. Your MON is deposited into the staking pool
2. You receive **aprMON** tokens in return
3. aprMON appreciates in value over time (unlike rebasing)
4. You can unstake anytime (with a waiting period)

## Staking MON

### Basic Stake
```
Stake 10 MON
```

### Stake All
```
Stake all my MON
```

### Check What You'll Receive
```
How much aprMON will I get for 10 MON?
```

## Understanding the Stake

When you stake, Pragma shows:

```
Stake ready:

- Input: 10.0 MON
- Protocol Fee: 0.10 MON (1%)
- Net Staked: 9.90 MON
- You'll Receive: ~9.90 aprMON

Would you like to proceed?
```

### How aprMON Works

Unlike rebasing tokens, aprMON uses an **appreciation model**:
- Your aprMON balance stays constant
- The value of each aprMON increases over time
- Current rate: 1 aprMON = ~1.00X MON (increases with rewards)

## Unstaking

Unstaking is a **two-step process**:

### Step 1: Request Unstake
```
Unstake my aprMON
```

Or unstake a specific amount:
```
Unstake 5 aprMON
```

**What happens:**
- Your aprMON is locked
- A withdrawal request is created
- You receive a **Request ID**

### Step 2: Wait for Epoch
After requesting:
- **Testnet**: Instant (no waiting)
- **Mainnet**: 12-18 hours (one epoch)

Check status:
```
Check my unstake status
```

### Step 3: Claim
Once the epoch passes:
```
Claim unstake 42
```

Or claim multiple:
```
Claim unstake 42, 43, 44
```

## Checking Unstake Status

```
Check my unstake status
```

Shows:
- **Claimable**: Ready to claim now
- **Pending**: Still waiting for epoch
- **Completed**: Already claimed

Example response:
```
Unstake Status:

Ready to Claim (2):
- Request #42: 5.0 aprMON -> 4.995 MON (CLAIMABLE)
- Request #43: 3.0 aprMON -> 2.997 MON (CLAIMABLE)

Pending (1):
- Request #44: 2.0 aprMON -> 1.998 MON (waiting ~6 hours)

Tip: Claim all at once to save gas: "claim unstake 42, 43"
```

## Fee Structure

| Operation | Fee | Who Collects |
|-----------|-----|--------------|
| Stake | 1% | Pragma |
| Unstake Request | Free | - |
| Claim | 0.1% | aPriori |

**Example:**
- Stake 10 MON
- Pragma fee: 0.10 MON (1%)
- Net staked: 9.90 MON
- Later, claim: 9.89 MON (0.1% aPriori fee)

## Staking Rewards

Rewards come from:
1. **Validator staking rewards**: Base yield from network validation
2. **MEV rewards**: Additional yield from transaction ordering

**Note**: APR varies based on network conditions. Check current rates:
```
What's the current aPriori APR?
```

## Multi-Step Operations

Pragma can combine operations:

### Swap and Stake
```
Swap 100 USDC to MON and stake it
```

### Unstake and Swap
```
Unstake all my aprMON
```
Then after claiming:
```
Swap all my MON to USDC
```

## Quick Mode

With Quick Mode enabled:
- Stake and unstake execute immediately
- Claims still require explicit action

## Common Issues

### "Insufficient MON"
You need enough MON for staking plus gas:
```
What's my MON balance?
```

### "Request Not Found"
The request ID may be invalid or already claimed:
```
Check my unstake status
```

### "Not Yet Claimable"
The epoch hasn't passed yet. Check status for timing:
```
Check my unstake status
```

### "Session Key Low Balance"
Your session key needs MON for gas. It will auto-refill when you attempt your next transaction if your smart account has MON.

## Best Practices

1. **Start small**: Test with a small amount first
2. **Understand the wait**: Mainnet unstaking takes 12-18 hours
3. **Batch claims**: Claim multiple requests at once to save gas
4. **Check APR**: Rates vary, verify before large stakes
5. **Keep some MON liquid**: Don't stake everything in case you need it
