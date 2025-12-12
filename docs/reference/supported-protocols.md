# Supported Protocols

Pragma integrates with leading DeFi protocols on Monad.

## DEX Aggregation

### Monorail

**Type:** DEX Aggregator
**Used For:** Token swaps

Monorail aggregates liquidity from multiple DEXs to find the best swap rates.

**Features:**
- Best price discovery across DEXs
- Optimized routing
- MEV protection
- Low slippage

**How Pragma Uses It:**
```
Swap 1 MON to USDC
```
Pragma fetches quotes from Monorail and executes the optimal route.

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
Stake 5 MON
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
| Monorail | DEX Aggregator | Via swap spread |
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
- Additional DEX aggregators
- More liquid staking options
- Native Monad NFT marketplaces
- Lending/borrowing protocols

---

## Checking Protocol Status

Get current APR and rates:
```
What's the aPriori APR?
```

Check swap rates:
```
Swap 1 MON to USDC
```
(View quote without confirming)
