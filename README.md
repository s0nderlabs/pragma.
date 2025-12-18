# Pragma

> **Your AI-powered DeFi assistant on Monad.**

**Pragma** is a product of [s0nderlabs](https://s0nderlabs.xyz). Try it live at [pr4gma.xyz](https://pr4gma.xyz).

Pragma lets you interact with DeFi using natural language. Swap tokens, stake MON, trade NFTs, and manage your portfolio—all through conversation.

## What Can You Do?

| Feature | Example |
|---------|---------|
| **Swap Tokens** | "Swap 1 MON to USDC" |
| **Stake MON** | "Stake 5 MON" |
| **Trade NFTs** | "Buy the cheapest skrumpey" |
| **Transfer** | "Send 0.5 MON to 0x..." |
| **Check Balances** | "What's my balance?" |

## How It Works

1. **Connect** - Sign in with Google, Discord, or X via Web3Auth
2. **Chat** - Tell Pragma what you want to do in plain English
3. **Confirm** - Review the quote and approve
4. **Done** - Transaction executes automatically

```
You: "Swap 0.1 MON to USDC"

Pragma: Swap Quote Ready:
  From: 0.1 MON (0.099 after 1% fee)
  To: ~0.25 USDC
  Would you like to proceed?

You: "yes"

Pragma: Swap Complete! Received 0.248 USDC
```

## Key Features

- **No Seed Phrases** - Wallet created from your social login
- **Gasless Experience** - Session keys handle gas automatically
- **Safe by Design** - Smart accounts with delegation limits
- **Real-time Updates** - See transaction progress as it happens

## Documentation

Full documentation: [docs/](./docs/)

- [Getting Started](./docs/getting-started/README.md)
- [Features](./docs/features/README.md)
- [Core Concepts](./docs/concepts/README.md)
- [Step-by-Step Guides](./docs/guides/README.md)
- [Reference](./docs/reference/README.md)
- [Help & FAQ](./docs/help/README.md)

## Development

```bash
# Install dependencies
pnpm install

# Run web app
pnpm --filter web dev

# Build all packages
pnpm build
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, Tailwind CSS |
| Blockchain | viem, wagmi, MetaMask Delegation Toolkit |
| AI | LangChain, OpenAI gpt-5-mini |
| Infrastructure | Pimlico (bundler), Monorail (DEX), aPriori (staking) |

## Links

- **App**: [pr4gma.xyz](https://pr4gma.xyz)
- **Docs**: [docs/](./docs/)
- **Team**: [s0nderlabs](https://s0nderlabs.xyz)
