# Pragma H2 Agent Validation Test Suite

**Purpose:** Validate agent behavior after Three-Tier Tool Documentation refactor.

**Date Created:** 2024-12-15

**How to Run:**

```bash
# Quick mode (executes immediately, faster testing)
OPENAI_API_KEY_H2="your-key" pnpm pragma dev h2 --quick

# Normal mode (waits for confirmation, tests full flow)
OPENAI_API_KEY_H2="your-key" pnpm pragma dev h2
```

**Legend:**

- [ ] = Not tested
- [x] = Passed
- [!] = Failed (add notes)
- Mode: **Q** = Quick mode, **N** = Normal mode, **B** = Both

---

## Section A: Swap Operations

### A1. getSwapQuote Tests

| Pass | #     | Mode | Prompt                                                      | Expected Behavior                                       |
| ---- | ----- | ---- | ----------------------------------------------------------- | ------------------------------------------------------- |
| [x]  | A1.1  | B    | `swap 10 MON to USDC`                                       | Mentions "1% fee", shows ~9.9 MON being swapped         |
| [x ] | A1.2  | B    | `swap all my MON to USDC`                                   | Calls `getBalance` FIRST, then uses exact number        |
| [x ] | A1.3  | B    | `swap half my USDC to MON`                                  | Calls `getBalance`, calculates half, shows exact amount |
| [ ]  | A1.4  | B    | `swap max MON to DAK`                                       | Gets balance, uses full amount minus gas                |
| [ ]  | A1.5  | B    | `swap 25% of my MON to WMON`                                | Calls `getBalance`, calculates 25%, uses exact          |
| [ ]  | A1.6  | B    | `exchange 5 USDC for MON`                                   | Understands "exchange" as swap                          |
| [ ]  | A1.7  | B    | `swap 10 MON to USDC with 1% slippage`                      | Sets slippageBps to 100                                 |
| [ ]  | A1.8  | B    | `swap 10 MON to USDC with 0.5% slippage`                    | Sets slippageBps to 50                                  |
| [ ]  | A1.9  | B    | `swap 10 MON to USDC with 20% slippage`                     | Mentions max 15% cap applied                            |
| [ ]  | A1.10 | B    | `swap 10 MON to 0xfe140e1dCe99Be9F4F15d657CD9b7BF622270C50` | Resolves token by address                               |

### A2. executeSwap Tests

| Pass | #    | Mode | Prompt                      | Expected Behavior                            |
| ---- | ---- | ---- | --------------------------- | -------------------------------------------- |
| [ ]  | A2.1 | N    | After quote: `yes`          | Executes with quoteId from previous response |
| [ ]  | A2.2 | N    | After quote: `do it`        | Understands confirmation synonym             |
| [ ]  | A2.3 | N    | After quote: `execute`      | Understands confirmation                     |
| [ ]  | A2.4 | B    | `execute swap quote abc123` | Fails gracefully: "quote not found"          |
| [ ]  | A2.5 | N    | After 6+ min wait: `yes`    | Mentions quote expired, offers new quote     |

**Notes:**

```
A1.1:
A1.2:
A2.1:
```

---

## Section B: Direct Execution Tools

### B1. Stake Tests

| Pass | #    | Mode | Prompt                  | Expected Behavior                      |
| ---- | ---- | ---- | ----------------------- | -------------------------------------- |
| [ ]  | B1.1 | B    | `stake 10 MON`          | Mentions 1% fee, shows ~9.9 MON staked |
| [ ]  | B1.2 | B    | `stake all my MON`      | Calls `getBalance` FIRST               |
| [ ]  | B1.3 | B    | `stake half my MON`     | Calls `getBalance`, calculates half    |
| [ ]  | B1.4 | B    | `stake MON into aprMON` | Understands context = stake            |
| [ ]  | B1.5 | B    | `liquid stake 5 MON`    | Understands "liquid stake" = stake     |

### B2. Transfer Tests

| Pass | #    | Mode | Prompt                                                               | Expected Behavior                  |
| ---- | ---- | ---- | -------------------------------------------------------------------- | ---------------------------------- |
| [ ]  | B2.1 | B    | `send 10 USDC to 0x1234567890123456789012345678901234567890`         | Does NOT mention protocol fee      |
| [ ]  | B2.2 | B    | `send all my MON to 0x1234567890123456789012345678901234567890`      | Calls `getBalance` first           |
| [ ]  | B2.3 | B    | `transfer half my DAK to 0x1234567890123456789012345678901234567890` | Calculates half                    |
| [ ]  | B2.4 | B    | `send 5 MON to alice.nad`                                            | Resolves NAD name, shows address   |
| [ ]  | B2.5 | B    | `send 5 MON to vitalik.eth`                                          | Resolves ENS name, shows address   |
| [ ]  | B2.6 | B    | `send 10 USDC to alice.nad`                                          | Resolves name + transfers token    |
| [ ]  | B2.7 | B    | `transfer 1 MON to myself`                                           | Error: cannot transfer to yourself |

### B3. Wrap Tests

| Pass | #    | Mode | Prompt                | Expected Behavior             |
| ---- | ---- | ---- | --------------------- | ----------------------------- |
| [ ]  | B3.1 | B    | `wrap 5 MON`          | Does NOT mention protocol fee |
| [ ]  | B3.2 | B    | `wrap all my MON`     | Calls `getBalance` first      |
| [ ]  | B3.3 | B    | `convert MON to WMON` | Understands "convert" = wrap  |
| [ ]  | B3.4 | B    | `wrap half my MON`    | Calculates half               |

### B4. Unwrap Tests

| Pass | #    | Mode | Prompt                | Expected Behavior              |
| ---- | ---- | ---- | --------------------- | ------------------------------ |
| [ ]  | B4.1 | B    | `unwrap 5 WMON`       | Does NOT mention protocol fee  |
| [ ]  | B4.2 | B    | `unwrap all my WMON`  | Calls `getBalance` first       |
| [ ]  | B4.3 | B    | `convert WMON to MON` | Understands "convert" = unwrap |
| [ ]  | B4.4 | B    | `unwrap max WMON`     | Uses full WMON balance         |

**Notes:**

```
B1.1:
B2.1:
B3.1:
B4.1:
```

---

## Section C: Staking Tools

### C1. unstakeRequest Tests

| Pass | #    | Mode | Prompt                   | Expected Behavior                  |
| ---- | ---- | ---- | ------------------------ | ---------------------------------- |
| [ ]  | C1.1 | B    | `unstake 5 aprMON`       | Returns requestId, mentions timing |
| [ ]  | C1.2 | B    | `unstake all my aprMON`  | Calls `getBalance` first           |
| [ ]  | C1.3 | B    | `withdraw my staked MON` | Understands = unstake              |
| [ ]  | C1.4 | B    | `exit aPriori position`  | Understands = unstake              |

### C2. checkUnstakeStatus Tests

| Pass | #    | Mode | Prompt                      | Expected Behavior           |
| ---- | ---- | ---- | --------------------------- | --------------------------- |
| [ ]  | C2.1 | B    | `check my unstake status`   | Lists requests with status  |
| [ ]  | C2.2 | B    | `is my MON ready to claim?` | Shows claimable status      |
| [ ]  | C2.3 | B    | `unstake progress`          | Lists all pending/claimable |

### C3. unstakeClaim Tests

| Pass | #    | Mode | Prompt                               | Expected Behavior           |
| ---- | ---- | ---- | ------------------------------------ | --------------------------- |
| [ ]  | C3.1 | B    | `claim my unstaked MON`              | Uses requestId, returns MON |
| [ ]  | C3.2 | N    | After checkUnstakeStatus: `claim it` | Uses requestId from status  |

**Notes:**

```
C1.1:
C2.1:
C3.1:
```

---

## Section D: Balance Tools

### D1. getBalance Tests

| Pass | #    | Mode | Prompt                                                  | Expected Behavior              |
| ---- | ---- | ---- | ------------------------------------------------------- | ------------------------------ |
| [ ]  | D1.1 | B    | `what's my MON balance?`                                | Returns balance with USD value |
| [ ]  | D1.2 | B    | `how much USDC do I have?`                              | Returns balance with USD value |
| [ ]  | D1.3 | B    | `check my aprMON`                                       | Returns staked position        |
| [ ]  | D1.4 | B    | `balance of 0xfe140e1dCe99Be9F4F15d657CD9b7BF622270C50` | Resolves address               |

### D2. getAllBalances Tests

| Pass | #    | Mode | Prompt                   | Expected Behavior           |
| ---- | ---- | ---- | ------------------------ | --------------------------- |
| [ ]  | D2.1 | B    | `show my portfolio`      | Lists all tokens with USD   |
| [ ]  | D2.2 | B    | `what tokens do I have?` | Lists all non-zero balances |
| [ ]  | D2.3 | B    | `show all my balances`   | Complete portfolio view     |
| [ ]  | D2.4 | B    | `what's my net worth?`   | Shows total USD value       |

**Notes:**

```
D1.1:
D2.1:
```

---

## Section E: Account Tools

### E1. getAccountInfo Tests

| Pass | #    | Mode | Prompt                             | Expected Behavior                       |
| ---- | ---- | ---- | ---------------------------------- | --------------------------------------- |
| [ ]  | E1.1 | B    | `what account am I using?`         | Shows smart account, owner, session key |
| [ ]  | E1.2 | B    | `show my address`                  | Returns smart account address           |
| [ ]  | E1.3 | B    | `whoami`                           | Returns account details                 |
| [ ]  | E1.4 | B    | `what wallet am I connected with?` | Returns account info                    |

### E2. getSessionKeyBalance Tests

| Pass | #    | Mode | Prompt                           | Expected Behavior       |
| ---- | ---- | ---- | -------------------------------- | ----------------------- |
| [ ]  | E2.1 | B    | `what's my session key balance?` | Shows ~1 MON for gas    |
| [ ]  | E2.2 | B    | `how much gas do I have?`        | Shows session key MON   |
| [ ]  | E2.3 | B    | `session key status`             | Shows balance + address |

### E3. getSessionKeyPrivateKey Tests

| Pass | #    | Mode | Prompt                            | Expected Behavior             |
| ---- | ---- | ---- | --------------------------------- | ----------------------------- |
| [ ]  | E3.1 | B    | `show my session key private key` | Shows key + security warning  |
| [ ]  | E3.2 | B    | `export session key`              | Shows key + explains gas-only |

### E4. listVerifiedTokens Tests

| Pass | #    | Mode | Prompt                       | Expected Behavior               |
| ---- | ---- | ---- | ---------------------------- | ------------------------------- |
| [ ]  | E4.1 | B    | `what tokens can I swap?`    | Shows verified token list       |
| [ ]  | E4.2 | B    | `show supported tokens`      | Shows symbols, names, addresses |
| [ ]  | E4.3 | B    | `what tokens are available?` | Complete verified list          |

**Notes:**

```
E1.1:
E2.1:
E3.1:
E4.1:
```

---

## Section F: Token Info Tools

### F1. getTokenInfo Tests

| Pass | #    | Mode | Prompt                                                      | Expected Behavior              |
| ---- | ---- | ---- | ----------------------------------------------------------- | ------------------------------ |
| [ ]  | F1.1 | B    | `what is the address of USDC?`                              | Returns FULL contract address  |
| [ ]  | F1.2 | B    | `is DAK verified?`                                          | Shows verification badge       |
| [ ]  | F1.3 | B    | `what token is 0xfe140e1dCe99Be9F4F15d657CD9b7BF622270C50?` | Returns token info             |
| [ ]  | F1.4 | B    | `tell me about YAKI`                                        | Symbol, name, decimals, status |

### F2. resolveName Tests

| Pass | #    | Mode | Prompt                                                 | Expected Behavior                 |
| ---- | ---- | ---- | ------------------------------------------------------ | --------------------------------- |
| [ ]  | F2.1 | B    | `what is the address of alice.nad?`                    | Returns 0x address                |
| [ ]  | F2.2 | B    | `what is the address of vitalik.eth?`                  | Returns 0x address                |
| [ ]  | F2.3 | B    | `who owns 0x1234567890123456789012345678901234567890?` | Returns registered name or "none" |
| [ ]  | F2.4 | B    | `look up bob.nad`                                      | Returns address                   |

**Notes:**

```
F1.1:
F2.1:
```

---

## Section G: Session Key Management

### G1. checkSessionKeyBalance Tests

| Pass | #    | Mode | Prompt                               | Expected Behavior            |
| ---- | ---- | ---- | ------------------------------------ | ---------------------------- |
| [ ]  | G1.1 | B    | `do I have enough gas for 3 swaps?`  | Uses estimatedOperations: 3  |
| [ ]  | G1.2 | B    | `check if session key needs funding` | Returns needsFunding boolean |

### G2. fundSessionKey Tests

| Pass | #    | Mode | Prompt                                 | Expected Behavior                |
| ---- | ---- | ---- | -------------------------------------- | -------------------------------- |
| [ ]  | G2.1 | B    | `fund my session key for 5 operations` | Uses estimatedOperations: 5      |
| [ ]  | G2.2 | B    | `add gas to session key`               | Transfers MON from smart account |

### G3. withdrawSessionKeyBalance Tests

| Pass | #    | Mode | Prompt                                                                   | Expected Behavior    |
| ---- | ---- | ---- | ------------------------------------------------------------------------ | -------------------- |
| [ ]  | G3.1 | B    | `withdraw all session key balance`                                       | Uses amount: "all"   |
| [ ]  | G3.2 | B    | `withdraw 0.5 MON from session key`                                      | Uses amount: "0.5"   |
| [ ]  | G3.3 | B    | `send session key balance to 0x1234567890123456789012345678901234567890` | Uses recipient param |

**Notes:**

```
G1.1:
G2.1:
G3.1:
```

---

## Section H: NFT Tools

### H1. getMyNFTs Tests

| Pass | #    | Mode | Prompt                  | Expected Behavior             |
| ---- | ---- | ---- | ----------------------- | ----------------------------- |
| [ ]  | H1.1 | B    | `show my NFTs`          | Gallery grouped by collection |
| [ ]  | H1.2 | B    | `what NFTs do I have?`  | Lists all owned NFTs          |
| [ ]  | H1.3 | B    | `show my molandak NFTs` | Only molandak collection      |

### H2. browseCollection Tests

| Pass | #    | Mode | Prompt                        | Expected Behavior          |
| ---- | ---- | ---- | ----------------------------- | -------------------------- |
| [ ]  | H2.1 | B    | `browse molandak`             | Gallery sorted by price    |
| [ ]  | H2.2 | B    | `show molandak NFTs for sale` | Prices and tokenIds shown  |
| [ ]  | H2.3 | B    | `molandak under 5 MON`        | Only shows <5 MON listings |

### H3. getCollectionInfo Tests

| Pass | #    | Mode | Prompt                             | Expected Behavior        |
| ---- | ---- | ---- | ---------------------------------- | ------------------------ |
| [ ]  | H3.1 | B    | `tell me about molandak`           | Floor, supply, listings  |
| [ ]  | H3.2 | B    | `what is the floor for skrumpeys?` | Shows current floor      |
| [ ]  | H3.3 | B    | `molandak collection info`         | Name, description, links |

### H4. getNFTDetails Tests

| Pass | #    | Mode | Prompt                                 | Expected Behavior    |
| ---- | ---- | ---- | -------------------------------------- | -------------------- |
| [ ]  | H4.1 | B    | `what are the traits of molandak #42?` | Traits, rarity rank  |
| [ ]  | H4.2 | B    | `tell me about NFT #100 from molandak` | Name, traits, rarity |

### H5. getNFTActivity Tests

| Pass | #    | Mode | Prompt                      | Expected Behavior       |
| ---- | ---- | ---- | --------------------------- | ----------------------- |
| [ ]  | H5.1 | B    | `recent sales for molandak` | Sales with prices       |
| [ ]  | H5.2 | B    | `my NFT activity`           | User's NFT transactions |
| [ ]  | H5.3 | B    | `history of molandak #42`   | Specific NFT history    |

### H6. getTopCollections Tests

| Pass | #    | Mode | Prompt                        | Expected Behavior    |
| ---- | ---- | ---- | ----------------------------- | -------------------- |
| [ ]  | H6.1 | B    | `top NFT collections`         | Floor prices, volume |
| [ ]  | H6.2 | B    | `popular NFTs on Monad`       | Sorted by volume     |
| [ ]  | H6.3 | B    | `find monad punks collection` | Fuzzy match result   |

### H7. getNFTBuyQuote Tests

| Pass | #    | Mode | Prompt                       | Expected Behavior             |
| ---- | ---- | ---- | ---------------------------- | ----------------------------- |
| [ ]  | H7.1 | B    | `buy molandak #42`           | Shows price + **1% fee**      |
| [ ]  | H7.2 | B    | `purchase cheapest molandak` | Gets floor listing, shows fee |
| [ ]  | H7.3 | B    | `how much is molandak #100?` | Price with USD equivalent     |

### H8. executeNFTBuy Tests

| Pass | #    | Mode | Prompt                    | Expected Behavior        |
| ---- | ---- | ---- | ------------------------- | ------------------------ |
| [ ]  | H8.1 | N    | After NFT quote: `yes`    | Uses quoteId from quote  |
| [ ]  | H8.2 | N    | After NFT quote: `buy it` | Understands confirmation |

### H9. transferNFT Tests

| Pass | #    | Mode | Prompt                                                               | Expected Behavior     |
| ---- | ---- | ---- | -------------------------------------------------------------------- | --------------------- |
| [ ]  | H9.1 | B    | `send my molandak #42 to 0x1234567890123456789012345678901234567890` | FREE, no protocol fee |
| [ ]  | H9.2 | B    | `send NFT #42 to alice.nad`                                          | Resolves name         |
| [ ]  | H9.3 | B    | `transfer my NFT to vitalik.eth`                                     | Resolves name         |

### H10. listNFT Tests

| Pass | #     | Mode | Prompt                            | Expected Behavior     |
| ---- | ----- | ---- | --------------------------------- | --------------------- |
| [ ]  | H10.1 | B    | `list my molandak #42 for 10 MON` | Returns OpenSea link  |
| [ ]  | H10.2 | B    | `sell my NFT #42 for 5 MON`       | Creates Seaport order |
| [ ]  | H10.3 | B    | `list NFT for 10 MON for 30 days` | Uses duration: 30     |

**Notes:**

```
H1.1:
H2.1:
H7.1:
H9.1:
```

---

## Section I: Knowledge Tools

### I1. searchProtocolDocs Tests

| Pass | #    | Mode | Prompt                        | Expected Behavior              |
| ---- | ---- | ---- | ----------------------------- | ------------------------------ |
| [ ]  | I1.1 | B    | `how does Pragma work?`       | Returns architecture info      |
| [ ]  | I1.2 | B    | `what is aPriori?`            | Returns protocol explanation   |
| [ ]  | I1.3 | B    | `explain delegations`         | Returns delegation system info |
| [ ]  | I1.4 | B    | `how are my funds protected?` | Returns security model         |

### I2. webSearch Tests

| Pass | #    | Mode | Prompt                              | Expected Behavior     |
| ---- | ---- | ---- | ----------------------------------- | --------------------- |
| [ ]  | I2.1 | B    | `what is the current price of MON?` | Returns current price |
| [ ]  | I2.2 | B    | `latest Monad news`                 | Returns recent news   |
| [ ]  | I2.3 | B    | `what is liquid staking?`           | Returns explanation   |
| [ ]  | I2.4 | B    | `aPriori APY today`                 | Returns current APY   |

**Notes:**

```
I1.1:
I2.1:
```

---

## Section J: Easter Egg

### J1. vibetrading Tests

| Pass | #    | Mode | Prompt                      | Expected Behavior                            |
| ---- | ---- | ---- | --------------------------- | -------------------------------------------- |
| [ ]  | J1.1 | B    | `/vibetrading`              | Calls claimVibetrading, celebratory response |
| [ ]  | J1.2 | B    | `what is vibetrading?`      | Does NOT call claimVibetrading               |
| [ ]  | J1.3 | B    | `tell me about vibetrading` | Uses docs, NOT claim tool                    |

**Notes:**

```
J1.1:
J1.2:
```

---

## Section K: Off-Topic Handling (CRITICAL)

**These should NOT call any tools - just redirect.**

| Pass | #   | Mode | Prompt                          | Expected Behavior                |
| ---- | --- | ---- | ------------------------------- | -------------------------------- |
| [ ]  | K1  | B    | `explain dota 2`                | NO tools called, polite redirect |
| [ ]  | K2  | B    | `what's the capital of France?` | NO tools called                  |
| [ ]  | K3  | B    | `help me write code`            | NO tools called                  |
| [ ]  | K4  | B    | `write an essay about cats`     | NO tools called                  |
| [ ]  | K5  | B    | `who won the world cup?`        | NO tools called                  |
| [ ]  | K6  | B    | `translate hello to Spanish`    | NO tools called                  |
| [ ]  | K7  | B    | `what is 2+2?`                  | NO tools called                  |
| [ ]  | K8  | B    | `tell me a joke`                | NO tools called                  |

**Notes:**

```
K1:
K2:
```

---

## Section L: Error Handling

| Pass | #   | Mode | Prompt                                | Expected Behavior                |
| ---- | --- | ---- | ------------------------------------- | -------------------------------- |
| [ ]  | L1  | B    | `swap 1000000 MON to USDC`            | Clear insufficient balance error |
| [ ]  | L2  | B    | `swap 10 MON to FAKETOKEN`            | Token not found error            |
| [ ]  | L3  | B    | `send 10 MON to invalid.address`      | Address validation error         |
| [ ]  | L4  | B    | `stake -5 MON`                        | Amount must be positive          |
| [ ]  | L5  | B    | `buy NFT from nonexistent-collection` | Collection not found             |
| [ ]  | L6  | B    | `transfer NFT I don't own`            | Ownership error                  |

**Notes:**

```
L1:
L2:
```

---

## Section M: Multi-Step Workflows

| Pass | #   | Mode | Prompt Sequence                                         | Expected Flow                                                     |
| ---- | --- | ---- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| [ ]  | M1  | Q    | `swap all my USDC to MON` then `stake all of it`        | getBalance → swap → getBalance → stake                            |
| [ ]  | M2  | N    | `browse molandak` then `buy the cheapest one`           | browseCollection → getNFTBuyQuote → user confirms → executeNFTBuy |
| [ ]  | M3  | B    | `unstake my aprMON` then (wait) then `claim it`         | unstakeRequest → checkUnstakeStatus → unstakeClaim                |
| [ ]  | M4  | B    | `check if I have enough gas for 5 swaps` then `fund it` | checkSessionKeyBalance → fundSessionKey                           |

**Notes:**

```
M1:
M2:
```

---

## Section N: Mode Behavior

| Pass | #   | Prompt                | Normal Mode                  | Quick Mode                        |
| ---- | --- | --------------------- | ---------------------------- | --------------------------------- |
| [ ]  | N1  | `swap 10 MON to USDC` | Shows quote, waits for "yes" | Shows quote, executes immediately |
| [ ]  | N2  | `stake 5 MON`         | Asks confirmation            | Executes immediately              |
| [ ]  | N3  | `wrap 2 MON`          | Asks confirmation            | Executes immediately              |
| [ ]  | N4  | `buy molandak #42`    | Shows quote, waits           | Shows quote, executes             |

**Notes:**

```
N1 Normal:
N1 Quick:
```

---

## Summary

| Section             | Tests   | Passed | Failed |
| ------------------- | ------- | ------ | ------ |
| A. Swap Operations  | 15      |        |        |
| B. Direct Execution | 18      |        |        |
| C. Staking          | 9       |        |        |
| D. Balance          | 8       |        |        |
| E. Account          | 13      |        |        |
| F. Token Info       | 8       |        |        |
| G. Session Key Mgmt | 6       |        |        |
| H. NFT Operations   | 26      |        |        |
| I. Knowledge        | 8       |        |        |
| J. Easter Egg       | 3       |        |        |
| K. Off-Topic        | 8       |        |        |
| L. Error Handling   | 6       |        |        |
| M. Multi-Step       | 4       |        |        |
| N. Mode Behavior    | 4       |        |        |
| **Total**           | **136** |        |        |

---

## Critical Tests (Run First)

These are the most important tests for validating the refactor:

| Pass | Test | What It Validates              |
| ---- | ---- | ------------------------------ |
| [ ]  | A1.1 | Swap fee disclosure (1%)       |
| [ ]  | A1.2 | getBalance called for "all"    |
| [ ]  | B1.1 | Stake fee disclosure (1%)      |
| [ ]  | B2.1 | Transfer is FREE               |
| [ ]  | B3.1 | Wrap is FREE                   |
| [ ]  | B4.1 | Unwrap is FREE                 |
| [ ]  | H7.1 | NFT buy fee disclosure (1%)    |
| [ ]  | H9.1 | NFT transfer is FREE           |
| [ ]  | K1   | Off-topic rejection (no tools) |
| [ ]  | K2   | Off-topic rejection (no tools) |

---

## Red Flags

If you see these behaviors, the refactor has a regression:

| Behavior                                  | Problem                      |
| ----------------------------------------- | ---------------------------- |
| "Swapping all MON" without showing amount | Not calling getBalance first |
| No fee mentioned on swap/stake/NFT buy    | Fee info missing from schema |
| Fee mentioned on wrap/unwrap/transfer     | Wrong fee info               |
| Calls webSearch for "explain dota"        | Off-topic boundary broken    |
| Constructs quoteId like "swap_123"        | Quote flow misunderstood     |
| Session key balance shows 50+ MON         | Confusing with smart account |

---

## Test Session Notes

**Date:** **\*\***\_\_\_**\*\***

**Tester:** **\*\***\_\_\_**\*\***

**Mode:** [ ] Quick [ ] Normal

**Overall Result:** [ ] PASS [ ] FAIL

**Critical Issues Found:**

```




```

**Minor Issues Found:**

```




```

**Recommendations:**

```




```
