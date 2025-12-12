# Security

How Pragma keeps your assets safe.

## Architecture Security

### Your Keys, Your Crypto

Pragma uses non-custodial architecture:
- **You own your wallet** - Created via Web3Auth, only you have access
- **No central control** - Pragma cannot access your funds
- **On-chain security** - Smart contracts enforce all rules

### Smart Account Protection

Your smart account (HybridDelegator) provides:
- **Permissioned execution** - Only authorized actions allowed
- **Delegation limits** - Session keys have restricted permissions
- **On-chain verification** - All rules enforced by smart contracts

---

## Session Key Security

### Limited Permissions

Session keys can ONLY:
- Execute specific functions (swap, transfer, etc.)
- Use defined tokens and amounts
- Act within their delegation scope

Session keys CANNOT:
- Drain your smart account
- Execute unauthorized transactions
- Access tokens outside their scope

### Limited Funds

Session keys hold only:
- ~0.5 MON for gas
- Nothing else

Maximum risk if compromised: ~0.5 MON

### Easy Revocation

If concerned, instantly revoke:
```
Revoke my session key
```

A new session key is generated on next action.

---

## Delegation Security

### How Delegations Work

1. You sign a delegation (permission grant)
2. Delegation includes caveats (restrictions)
3. Session key can only act within caveats
4. Smart contract enforces restrictions on-chain

### Caveat Examples

- **AllowedTargets**: Can only call specific contracts
- **AllowedMethods**: Can only call specific functions
- **NativeTokenTransferAmount**: Limits MON transfers
- **ERC20TransferAmount**: Limits token transfers
- **TimestampRange**: Delegation expires automatically

### One-Time Signatures

Each operation uses a fresh delegation. No blanket approvals.

---

## Transaction Security

### Quote-Then-Execute

1. See full quote before any action
2. Review amounts, fees, rates
3. Explicitly confirm or reject
4. Only then does execution happen

### Slippage Protection

- Default 5% max slippage
- Transactions revert if price moves too much
- You never receive less than minimum output

### No Blind Signing

Every transaction shows:
- What you're sending
- What you're receiving
- All fees involved

---

## Protocol Security

### Audited Integrations

Pragma integrates only with:
- **Audited protocols** (Monorail, aPriori, OpenSea)
- **Verified contracts**
- **Established projects**

### No Token Approvals

Pragma's delegation model means:
- No unlimited token approvals
- No approval phishing risk
- Each action is independently authorized

### Fee Transparency

All fees clearly shown:
- 1% protocol fee (where applicable)
- Network gas costs
- Protocol fees (aPriori, etc.)

---

## Web3Auth Security

### Social Login Protection

- Keys derived from your social identity
- Only you can access your wallet
- No password to lose or steal

### Recovery

Your wallet is recoverable through:
- Same social login (Google, Discord, etc.)
- Connected to your identity, not a seed phrase

---

## Best Practices

### Do

- Start with small test transactions
- Review quotes before confirming
- Monitor your session key balance
- Revoke session key if concerned
- Keep your social login secure

### Don't

- Share session key private keys
- Approve transactions you don't understand
- Ignore unusually high fees
- Rush through confirmations

---

## If Something Goes Wrong

### Session Key Compromised

1. Risk is limited to ~0.5 MON
2. Revoke immediately: `Revoke my session key`
3. New session key generated on next action

### Suspicious Activity

1. Check transaction history
2. Revoke session key
3. Review connected applications

### Need Help

- Check [Troubleshooting](../help/troubleshooting.md)
- Review [FAQ](../help/faq.md)

---

## Security Summary

| Layer | Protection |
|-------|------------|
| Wallet | Non-custodial, Web3Auth secured |
| Smart Account | On-chain permission enforcement |
| Session Key | Limited funds (~0.5 MON), revocable |
| Delegations | Caveat-restricted, one-time use |
| Transactions | Quote-confirm pattern, slippage protection |
| Protocols | Audited integrations only |
