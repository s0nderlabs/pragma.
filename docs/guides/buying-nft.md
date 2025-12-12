# Buying an NFT

Learn how to browse, find, and purchase NFTs on Monad through Pragma.

## Prerequisites

- [ ] Connected wallet
- [ ] MON in your smart account (enough to cover NFT price + gas)
- [ ] Basic understanding of [NFT trading](../features/nfts.md)

## Step 1: Discover Collections

Let's see what's trending on Monad.

**Type:**
```
What are the top NFT collections?
```

**Response:**
```
Top Monad NFT Collections (by 24h Volume):

1. Monad Punks (monad-punks) ✓
   Floor: 0.45 MON (~$1.58) | 24h Vol: ~1.2K MON

2. Skrumpeys (skrumpeys) ✓
   Floor: 0.12 MON (~$0.42) | 24h Vol: ~800 MON

3. Monad Apes (monad-apes)
   Floor: 0.8 MON (~$2.80) | 24h Vol: ~500 MON
```

## Step 2: Browse a Collection

Let's look at monad-punks. Notice we use the **slug** (monad-punks), not the display name.

**Type:**
```
Browse monad-punks
```

**Response:**
```
Found 15 listings in "monad-punks":

1. Monad Punk #123 - 0.5 MON (~$1.75)
2. Monad Punk #456 - 0.55 MON (~$1.93)
3. Monad Punk #789 - 0.6 MON (~$2.10)
4. Monad Punk #101 - 0.65 MON (~$2.28)
5. Monad Punk #202 - 0.7 MON (~$2.45)
...and 10 more

Floor Price: 0.45 MON
```

## Step 3: Filter by Price (Optional)

Want only affordable options?

**Type:**
```
Browse monad-punks under 0.6 MON
```

This shows only listings at or below 0.6 MON.

## Step 4: Check NFT Details (Optional)

Want to see traits before buying?

**Type:**
```
Show traits for monad-punk #123
```

**Response:**
```
Monad Punk #123

Traits:
- Background: Blue
- Body: Robot
- Eyes: Laser
- Mouth: Grin
- Headwear: Crown

Rarity Rank: #456 / 10000
```

## Step 5: Get a Buy Quote

Found one you like? Let's get a quote.

**Type:**
```
Buy monad-punk #123
```

**Response:**
```
NFT Buy Quote:

NFT: Monad Punk #123
Collection: monad-punks
Token ID: 123
Price: 0.5 MON (~$1.75)
Protocol Fee: 0.005 MON (1%)
Total Cost: ~0.505 MON + gas

Quote valid for 5 minutes.
Would you like to proceed?
```

## Step 6: Review the Quote

**What to Check:**
- **NFT**: Is this the one you want?
- **Price**: Is it what you expected?
- **Total Cost**: Price + 1% fee + gas

## Step 7: Confirm Purchase

**Type:**
```
yes
```

**What Happens:**
1. Delegation created for NFT purchase
2. Seaport order fulfillment prepared
3. Transaction submitted
4. NFT transferred to your wallet

## Step 8: Wait for Confirmation

```
[NFT Buy] Creating delegation...
[NFT Buy] Fetching fulfillment data...
[NFT Buy] Submitting transaction...
[NFT Buy] Waiting for confirmation...
```

## Step 9: Review Receipt

```
NFT Purchase Complete!

NFT: Monad Punk #123
Collection: monad-punks
Price: 0.5 MON (~$1.75)
Transaction: 0xabcd...
Block: 12345
Status: Success

The NFT has been transferred to your wallet!
```

## Step 10: Verify Ownership

**Type:**
```
Show my NFTs
```

You should see your new NFT in the list!

## Congratulations!

You now own an NFT on Monad!

## Alternative Flows

### Buy Cheapest in Collection

**Type:**
```
Buy the cheapest monad-punk
```

Pragma finds and quotes the floor-price NFT.

### Buy Specific Token ID

If you know the exact token:

**Type:**
```
Buy #456 from monad-punks
```

## Tips

### Research Before Buying
- Check floor price trends
- Look at recent sales
- Verify it's the official collection

### Check Traits
For PFP collections, rare traits = higher value. Check before buying.

### Compare Prices
Look at recent sales, not just listings:
```
Show activity for monad-punks
```

### Start with Floor
Buy floor-priced NFTs to learn the process with lower risk.

### Watch Gas
Large purchases during high activity cost more gas.

## Troubleshooting

### "NFT Not Listed"
The NFT isn't for sale. Try browsing:
```
Browse monad-punks
```

### "Insufficient Balance"
You need more MON. Check:
```
What's my MON balance?
```

### "Quote Expired"
Request a new quote:
```
Buy monad-punk #123
```

### "Collection Not Found"
Check the exact slug:
```
Search for monad punks
```

### "Transaction Failed"
The NFT may have been bought by someone else. Try a different one.

## Summary

| Step | Command |
|------|---------|
| Discover | `What are the top NFT collections?` |
| Browse | `Browse monad-punks` |
| Filter | `Browse monad-punks under 1 MON` |
| Details | `Show traits for monad-punk #123` |
| Buy | `Buy monad-punk #123` |
| Confirm | `yes` |
| Verify | `Show my NFTs` |

## Next Steps

- Learn to [sell NFTs](../features/nfts.md#selling-nfts)
- Explore [Managing Session Keys](managing-session-keys.md)
- Check out other [Features](../features/README.md)
