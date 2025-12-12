# Reference

Technical reference documentation for Pragma.

## Quick Links

| Reference | Description |
|-----------|-------------|
| [Supported Tokens](supported-tokens.md) | Full list of tradeable tokens |
| [Supported Protocols](supported-protocols.md) | Integrated DeFi protocols |
| [Glossary](glossary.md) | Key terms and definitions |
| [Security](security.md) | Security model and best practices |

## Token Addresses

All tokens are on Monad Testnet. For current addresses, ask:
```
What tokens can I swap?
```

## Protocol Contracts

Pragma integrates with audited protocols. Contract addresses are managed internally.

## Gas Costs Reference

| Operation | Typical Cost |
|-----------|-------------|
| Swap | ~0.14 MON |
| Stake | ~0.07 MON |
| Unstake Request | ~0.075 MON |
| Unstake Claim | ~0.07 MON |
| Transfer | ~0.04 MON |
| Wrap/Unwrap | ~0.04 MON |
| NFT Buy | ~0.12 MON |
| NFT List | ~0.08 MON |
| NFT Transfer | ~0.05 MON |

## Fee Summary

| Action | Fee | Who Pays |
|--------|-----|----------|
| Swap | 1% | User (deducted from input) |
| Stake | 1% | User (deducted from input) |
| NFT Buy | 1% | User (deducted from purchase) |
| Transfer | Free | - |
| Wrap/Unwrap | Free | - |
| Unstake | Free | - |
| Gas | Network rate | Session key |

## API Endpoints

Pragma uses internal API routes. Users interact through natural language only.

## Rate Limits

- No rate limits on user queries
- Quote validity: 5 minutes
- Session duration: Until disconnected

## Network Information

- **Chain**: Monad Testnet
- **Currency**: MON
- **Block Time**: ~1 second
- **Explorer**: Check transactions via provided links
