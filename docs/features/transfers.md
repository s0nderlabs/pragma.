# Transferring Tokens

Send any token to any address. Free, fast, and simple.

## Basic Transfers

### Send to an Address
```
Send 10 USDC to 0x1234567890abcdef1234567890abcdef12345678
```

### Send to a NAD Name
```
Send 5 MON to alice.nad
```

### Send to an ENS Name
```
Transfer 100 DAK to vitalik.eth
```

## Amount Options

### Specific Amount
```
Send 25.5 USDC to alice.nad
```

### All of a Token
```
Send all my DAK to 0x1234...
```

### Half
```
Send half my MON to alice.nad
```

## Supported Tokens

All verified tokens on Monad can be transferred:
- **Native**: MON
- **Wrapped**: WMON
- **Stablecoins**: USDC, USDT
- **LST**: aprMON
- **Ecosystem**: All verified tokens

Check available tokens:
```
What tokens can I transfer?
```

## Name Resolution

Pragma supports multiple name services:

### NAD Names (.nad)
Monad's native name service:
```
Send 10 MON to alice.nad
```

### ENS Names (.eth)
Ethereum Name Service (cross-chain resolution):
```
Send 5 USDC to vitalik.eth
```

### Look Up Names
```
What address is alice.nad?
```

```
Who owns 0x1234...?
```

## Fee Structure

**Transfers are FREE.** No protocol fee.

| Component | Cost |
|-----------|------|
| Protocol Fee | Free |
| Gas | ~0.01-0.02 MON (paid by session key) |

## The Transfer Process

### Step 1: Request Transfer
```
Send 10 USDC to alice.nad
```

### Step 2: Review
Pragma shows:
```
Transfer ready:

- Token: USDC
- Amount: 10.0 USDC
- To: alice.nad (0x1234...5678)
- Gas: ~0.01 MON

Would you like to proceed?
```

### Step 3: Confirm
Type **"yes"** to execute.

### Step 4: Confirmation
```
Transfer complete!

- Sent: 10.0 USDC
- To: alice.nad (0x1234...5678)
- Tx: 0xabcd...
- Block: 12345

The tokens have been sent.
```

## Native MON vs WMON

### MON (Native)
```
Send 5 MON to alice.nad
```
- Sends native MON directly
- Slightly lower gas

### WMON (Wrapped)
```
Send 5 WMON to alice.nad
```
- Sends ERC20 WMON
- Required for some DeFi protocols

### Need to Convert?
```
Wrap 5 MON
```
See [Wrapping MON](wrapping.md) for details.

## Quick Mode

With Quick Mode enabled:
- Transfers execute immediately without confirmation
- Same security protections apply

Enable:
```
Enable quick mode
```

## Batch Considerations

For multiple transfers, execute them one at a time:
```
Send 10 USDC to alice.nad
```
Then:
```
Send 5 MON to bob.nad
```

## Security Features

Even though transfers are free, Pragma enforces security:

1. **Recipient Validation**: Address is validated before execution
2. **Amount Enforcement**: Exact amount is enforced on-chain
3. **Time Limit**: Delegation expires in 5 minutes
4. **Single Use**: Each transfer uses a fresh delegation

## Common Issues

### "Insufficient Balance"
You don't have enough of the token:
```
What's my USDC balance?
```

### "Invalid Address"
The address format is wrong. Check:
- Starts with `0x`
- 40 hex characters after `0x`
- Or valid `.nad`/`.eth` name

### "Name Not Found"
The NAD/ENS name doesn't resolve:
```
What address is alice.nad?
```

### "Token Not Found"
The token may not be in your wallet or verified:
```
Show all my tokens
```

### "Session Key Low Balance"
Your session key needs MON for gas:
```
Fund my session key
```

## Best Practices

1. **Double-check addresses**: Transfers are irreversible
2. **Test with small amounts**: Especially to new addresses
3. **Use name services**: Easier to verify than raw addresses
4. **Verify the name**: Confirm the resolved address
5. **Check your balance first**: Ensure you have enough
