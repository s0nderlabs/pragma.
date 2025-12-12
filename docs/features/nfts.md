# NFT Trading

Browse, buy, sell, and transfer NFTs on Monad through OpenSea integration.

## Discovering NFTs

### Browse Trending Collections
```
What are the top NFT collections?
```

```
Show me trending NFTs on Monad
```

### Search for a Collection
```
Search for monad punks collection
```

```
Find skrumpeys NFT
```

### Browse a Specific Collection
```
Show me monad-punks NFTs
```

```
Browse monad-apes under 1 MON
```

### Get Collection Info
```
Info on monad-punks
```

```
What's the floor price of skrumpeys?
```

## Viewing Your NFTs

### See All Your NFTs
```
Show my NFTs
```

### Filter by Collection
```
Show my monad-punks NFTs
```

### Get NFT Details
```
Show traits for monad-punk #123
```

```
What's the rarity of #456?
```

## Buying NFTs

### Step 1: Find an NFT
Browse or search for the NFT you want:
```
Browse monad-punks
```

### Step 2: Get a Quote
```
Buy monad-punk #123
```

Pragma shows:
```
NFT Buy Quote:

- NFT: Monad Punk #123
- Collection: monad-punks
- Price: 0.5 MON (~$1.75)
- Protocol Fee: 0.005 MON (1%)
- Total Cost: 0.505 MON

Quote valid for 5 minutes.
Would you like to proceed?
```

### Step 3: Confirm
Type **"yes"** to complete the purchase.

## Selling NFTs

### List for Sale
```
List my NFT #123 from 0x6919... for 0.5 MON
```

Or with duration:
```
List my monad-punk #123 for 2 MON for 30 days
```

### What Happens
1. Pragma approves the OpenSea conduit (if needed)
2. Creates a Seaport listing order
3. Signs and submits to OpenSea
4. Your NFT is listed for sale

### Default Duration
- Default: 7 days
- Can specify: 1-365 days

### Cancel a Listing
Currently, cancel listings directly on OpenSea.

## Transferring NFTs

### Send to an Address
```
Send NFT #123 from 0x6919... to 0x1234...
```

### Send to a NAD Name
```
Transfer my monad-punk #123 to alice.nad
```

### ERC1155 (Multiple Copies)
```
Send 5 copies of NFT #42 from 0x... to alice.nad
```

## Viewing Activity

### Collection Activity
```
Show activity for monad-punks
```

### Your NFT Activity
```
Show my NFT activity
```

### Specific NFT History
```
Show activity for #123 from monad-punks
```

Activity includes:
- Sales
- Transfers
- Listings
- Offers

## Fee Structure

| Action | Fee |
|--------|-----|
| **Buy** | 1% (Pragma) + marketplace fees |
| **Sell (List)** | Free |
| **Transfer** | Free |
| **Browse/View** | Free |

## Understanding Listings

When browsing, you'll see:
```
Found 15 listings in "monad-punks":

1. Monad Punk #123 - 0.5 MON (~$1.75)
2. Monad Punk #456 - 0.6 MON (~$2.10)
3. Monad Punk #789 - 0.65 MON (~$2.28)
...

Floor Price: 0.45 MON (~$1.58)
Active Listings: 523
```

## Collection Stats

Get detailed stats:
```
Info on monad-punks
```

Shows:
- Floor price
- Total supply
- Number of owners
- Active listings
- 24h volume

## Quick Mode

With Quick Mode enabled:
- Purchases execute immediately after quote
- Listings and transfers execute immediately
- Same security protections apply

## Multi-Step NFT Operations

### Swap and Buy
```
Swap 1 MON to WMON and buy monad-punk #123
```

### Buy Multiple (Sequential)
```
Buy monad-punk #123
```
Then:
```
Buy monad-punk #456
```

## Common Issues

### "NFT Not Found"
The token ID may not exist or the collection slug is wrong:
```
Search for monad punks collection
```

### "NFT Not Listed"
The NFT isn't currently for sale. Try:
```
Browse monad-punks
```

### "Insufficient Balance"
You need enough MON/WMON plus gas:
```
What's my MON balance?
```

### "Listing Failed"
- Check you own the NFT
- Ensure the conduit is approved
- Try again or check OpenSea directly

## Best Practices

1. **Verify the collection**: Check it's the official collection
2. **Compare prices**: Look at floor price and recent sales
3. **Check traits**: For PFP collections, traits affect value
4. **Watch gas**: Large purchases during high activity cost more
5. **Start small**: Buy cheaper NFTs first to learn the flow
6. **Use collection slugs**: More reliable than searching by name
