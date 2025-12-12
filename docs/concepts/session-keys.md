# Session Keys

Session keys provide a gasless experience by handling transaction costs automatically.

## What is a Session Key?

A session key is a **temporary, ephemeral key** that:

- Pays for transaction gas
- Executes delegated transactions
- Is separate from your main account
- Can be revoked anytime

## Why Session Keys?

### Traditional Wallet Experience
1. User initiates transaction
2. User pays gas in native token
3. User signs transaction
4. Transaction submitted

### Pragma Session Key Experience
1. User initiates transaction
2. Session key pays gas automatically
3. User signs delegation (one-time)
4. Session key submits transaction

**Result**: Feels gasless to the user!

## How It Works

```
Your Smart Account                     Session Key
├── Holds: 100 MON, 50 USDC           ├── Holds: ~0.5 MON (for gas)
├── Owner: Your Web3Auth key          ├── Private key: In-browser only
└── Grants delegation to ─────────────→  └── Executes transactions
```

## Funding

### Automatic Funding
Session keys are automatically funded:

| Trigger | Amount |
|---------|--------|
| Initial setup | ~0.5 MON |
| Balance below 0.1 MON | Refill to ~0.5 MON |
| Large operation | Additional based on estimate |

### Manual Funding
```
Fund my session key
```

### Manual Withdrawal
```
Withdraw all session key balance
```

## Gas Costs

Different operations use different amounts of gas:

| Operation | Estimated Gas Cost |
|-----------|-------------------|
| Swap | ~0.14 MON |
| Stake | ~0.07 MON |
| Unstake | ~0.075 MON |
| Transfer | ~0.04 MON |
| Wrap/Unwrap | ~0.04 MON |
| NFT Buy | ~0.12 MON |

## Checking Balance

### Via Chat
```
What's my session key balance?
```

### Response Example
```
Session Key Balance: 0.45 MON

Address: 0xabcd...1234
Status: Active

This balance is used for gas.
Auto-refills when below 0.1 MON.
```

### Low Balance Warning
```
⚠️ Session Key Balance: 0.05 MON (LOW)

Will auto-fund on next operation.
Or manually: "fund my session key"
```

## Funding Methods

Pragma uses two funding methods depending on the situation:

### UserOp Funding (Initial)
- Used when session key has < 0.02 MON
- Submitted via bundler
- No gas needed from session key

### Delegation Funding (Refill)
- Used when session key has >= 0.02 MON
- Session key pays for its own refill
- More gas efficient for refills

## Security

### Isolation
Session keys are isolated from your main account:
- Can only execute delegated actions
- Cannot access undelegated funds
- Cannot change account settings

### Revocation
Session keys can be revoked anytime:
```
Revoke my session key
```

### Regeneration
After revocation, a new session key is created on next connection.

### What If Compromised?
If your session key is compromised:
1. It can only use its own balance (~0.5 MON max)
2. It can only execute valid delegations
3. Delegations expire in 5 minutes
4. Revoke to immediately disable

## Technical Details

### Key Generation
```javascript
const sessionKey = generatePrivateKey();
const sessionAddress = privateKeyToAddress(sessionKey);
```

### Storage
- Private key stored in browser localStorage
- Encrypted with Web3Auth session
- Cleared on logout

### Address
- Standard Ethereum address (EOA)
- Separate from smart account
- Visible in settings

## Best Practices

1. **Let it auto-fund**: The system handles funding automatically
2. **Don't over-fund**: ~0.5 MON is enough for many operations
3. **Monitor if curious**: Check balance occasionally
4. **Withdraw if leaving**: Reclaim unused MON before disconnecting
5. **Revoke if concerned**: When in doubt, revoke and reconnect

## Common Questions

### "Why does my session key need MON?"
Gas on Monad is paid in MON. The session key needs MON to submit transactions.

### "What if my session key runs out?"
It auto-refills from your smart account when below 0.1 MON.

### "Can I use my smart account MON for gas directly?"
No, gas must be paid by the transaction sender (session key). This is how EVM works.

### "Is my session key MON lost?"
No, you can withdraw it anytime with "withdraw all session key balance".

### "What happens on logout?"
The session key is invalidated, but the MON remains. It's reclaimed or transferred on logout.
