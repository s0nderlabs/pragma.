# Supported Protocols

Pragma integrates with leading DeFi protocols on Monad.

## DEX Aggregation

Pragma uses a **dual aggregator system** for optimal swap pricing, querying both Monorail and 0x in parallel and selecting the best rate.

### Monorail

**Type:** DEX Aggregator
**Used For:** Token swaps (primary)

Monorail aggregates liquidity from multiple DEXs to find the best swap rates on Monad.

**Features:**
- Best price discovery across Monad DEXs
- Optimized routing
- MEV protection
- Low slippage
- Native Monad integration

### 0x Protocol

**Type:** DEX Aggregator
**Used For:** Token swaps (fallback/comparison)

0x provides cross-DEX liquidity aggregation with broad token support.

**Features:**
- Wide token coverage
- Limit order support
- Cross-chain compatibility
- Reliable fallback

### How Swap Routing Works

```
Swap 50 MON to USDC
```

1. Pragma queries **both** Monorail and 0x simultaneously
2. Compares quotes for best rate
3. Selects the winner (shown in quote as "Source")
4. If one fails, the other provides automatic fallback

---

## Liquid Staking

### aPriori

**Type:** Liquid Staking Protocol
**Used For:** MON staking

aPriori provides liquid staking for MON, allowing you to earn staking rewards while maintaining liquidity.

**Features:**
- Liquid staking (receive aprMON)
- Variable APR (staking + MEV rewards)
- Epoch-based withdrawals

**How Pragma Uses It:**
```
Stake 100 MON
```
Pragma stakes your MON and you receive aprMON.

**Withdrawal Process:**
1. Request unstake (lock aprMON)
2. Wait 12-18 hours (epoch)
3. Claim MON

**Fees:**
- Pragma: 1% on stake (deducted from input)
- aPriori: 0.1% on unstake claim

---

## NFT Marketplace

### OpenSea (Seaport)

**Type:** NFT Marketplace
**Used For:** Buying NFTs

OpenSea provides NFT listings via the Seaport protocol.

**Features:**
- Browse collections
- View floor prices
- Purchase NFTs
- View traits and metadata

**How Pragma Uses It:**
```
Browse monad-punks
Buy monad-punk #123
```

**Fees:**
- Pragma: 1% on NFT purchases
- OpenSea: Varies by collection

---

## Protocol Summary

| Protocol | Type | Fee |
|----------|------|-----|
| Monorail | DEX Aggregator (primary) | Via swap spread |
| 0x | DEX Aggregator (secondary) | Via swap spread |
| aPriori | Liquid Staking | 0.1% on unstake |
| OpenSea | NFT Marketplace | Collection-dependent |

Plus Pragma's 1% protocol fee on swaps, stakes, and NFT buys.

---

## Smart Contract Security

All integrated protocols are:
- **Audited** by reputable firms
- **Battle-tested** on mainnet or testnet
- **Open source** with verified contracts

Pragma never holds your funds directly. All operations are executed through secure smart contract interactions.

---

## Future Integrations

Planned protocol integrations:
- More liquid staking options
- Native Monad NFT marketplaces (Poply)
- Lending/borrowing protocols

---

## Checking Protocol Status

Get current APR and rates:
```
What's the aPriori APR?
```

Check swap rates:
```
Swap 50 MON to USDC
```
(View quote without confirming - shows which aggregator has best rate)
