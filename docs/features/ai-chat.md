# AI Chat Interface

Pragma's conversational interface understands natural language and executes blockchain actions on your behalf.

## How It Works

The AI chat interface is powered by LangChain that:

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
Swap 50 MON to USDC
```

```
Show my NFTs
```

### Complex Requests
```
Swap half my MON to USDC and send 100 USDC to 0x...
```

```
Show me the cheapest NFT in skrumpeys and buy it
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
Swap 500 MON to USDC
> Quote ready: 500 MON → ~1250 USDC
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
[Swap] Quote received: 100 MON → 250 USDC
[Swap] Waiting for confirmation...
[Swap] Creating delegation...
[Swap] Submitting transaction...
[Swap] Waiting for receipt...
[Swap] Complete! Received 248 USDC
```

## What Pragma Can Do

### Actions
- Swap tokens
- Transfer tokens/NFTs
- Stake/unstake MON
- Buy and list NFTs
- Wrap/unwrap MON

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
Swap 50 MON to USDC

// Less good
Swap some tokens
```

### Use Exact Amounts
```
// Good
Send 100 USDC to 0x1234...

// Less good
Send about 100 USDC to someone
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

### Sliding Window Context
Pragma uses a sliding window for conversation history to maintain accuracy:
- Only the most recent exchange (your last message + agent response) is retained in full
- This prevents the agent from hallucinating based on stale data
- Conversations stay accurate even after many exchanges

### Session Limits
- Context is optimized for accuracy, not length
- Important context from recent exchanges is preserved
- Refresh the page to start a completely fresh session

### If the Agent Seems Off
If the agent doesn't call a tool when asked to perform something on-chain:
1. **Refresh the page** - This resets the context completely
2. **Or ask something simple first** - Like "What's my balance?" to re-ground the agent
3. **Then retry your original request**

This can happen when context becomes confused after many exchanges.

## Keyboard Shortcuts

### Navigation
| Shortcut | Action |
|----------|--------|
| `Alt + \` | Toggle sidebar |
| `Alt + ←` | Previous tab |
| `Alt + →` | Next tab |
| `Alt + A` | Activity tab |
| `Alt + B` | Balances tab |
| `Alt + ,` | Settings tab |

### Actions
| Shortcut | Action |
|----------|--------|
| `Alt + C` | Copy wallet address |
| `Alt + H` | Toggle balance visibility |
| `Alt + T` | Toggle theme (dark/light) |
| `Alt + M` | Toggle Quick Mode |

### Chat
| Shortcut | Action |
|----------|--------|
| `Alt + /` | Focus chat input |
| `Enter` | Send message |

### Help
| Shortcut | Action |
|----------|--------|
| `Alt + K` | Show keyboard shortcuts panel |
| `Esc` | Close shortcuts panel |

**Tip:** Move mouse to the left edge of the screen to reveal the sidebar.

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
