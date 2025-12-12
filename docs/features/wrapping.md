# Wrapping MON

Convert between MON (native token) and WMON (wrapped ERC20 version).

## What is WMON?

**WMON** (Wrapped MON) is an ERC20 token that represents MON at a 1:1 ratio.

**Why wrap?**
- Some DeFi protocols require ERC20 tokens
- Enables token approvals (ERC20 feature)
- Compatible with more smart contracts

## Wrapping (MON to WMON)

### Basic Wrap
```
Wrap 5 MON
```

### Wrap All
```
Wrap all my MON
```

### Wrap Half
```
Wrap half my MON
```

## Unwrapping (WMON to MON)

### Basic Unwrap
```
Unwrap 5 WMON
```

### Unwrap All
```
Unwrap all my WMON
```

## The Exchange Rate

Wrapping and unwrapping always use a **1:1 ratio**:
- 1 MON = 1 WMON
- 1 WMON = 1 MON
- No slippage
- No price impact

## Fee Structure

**Wrapping and unwrapping are FREE.**

| Component | Cost |
|-----------|------|
| Protocol Fee | Free |
| Gas | ~0.01 MON (paid by session key) |

## Example Flow

### Wrap
```
Wrap 10 MON
```

Response:
```
Wrap complete!

- Wrapped: 10.0 MON
- Received: 10.0 WMON
- Tx: 0xabcd...
- Block: 12345
```

### Unwrap
```
Unwrap 10 WMON
```

Response:
```
Unwrap complete!

- Unwrapped: 10.0 WMON
- Received: 10.0 MON
- Tx: 0xefgh...
- Block: 12346
```

## When to Use WMON

### Use WMON For:
- DEX trading (some pools require WMON)
- Providing liquidity
- Some DeFi protocols
- Any contract requiring ERC20

### Use MON For:
- Gas payments
- Staking via aPriori
- Simple transfers
- Native operations

## Quick Mode

With Quick Mode enabled:
- Wrap/unwrap executes immediately
- No confirmation needed

## Checking Your Balances

See both MON and WMON:
```
What's my balance?
```

Shows:
```
Your Balances:
- 5.0 MON (~$17.50)
- 10.0 WMON (~$35.00)
...
```

## Common Issues

### "Insufficient MON"
You need MON to wrap:
```
What's my MON balance?
```

### "Insufficient WMON"
You need WMON to unwrap:
```
What's my WMON balance?
```

### "Session Key Low Balance"
Your session key needs MON for gas:
```
Fund my session key
```

## Technical Details

### WMON Contract
- Address: `0x3bd359c1119da7da1d913d1c4d2b7c461115433a`
- Standard: ERC20
- Decimals: 18

### How It Works
- **Wrap**: Calls `deposit()` with MON value, mints WMON
- **Unwrap**: Calls `withdraw()`, burns WMON, returns MON

## Best Practices

1. **Keep some MON**: Always keep MON for gas
2. **Wrap only what you need**: MON is more versatile
3. **Check protocol requirements**: Some need WMON specifically
4. **Consider gas**: Each wrap/unwrap costs a small amount of gas
