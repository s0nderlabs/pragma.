# Frequently Asked Questions

Common questions about using Pragma.

## General

### What is Pragma?
Pragma is a conversational DeFi assistant for Monad. You interact using natural language to swap tokens, stake, trade NFTs, and more.

### Is Pragma free to use?
Pragma charges a 1% protocol fee on:
- Token swaps
- Staking
- NFT purchases

These fees fund development. Transfers and wrapping are free.

### Is Pragma safe?
Yes. Pragma is non-custodial:
- You own your wallet
- Only you can access your funds
- Smart contracts enforce all permissions

See [Security](../reference/security.md) for details.

### What blockchain does Pragma use?
Pragma operates on Monad, a high-performance EVM-compatible blockchain.

---

## Account & Wallet

### How do I create an account?
Click "Connect" and sign in with Google, Discord, X, or other social options. Web3Auth creates a wallet for you automatically.

### Do I need a seed phrase?
No. Your wallet is tied to your social login. No seed phrase to lose.

### Can I recover my wallet?
Yes. Sign in with the same social account to access your wallet.

### What is my smart account?
Your smart account is a wallet implemented as a smart contract. It enables delegations, gasless transactions, and session keys.

### Can I import an existing wallet?
Pragma creates new wallets via Web3Auth. Existing MetaMask or hardware wallets are not directly supported.

---

## Session Keys

### What is a session key?
A temporary key that executes transactions on your behalf. It holds a small MON balance for gas fees.

### Why does my session key need MON?
To pay for gas (transaction fees). Auto-funds when balance is low.

### How much MON does the session key need?
~0.5 MON is typical. It auto-refills when below 0.1 MON.

### What if my session key is compromised?
Maximum loss is the session key balance (~0.5 MON). Revoke immediately:
```
Revoke my session key
```

### How long do session keys last?
Until you disconnect or revoke them. They don't expire automatically.

---

## Swapping

### What tokens can I swap?
Use `What tokens can I swap?` to see the current list. Major tokens include MON, WMON, USDC, USDT, DAI, and various Monad ecosystem tokens.

### What's the swap fee?
1% of input amount, deducted before the swap.

### Why did my swap fail?
Common reasons:
- Insufficient balance
- Quote expired (5 minute limit)
- Price moved beyond slippage tolerance
- Network congestion

### What is slippage?
Maximum acceptable price difference from quote. Default is 5%.

### Can I change slippage?
Ask: `Set slippage to 3%`

---

## Staking

### What is liquid staking?
Staking that gives you a tradeable token (aprMON) representing your stake. You earn rewards while maintaining liquidity.

### What's the staking APR?
Variable based on staking rewards and MEV. Ask: `What's the aPriori APR?`

### Why does unstaking take 12-18 hours?
aPriori uses epoch-based withdrawals. You must wait for the current epoch to end.

### What's a Request ID?
Unique identifier for your unstake request. You need it to claim after the epoch.

### Can I stake other tokens?
Currently only MON can be staked via aPriori.

---

## NFTs

### What NFTs can I buy?
NFTs listed on OpenSea for Monad. Browse collections:
```
What are the top NFT collections?
```

### What's a floor price?
The lowest listed price for any NFT in a collection.

### What's the NFT fee?
1% of purchase price.

### Can I sell NFTs through Pragma?
NFT selling is planned but not yet available.

---

## Transfers

### Are transfers free?
Yes. No protocol fee on transfers. You only pay network gas.

### Can I transfer any token?
Yes, any token in your balance can be transferred.

### What about NFT transfers?
You can transfer NFTs you own:
```
Transfer my monad-punk #123 to 0x...
```

---

## Fees

### What are the fees?
| Action | Fee |
|--------|-----|
| Swap | 1% |
| Stake | 1% |
| NFT Buy | 1% |
| Transfer | Free |
| Wrap/Unwrap | Free |
| Unstake | Free (+ 0.1% aPriori) |

### Who pays gas?
Your session key pays gas from its MON balance.

### Where do fees go?
Protocol fees fund Pragma development and treasury.

---

## Technical

### What is a delegation?
A permission allowing your session key to act on your behalf, with specific restrictions (caveats).

### What are caveats?
Rules that limit what a delegation can do (which contracts, functions, amounts).

### What's ERC-4337?
Account abstraction standard. Enables smart contract wallets with advanced features.

### What's the difference between MON and WMON?
MON is native (like ETH). WMON is the ERC-20 wrapped version. Some DeFi requires WMON.

---

## Troubleshooting

### My balance shows 0
- Check you're connected
- Try: `What's my balance?`
- Refresh the page

### Transaction stuck
- Check session key balance
- Network may be congested
- Try again after a moment

### Quote expired
- Request a new quote
- Confirm within 5 minutes next time

See [Troubleshooting](troubleshooting.md) for more solutions.
