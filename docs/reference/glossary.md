# Glossary

Key terms and definitions used in Pragma.

## A

### aprMON
Liquid staking token received when staking MON through aPriori. Represents staked MON plus accumulated rewards.

### aPriori
Liquid staking protocol on Monad. Allows staking MON while maintaining liquidity through aprMON tokens.

## B

### Bundler
Infrastructure that packages user operations into transactions. Pragma uses Pimlico as its bundler.

## C

### Caveat
A permission restriction on a delegation. Defines what actions a session key can perform (e.g., "can only call swap function").

### Confirmation
When a transaction is included in a block and considered final.

## D

### Delegation
A cryptographic permission allowing one key (session key) to act on behalf of another (your wallet) within defined limits.

### DEX
Decentralized Exchange. Peer-to-peer trading without intermediaries.

### DEX Aggregator
Service that searches multiple DEXs to find the best swap rate. Pragma uses both Monorail and 0x for optimal pricing.

## E

### EOA
Externally Owned Account. A traditional wallet controlled by a private key.

### Epoch
Time period in staking. aPriori uses epochs (~12-18 hours) for unstaking withdrawals.

### ERC-20
Standard interface for fungible tokens on EVM chains.

### ERC-4337
Account abstraction standard enabling smart contract wallets with advanced features.

## F

### Floor Price
Lowest listed price for an NFT in a collection.

## G

### Gas
Fee paid for blockchain computation. Measured in MON on Monad.

### Gasless
Transactions where the user doesn't directly pay gas. Pragma's session keys handle gas.

## H

### HybridDelegator
Pragma's smart account type built on the MetaMask Delegation Toolkit (DTK). Uses ERC-4337 (Account Abstraction) for smart contract wallets with delegation capabilities.

## L

### Liquid Staking
Staking that provides a tradeable token (aprMON) representing staked assets. Maintains liquidity while earning rewards.

## M

### MEV
Maximal Extractable Value. Extra profit from transaction ordering. aPriori redistributes MEV as staking rewards.

### MON
Native token of Monad blockchain. Used for gas and as the primary trading currency.

### Monad
High-performance EVM-compatible blockchain. Pragma operates on Monad.

### Monorail
Primary DEX aggregator on Monad used by Pragma for token swaps. Pragma queries both Monorail and 0x for best pricing.

## N

### NFT
Non-Fungible Token. Unique digital asset (art, collectibles, etc.).

## O

### OpenSea
NFT marketplace. Pragma integrates via the Seaport protocol.

## P

### 0x (Zero-Ex)
DEX aggregator protocol. Pragma uses 0x alongside Monorail for optimal swap pricing.

### Parallel Quoting
Pragma's approach of fetching swap quotes from multiple aggregators simultaneously and selecting the best price.

### Protocol Fee
Pragma's 1% fee on swaps, stakes, and NFT purchases. Funds development and treasury.

## Q

### Quick Mode
Pragma setting that skips confirmation prompts. Executes immediately after quote.

### Quote
Price estimate for a trade. Shows expected output, fees, and rate.

## R

### Request ID
Unique identifier for unstake requests. Needed to claim after epoch.

## S

### Seaport
OpenSea's smart contract protocol for NFT trading.

### Session Key
Temporary key that executes transactions on your behalf. Holds small MON balance for gas.

### Slippage
Maximum acceptable difference between quoted and executed price. Default 5%.

### Smart Account
Wallet implemented as a smart contract. Enables delegations, session keys, and advanced features.

### Staking
Locking tokens to earn rewards. Pragma supports liquid staking via aPriori.

## T

### Token
Digital asset on blockchain. Can be fungible (ERC-20) or non-fungible (NFT).

### Transaction
On-chain operation that changes state (transfer, swap, etc.).

### Treasury
Pragma's fund for protocol development, funded by protocol fees.

## U

### Unstake
Withdraw staked tokens. In aPriori: Request → Wait epoch → Claim.

### UserOp
User Operation. ERC-4337 transaction format for smart accounts.

## W

### Web3Auth
Authentication service for Pragma. Creates wallets from social logins (Google, Discord, etc.).

### WMON
Wrapped MON. ERC-20 version of native MON token.

### Wrapping
Converting native MON to WMON (or vice versa). Required for some DeFi operations.
