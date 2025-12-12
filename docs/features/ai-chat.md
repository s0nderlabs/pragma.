# AI Chat Interface

Pragma's conversational interface understands natural language and executes blockchain actions on your behalf.

## How It Works

The AI chat interface is powered by advanced language models that:

1. **Understand your intent** - Parse natural language into blockchain actions
2. **Plan execution** - Determine which tools to use and in what order
3. **Fetch data** - Get quotes, balances, and market information
4. **Execute transactions** - Create and submit secure delegations
5. **Report results** - Show you what happened with transaction details

## Conversation Examples

### Simple Commands
```
What's my balance?
```

```
Swap 1 MON to USDC
```

```
Show my NFTs
```

### Complex Requests
```
Swap half my MON to USDC and send 10 USDC to alice.nad
```

```
Show me the cheapest NFT in monad-punks and buy it
```

```
Check if my unstake is ready and claim it
```

### Questions
```
How does staking work?
```

```
What's the current price of MON?
```

```
Is YAKI token verified?
```

## Multi-Step Operations

Pragma can handle complex, multi-step requests:

### Swap and Stake
```
Swap 100 USDC to MON and stake it
```

Executes:
1. Get swap quote (USDC → MON)
2. Execute swap
3. Stake the received MON

### Check and Claim
```
Check my unstake status and claim if ready
```

Executes:
1. Check unstake requests
2. If claimable, execute claim

## Execution Modes

### Normal Mode (Default)
- Shows quote/preview before execution
- Waits for your confirmation
- Safer for large transactions

```
Swap 100 MON to USDC
> Quote ready: 100 MON → ~250 USDC
> Would you like to proceed?
yes
> Swap complete!
```

### Quick Mode
- Executes immediately without confirmation
- Faster for experienced users
- Use with caution

Enable:
```
Enable quick mode
```

Disable:
```
Disable quick mode
```

Or toggle with the lightning bolt icon in the chat input.

## Real-Time Updates

During execution, Pragma shows live progress:

```
[Swap] Getting quote...
[Swap] Quote received: 1 MON → 2.50 USDC
[Swap] Waiting for confirmation...
[Swap] Creating delegation...
[Swap] Submitting transaction...
[Swap] Waiting for receipt...
[Swap] Complete! Received 2.48 USDC
```

## What Pragma Can Do

### Actions
- Swap tokens
- Transfer tokens/NFTs
- Stake/unstake MON
- Buy/sell/list NFTs
- Wrap/unwrap MON
- Fund/withdraw session key

### Information
- Check balances
- Get token info
- Browse NFT collections
- Check unstake status
- Look up addresses/names
- Search the web for prices

### Help
- Explain concepts
- Answer questions about Monad
- Provide usage guidance

## What Pragma Cannot Do

- Access external wallets
- Execute on other chains
- Store your private keys
- Remember across sessions (yet)
- Make investment decisions for you

## Tips for Better Results

### Be Specific
```
// Good
Swap 1 MON to USDC

// Less good
Swap some tokens
```

### Use Exact Amounts
```
// Good
Send 10.5 USDC to alice.nad

// Less good
Send about 10 USDC to alice
```

### Use Token Symbols
```
// Good
What's my USDC balance?

// Less good
What's my USD Coin balance?
```

### Confirm Understanding
```
// If unsure
What tokens can I swap?
How much MON do I have?
```

## Session Behavior

### Message History
- Pragma remembers your conversation within a session
- Context helps with follow-up questions
- "Do that again" or "same but with 5 MON" works

### Session Limits
- Very long conversations may be summarized
- Important context is preserved
- Start fresh if something seems off

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + /` | Focus chat input |
| `Alt + M` | Toggle Quick Mode |
| `Alt + K` | Show all shortcuts |
| `Enter` | Send message |
| `Shift + Enter` | New line |

## Error Messages

### Common Errors

**"I don't understand"**
- Rephrase your request
- Be more specific
- Use simpler language

**"Session not found"**
- Reconnect your wallet
- Refresh the page

**"Tool failed"**
- Check error details
- Try the request again
- Ensure you have sufficient balance

## Best Practices

1. **Start simple**: Begin with basic commands
2. **Read the quotes**: Review before confirming
3. **Use Quick Mode carefully**: Only for routine operations
4. **Check balances first**: Avoid failed transactions
5. **Ask questions**: Pragma can explain things
6. **Report issues**: Help us improve!
