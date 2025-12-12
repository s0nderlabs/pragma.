# Quick Start

Get up and running with Pragma in 5 minutes. This guide walks you through connecting your wallet and making your first transaction.

## Step 1: Open Pragma

Visit the Pragma web app in your browser. You'll see a chat interface with a welcome message.

## Step 2: Connect Your Wallet

1. Click the **Connect** button in the sidebar
2. Choose your sign-in method:
   - **Google** - Fastest option, uses your Google account
   - **Email** - Enter your email and verify with a code
3. Wait for the connection to complete

**What happens behind the scenes:**
- Web3Auth creates a secure key pair for you
- Pragma deploys a smart account (your main wallet)
- A session key is generated for gas payments

## Step 3: Find Your Address

After connecting, you'll see your wallet information in the sidebar:

- **Smart Account**: Your main address (starts with `0x...`)
- **Balance**: Your MON and other token balances
- **Session Key**: Status of your gas-paying key

Copy your smart account address - you'll need it to receive tokens.

## Step 4: Fund Your Account

To use Pragma, you need MON tokens in your smart account:

1. Copy your smart account address from the sidebar
2. Send MON from an exchange or another wallet
3. Wait for the transaction to confirm
4. Your balance will update automatically

**Tip**: Start with a small amount (1-5 MON) while you're learning.

## Step 5: Your First Chat

Try asking Pragma about your balance:

```
What's my balance?
```

Pragma will respond with your current token holdings and USD values.

## Step 6: Your First Swap

Let's swap some MON to USDC:

```
Swap 0.1 MON to USDC
```

You'll see:
1. **Quote**: The expected output amount and exchange rate
2. **Fee**: 1% protocol fee
3. **Confirmation prompt**: Review and approve

Type "yes" or click confirm to execute the swap.

## Step 7: Enable Quick Mode (Optional)

For faster execution, enable **Quick Mode**:

1. Click the lightning bolt icon in the chat input
2. Or say "enable quick mode"

In Quick Mode, transactions execute immediately without confirmation. Great for experienced users, but use with caution!

## What You've Learned

- How to connect your wallet via Web3Auth
- Where to find your smart account address
- How to check your balance
- How to execute your first swap
- How to enable Quick Mode

## Next Steps

Now that you're set up, explore what Pragma can do:

- [Swapping Tokens](../features/swapping.md) - Get the best rates across DEXs
- [Staking MON](../features/staking.md) - Earn rewards with aPriori
- [Trading NFTs](../features/nfts.md) - Browse and buy NFTs on Monad

## Need Help?

If something isn't working:
- Check [Troubleshooting](../help/troubleshooting.md) for common issues
- Make sure you have enough MON for gas
- Try refreshing the page and reconnecting
