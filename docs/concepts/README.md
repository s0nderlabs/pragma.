# Core Concepts

Understanding these concepts will help you get the most out of Pragma and understand how your transactions are secured.

## Overview

Pragma is built on several key technologies:

| Concept | What It Is | Why It Matters |
|---------|-----------|----------------|
| [Smart Accounts](smart-accounts.md) | Your wallet on Monad | Holds your assets, enables advanced features |
| [Session Keys](session-keys.md) | Temporary keys for gas | Gasless feel, security isolation |
| [Delegations](delegations.md) | Time-limited permissions | Secure execution without full access |
| [Fees](fees.md) | Protocol costs | Transparent pricing |

## How They Work Together

```
You (Web3Auth)
    │
    ▼ controls
Smart Account (holds your tokens)
    │
    ▼ grants permission via
Delegation (time-limited, specific action)
    │
    ▼ executed by
Session Key (pays gas, submits transaction)
```

## Quick Summary

### Smart Account
Your main wallet address. It's a smart contract (not a regular wallet) that holds all your tokens and NFTs. Controlled by your Web3Auth login.

### Session Key
A temporary key that executes transactions on your behalf. Funded with a small amount of MON for gas. Can be revoked anytime.

### Delegation
A signed permission allowing the session key to perform a specific action. Expires after 5 minutes. Cannot be reused.

### Fees
1% on swaps, staking, and NFT purchases. Free for transfers, wrapping, and unstaking.

## Security Model

Pragma is designed with security as the top priority:

1. **Your keys never leave your browser** - Web3Auth generates keys locally
2. **Minimal permissions** - Each delegation is for one specific action
3. **Time-limited** - Delegations expire in 5 minutes
4. **Single use** - Delegations can't be replayed
5. **Parameter enforcement** - Transaction details are locked on-chain
6. **Revocable** - You can revoke access anytime

## Dive Deeper

- [Smart Accounts](smart-accounts.md) - Learn about ERC-4337 and your wallet
- [Session Keys](session-keys.md) - Understand gasless transactions
- [Delegations](delegations.md) - How Pragma executes on your behalf
- [Fees](fees.md) - Transparent fee structure
