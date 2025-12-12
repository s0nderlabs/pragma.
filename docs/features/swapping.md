# Swapping Tokens

Swap any supported token for another with the best rates from multiple DEX aggregators.

## How It Works

Pragma uses **both Monorail and 0x** DEX aggregators to find the best swap rates. When you request a swap:

1. **Quote Phase**: Pragma fetches quotes from both aggregators in parallel
2. **Best Price Selection**: The aggregator with the better rate is automatically selected
3. **Review**: You see the expected output, exchange rate, and fees
4. **Execution**: After confirmation, the swap executes on-chain
5. **Fallback**: If the primary aggregator fails during execution, Pragma automatically tries the other

## Basic Commands

### Simple Swap
```
Swap 50 MON to USDC
```

### Swap with Specific Amount
```
Swap 100 MON to WMON
```

### Swap All
```
Swap all my MON to USDC
```

### Swap Half
```
Swap half my USDC to MON
```

### Get Quote Only
```
How much USDC can I get for 50 MON?
```

## Understanding the Quote

When you request a swap, Pragma shows:

```
Swap quote ready:

- From: 50.0 MON (49.5 MON after 1% fee)
- To: ~124.5 USDC
- Protocol Fee: 0.5 MON (1%)
- Exchange Rate: 1 MON = 2.515 USDC
- Slippage: 5.00% max
- Valid for: 5 minutes

Would you like to proceed?
```

### Quote Details

| Field | Description |
|-------|-------------|
| **From** | Input amount and token |
| **To** | Expected output (may vary due to slippage) |
| **Protocol Fee** | 1% fee deducted from input |
| **Exchange Rate** | Current market rate |
| **Slippage** | Maximum acceptable price movement |
| **Valid for** | Quote expiration time |

## Confirming the Swap

After reviewing the quote:

- Type **"yes"**, **"confirm"**, or **"proceed"** to execute
- Type **"no"** or **"cancel"** to abort
- The quote expires after 5 minutes

## Slippage Settings

Default slippage is 5%. You can adjust it:

```
Swap 50 MON to USDC with 1% slippage
```

**Slippage limits:**
- Minimum: 0.5% (50 bps)
- Default: 5% (500 bps)
- Maximum: 15% (1500 bps)

**Why slippage matters:**
- Too low: Transaction may fail if price moves
- Too high: You may receive less than expected

## Fee Structure

| Component | Amount | Description |
|-----------|--------|-------------|
| Protocol Fee | 1% | Deducted from input amount |
| Gas | Variable | Paid by session key (~0.01-0.02 MON) |
| DEX Fees | Included | Built into the exchange rate |

**Example:**
- You swap 100 MON
- Protocol fee: 1 MON
- Amount swapped: 99 MON
- Output: ~248 USDC (at 1 MON = 2.50 USDC rate)

## Supported Tokens

Pragma can swap **any token** on Monad. The verified token list comes from Monorail:

- **Native**: MON, WMON
- **Stablecoins**: USDC, USDT
- **LST**: aprMON, shMON, sMON, gMON
- **Ecosystem**: DAK, YAKI, CHOG, and more

### Unverified Token Warnings

You can trade tokens not on the verified list, but Pragma will show a warning:

```
⚠️ WARNING: Token XYZ is NOT verified by Monorail.

This token could be:
- A scam or rug pull token
- A honeypot (can buy but cannot sell)
- A fee-on-transfer token
- A malicious contract
```

Always verify contract addresses independently before trading unverified tokens.

To see verified tokens:
```
What tokens can I swap?
```

## Multi-Step Swaps

Pragma can handle complex swaps automatically:

```
Swap all my USDC to MON and then stake it
```

This executes as two operations:
1. Swap USDC to MON
2. Stake the MON to aprMON

## Quick Mode Swaps

With Quick Mode enabled:
- Swaps execute immediately after quote
- No confirmation needed
- Same security protections apply

Enable with:
```
Enable quick mode
```

## Common Issues

### "Insufficient Balance"
You don't have enough of the input token. Check your balance:
```
What's my USDC balance?
```

### "Quote Expired"
Quotes are valid for 5 minutes. Request a new quote:
```
Swap 50 MON to USDC
```

### "Slippage Too High"
The price moved more than your slippage tolerance. Try:
- A smaller amount
- Higher slippage setting
- Waiting for less volatile conditions

### "Token Not Found"
The token may not be verified. Check:
```
Is YAKI token verified?
```

## Best Practices

1. **Start small**: Test with small amounts first
2. **Check the rate**: Compare with other sources
3. **Mind the slippage**: Higher for volatile pairs
4. **Watch gas**: Large swaps during high activity may cost more
5. **Use Quick Mode carefully**: Great for speed, but skips review
