# Fees

Pragma charges transparent protocol fees on certain operations to sustain development and infrastructure.

## Fee Structure

| Operation | Fee | Collected On |
|-----------|-----|--------------|
| **Swap** | 1% | Input amount |
| **Stake** | 1% | MON being staked |
| **NFT Buy** | 1% | Purchase price |
| **Transfer** | Free | - |
| **Wrap/Unwrap** | Free | - |
| **NFT List** | Free | - |
| **NFT Transfer** | Free | - |
| **Unstake Request** | Free | - |
| **Unstake Claim** | Free* | - |
| **View/Query** | Free | - |

*Unstake claim has a 0.1% fee charged by aPriori, not Pragma.

## How Fees Work

### Input-Based Fees
Fees are deducted from the **input amount**, not the output:

**Example: Swap**
```
You request: Swap 1 MON to USDC
Protocol fee: 0.01 MON (1%)
Amount swapped: 0.99 MON
You receive: ~2.48 USDC (based on 0.99 MON)
```

**Example: Stake**
```
You request: Stake 100 MON
Protocol fee: 1 MON (1%)
Amount staked: 99 MON
You receive: ~99 aprMON
```

### Why Input-Based?
- **Predictable**: You know the fee before execution
- **Simple**: No complex output calculations
- **Standard**: Follows Uniswap-style fee models

## Fee Collection

### When Collected
Fees are collected **during execution**, not before or after.

### How Collected
The `PragmaFeeEnforcer` caveat:
1. Validates fee parameters
2. Deducts fee from input
3. Sends fee to treasury
4. Executes main operation

### Treasury
- Fees go to the Pragma protocol treasury
- Used for development, infrastructure, and operations

## Fee Display

### In Quotes
When you get a quote, fees are clearly shown:
```
Swap Quote:
- From: 1.0 MON
- Protocol Fee: 0.01 MON (1%)
- Net Amount: 0.99 MON
- To: ~2.48 USDC
```

### In Receipts
After execution, fees appear in the receipt:
```
Swap Complete:
- Swapped: 0.99 MON (after 0.01 MON fee)
- Received: 2.48 USDC
```

## Free Operations

These operations have **no Pragma fee**:

### Transfers
Send any token without fees (only gas).
```
Send 100 USDC to alice.nad
// No protocol fee
```

### Wrapping
Convert MON to WMON and back without fees.
```
Wrap 10 MON
// No protocol fee
```

### NFT Listings
List your NFTs for sale without fees.
```
List NFT #123 for 2 MON
// No protocol fee (OpenSea may have fees)
```

### Unstaking
Request and claim unstaking without Pragma fees.
```
Unstake my aprMON
// No protocol fee (aPriori charges 0.1% on claim)
```

### View Operations
All read-only operations are free.
```
What's my balance?
Show my NFTs
// No fees
```

## Gas Costs

Separate from protocol fees, you pay gas for transactions:

| Operation | Typical Gas Cost |
|-----------|-----------------|
| Swap | ~0.02-0.05 MON |
| Stake | ~0.01-0.02 MON |
| Transfer | ~0.005-0.01 MON |
| Wrap | ~0.005-0.01 MON |
| NFT Buy | ~0.02-0.05 MON |

**Note**: Gas is paid by your session key, funded from your smart account.

## Third-Party Fees

Some operations have additional fees from integrated protocols:

### aPriori (Staking)
- Unstake claim: 0.1% of MON received
- Not charged by Pragma

### OpenSea (NFTs)
- Marketplace fees may apply
- Royalties to creators may apply
- Not charged by Pragma

### DEX (Swaps)
- Pool fees (usually 0.3%) are built into exchange rate
- Not separately visible

## Comparing Costs

### Simple Swap Example
```
Input: 100 MON

Pragma fee: 1.0 MON (1%)
DEX fees: ~0.3 MON (built into rate)
Gas: ~0.02 MON

Total cost: ~1.32 MON
You receive: ~246 USDC (at example rate)
```

### Staking Example
```
Input: 100 MON

Pragma fee: 1.0 MON (1%)
Gas: ~0.01 MON

Total cost: ~1.01 MON
You receive: ~99 aprMON
```

## Why Fees?

Protocol fees fund:
- **Infrastructure**: Servers, APIs, and services
- **Development**: Ongoing feature development
- **Security**: Audits and security monitoring
- **Operations**: Team and operational costs

## Fee Transparency

- Fees are always shown before execution
- No hidden fees
- All fee calculations verifiable on-chain
- Fee rates are documented in smart contracts

## Questions

### "Can I avoid fees?"
Operations like transfers and wrapping are free. For swaps and staking, the 1% fee applies.

### "Are fees negotiable?"
Currently, fees are fixed at 1% for fee-bearing operations.

### "Where can I verify fee rates?"
Fee rates are set in the `PragmaFeeEnforcer` contract and the `config.ts` file.

### "What if I see unexpected fees?"
Contact support. All fees should be clearly displayed before execution.
