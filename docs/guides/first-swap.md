# Your First Swap

This guide walks you through executing your first token swap on Pragma.

## Prerequisites

- [ ] Connected wallet (see [Quick Start](../getting-started/quick-start.md))
- [ ] At least 0.5 MON in your smart account
- [ ] Session key funded (happens automatically)

## Step 1: Check Your Balance

First, let's see what you have to swap.

**Type:**
```
What's my MON balance?
```

**Expected Response:**
```
You have 5.0 MON (~$17.50)

Address: 0x1234...5678
```

Make sure you have at least 0.5 MON (0.1 for the swap + buffer for gas).

## Step 2: Request a Swap

Let's swap 0.1 MON to USDC.

**Type:**
```
Swap 0.1 MON to USDC
```

**What Happens:**
1. Pragma fetches quotes from DEX aggregators
2. Finds the best rate
3. Shows you the quote

## Step 3: Review the Quote

You'll see something like:

```
Swap Quote Ready:

From: 0.1 MON (0.099 MON after 1% fee)
To: ~0.25 USDC
Protocol Fee: 0.001 MON (1%)
Exchange Rate: 1 MON = 2.525 USDC
Slippage: 5.00% max
Valid for: 5 minutes

Would you like to proceed?
```

**What to Check:**
- **Amount**: Is this what you wanted to swap?
- **Output**: Is the expected output reasonable?
- **Fee**: 1% of input (0.001 MON)
- **Rate**: Compare with market rate if you want

## Step 4: Confirm the Swap

If everything looks good:

**Type:**
```
yes
```

Or:
```
confirm
```

**What Happens:**
1. Pragma creates a delegation for the swap
2. Your Web3Auth key signs it automatically
3. Session key submits the transaction
4. Transaction executes on-chain

## Step 5: Wait for Confirmation

You'll see progress updates:

```
[Swap] Creating delegation...
[Swap] Signing...
[Swap] Submitting transaction...
[Swap] Waiting for confirmation...
```

## Step 6: Review the Receipt

After a few seconds:

```
Swap Complete!

Swapped: 0.099 MON
Received: 0.248 USDC
Gas Used: 0.012 MON
Transaction: 0xabcd...1234
Block: 12345678
Status: Success

Your USDC balance has been updated.
```

## Step 7: Verify Your Balance

Confirm the swap worked:

**Type:**
```
What's my balance?
```

You should see:
- ~0.1 MON less than before
- ~0.25 USDC more than before (or new if you had none)

## Congratulations!

You've completed your first swap on Pragma!

## What You Learned

- How to check your balance
- How to request a swap quote
- How to review swap details
- How to confirm and execute
- How to verify the result

## Tips

### Start Small
Always test with small amounts first, especially for new tokens.

### Check the Rate
Compare the exchange rate with other sources to ensure it's competitive.

### Watch Slippage
The default 5% slippage is usually fine. Increase for volatile tokens.

### Quick Mode
Once comfortable, enable Quick Mode for instant execution:
```
Enable quick mode
```

## Troubleshooting

### "Insufficient Balance"
You need more of the input token. Check:
```
What's my MON balance?
```

### "Quote Expired"
The 5-minute window passed. Request a new quote:
```
Swap 0.1 MON to USDC
```

### "Transaction Failed"
Check:
- Session key has MON for gas
- The quote hasn't expired
- Market conditions haven't changed drastically

### "Token Not Found"
Use the exact token symbol:
```
What tokens can I swap?
```

## Next Steps

- Try swapping a different pair
- Learn about [Staking](staking-guide.md)
- Explore [NFT Trading](buying-nft.md)
