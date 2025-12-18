# Features Overview

Pragma provides a comprehensive suite of DeFi features through a simple chat interface. Here's everything you can do.

## Trading

### [Swapping Tokens](swapping.md)
Exchange any supported token for another with the best rates from multiple DEX aggregators.

```
"Swap 10 MON to USDC"
"Swap half my WMON to DAK"
"How much USDC can I get for 5 MON?"
```

**Fee**: 1% of input amount

### [Wrapping MON](wrapping.md)
Convert between MON and WMON (Wrapped MON) for DeFi compatibility.

```
"Wrap 5 MON"
"Unwrap all my WMON"
```

**Fee**: Free

## Earning

### [Staking MON](staking.md)
Earn staking rewards through aPriori liquid staking. Your MON becomes aprMON which appreciates over time.

```
"Stake 100 MON"
"Unstake my aprMON"
"Check my unstake status"
```

**Fee**: 1% on staking

## NFTs

### [NFT Trading](nfts.md)
Browse, buy, sell, and transfer NFTs on the Monad NFT marketplace via OpenSea.

```
"Show me trending NFT collections"
"Buy Skrumpey #123"
"List my NFT for 2 MON"
"Send NFT #456 to alice.nad"
```

**Fee**: 1% on purchases, free for listings/transfers

## Transfers

### [Transferring Tokens](transfers.md)
Send any token to any address. Supports NAD names (.nad) and ENS names (.eth).

```
"Send 50 USDC to 0x1234..."
"Transfer 10 MON to alice.nad"
"Send all my DAK to vitalik.eth"
```

**Fee**: Free

## Information

### Balance Queries
Check your holdings at any time.

```
"What's my balance?"
"Show all my tokens"
"How much USDC do I have?"
```

### Token Information
Get details about any token.

```
"What is the address of USDC?"
"Is YAKI token verified?"
"Show token info for 0x..."
```

### Name Resolution
Look up NAD and ENS names.

```
"What address is alice.nad?"
"Who owns 0x1234...?"
```

## AI Chat

### [AI Chat Interface](ai-chat.md)
The conversational interface that ties everything together.

```
"Help me understand staking"
"What's the current MON price?"
"How do delegations work?"
```

## Feature Comparison

| Feature | Description | Fee | Confirmation |
|---------|-------------|-----|--------------|
| Swap | Exchange tokens | 1% | Yes (or Quick Mode) |
| Stake | MON to aprMON | 1% | Yes (or Quick Mode) |
| Unstake | Request withdrawal | Free | Yes (or Quick Mode) |
| Claim | Complete withdrawal | Free | Yes (or Quick Mode) |
| NFT Buy | Purchase NFT | 1% | Yes (or Quick Mode) |
| NFT List | Sell NFT | Free | Yes (or Quick Mode) |
| NFT Transfer | Send NFT | Free | Yes (or Quick Mode) |
| Transfer | Send tokens | Free | Yes (or Quick Mode) |
| Wrap | MON to WMON | Free | Yes (or Quick Mode) |
| Unwrap | WMON to MON | Free | Yes (or Quick Mode) |
| Balance | View holdings | Free | N/A (read-only) |

## Quick Mode

All transaction features support **Quick Mode** for instant execution:

1. Enable via the lightning bolt icon
2. Or say "enable quick mode"
3. Transactions execute immediately without confirmation

**Warning**: Quick Mode skips confirmation. Make sure you understand what you're requesting before enabling.
