# What is Pragma?

Pragma is an **AI-powered intent engine** that lets you interact with the Monad blockchain using natural language. Instead of clicking through complex DeFi interfaces, you simply describe what you want to do.

## The Problem We Solve

Traditional DeFi is complicated:
- Multiple apps for different actions (DEX, staking, NFTs)
- Complex interfaces with confusing options
- Managing gas tokens and approvals
- Risk of clicking the wrong button

## How Pragma Works

### 1. You Express Your Intent
Tell Pragma what you want in plain English:
> "Swap 100 MON to USDC"

### 2. AI Understands and Plans
Our AI agent interprets your request and plans the necessary blockchain actions:
- Checks your MON balance
- Gets quotes from Monorail and 0x aggregators
- Picks the best rate automatically

### 3. Secure Execution
Your transaction executes through a secure delegation system:
- Your keys never leave your device
- Each action uses a time-limited permission (5 minutes)
- Full transparency on what's happening

### 4. Confirmation
You review and confirm (or use Quick Mode for instant execution).

## Key Components

### Smart Account
Your main wallet on Monad. It's a **smart contract** (not a regular wallet) that enables advanced features like delegated execution.

- Holds all your tokens and NFTs
- Controlled by your Web3Auth key
- Address format: `0x...`

### Session Key
A temporary key that executes transactions on your behalf:
- Funded with ~0.5 MON for gas
- Auto-refills when low
- Separate from your main account (security isolation)

### AI Agent
The brain of Pragma:
- Built with LangChain for reliable tool execution
- Understands DeFi concepts and protocols
- Plans multi-step transactions
- Provides real-time updates

## What Makes Pragma Different

| Traditional DeFi | Pragma |
|------------------|--------|
| Navigate multiple apps | One chat interface |
| Manual gas management | Automatic gas handling |
| Click-based interaction | Natural language |
| Approve every action | Session key delegation |
| Complex UX | Conversational UX |

## Security Model

Pragma is designed with security as a priority:

1. **Client-Side Only**: Your private keys never leave your browser
2. **Time-Limited Delegations**: Each permission expires in 5 minutes
3. **Minimal Permissions**: Only the exact operations you approve
4. **Parameter Enforcement**: Blockchain-level validation of transaction details
5. **Session Isolation**: Session key balance (~0.5 MON) is the maximum exposure

## Supported Actions

| Category | Actions |
|----------|---------|
| **Trading** | Swap tokens via Monorail + 0x aggregators (best rate selected) |
| **Staking** | Stake MON to earn rewards via aPriori |
| **NFTs** | Browse, buy, and transfer NFTs via OpenSea |
| **Transfers** | Send any token to any address |
| **Wrapping** | Convert MON to WMON and back |

## Next Steps

Ready to try it? Head to [Quick Start](quick-start.md) for a step-by-step guide.
