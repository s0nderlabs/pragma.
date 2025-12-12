# Connecting Your Wallet

This guide explains how to connect to Pragma and what happens during the onboarding process.

## Sign-In Options

Pragma uses **Web3Auth** for authentication, which provides familiar sign-in methods:

### Google Sign-In
The fastest option. Click "Continue with Google" and authorize with your Google account.

### Email Sign-In
1. Enter your email address
2. Check your inbox for a verification code
3. Enter the code to complete sign-in

### Other Social Logins
Depending on configuration, you may also see options for:
- Apple
- Discord
- Twitter/X

## What Happens When You Connect

### 1. Key Generation
Web3Auth generates a cryptographic key pair unique to your login:
- This key is your **owner key**
- It controls your smart account
- It's stored securely in your browser

### 2. Smart Account Deployment
If this is your first time:
- Pragma deploys a **HybridDelegator** smart account for you
- This is your main wallet address on Monad
- All your tokens and NFTs are held here

### 3. Session Key Creation
A temporary **session key** is generated:
- Used to pay for transaction gas
- Automatically funded with ~0.5 MON
- Refills automatically when balance is low

### 4. Onboarding Tutorial
First-time users see a quick tutorial explaining:
- How the sidebar works
- How to chat with the AI
- What Quick Mode does
- Terms of service agreement

## Understanding Your Accounts

After connecting, you have three related addresses:

| Account Type | Purpose | Visibility |
|--------------|---------|------------|
| **Smart Account** | Holds your tokens/NFTs | Shown in sidebar |
| **Owner Account** | Signs delegations | Hidden |
| **Session Key** | Pays for gas | Shown in settings |

### Smart Account (HybridDelegator)
- Your main wallet address
- Share this to receive tokens
- Controlled by your owner key
- Cannot be changed or recovered without owner key

### Owner Account
- Created by Web3Auth from your login
- Signs permissions for the session key
- Never directly sends transactions
- Tied to your Google/email account

### Session Key
- Ephemeral (can be regenerated)
- Holds a small amount of MON for gas
- Executes transactions on your behalf
- Can be revoked anytime

## Viewing Your Wallet Info

### In the Sidebar
Click your address in the sidebar header to see:
- Full address (with copy button)
- Current MON balance
- USD equivalent

### Via Chat
Ask Pragma:
```
What's my account info?
```

Response includes:
- Smart account address
- Owner address
- Session key address
- Network information

## Disconnecting

To disconnect:
1. Open the Settings tab in the sidebar
2. Click **Disconnect**
3. Confirm the action

**What happens:**
- Your session is cleared from the browser
- Session key is invalidated
- Smart account remains on-chain (with your tokens)

**To reconnect:**
- Sign in with the same method (Google/email)
- You'll reconnect to the same smart account
- A new session key will be created

## Security Tips

1. **Keep your login secure**: Your Google/email account controls your smart account
2. **Use a strong password**: If using email sign-in
3. **Enable 2FA**: On your Google account if using Google sign-in
4. **Don't share session keys**: They can execute transactions on your behalf
5. **Revoke if compromised**: If you suspect unauthorized access, revoke all delegations

## Troubleshooting Connection Issues

### "Connection Failed"
- Check your internet connection
- Try a different browser
- Clear cache and cookies
- Disable browser extensions temporarily

### "Smart Account Not Found"
- You may be signing in with a different account
- Verify you're using the same Google/email as before

### "Session Key Error"
- Try disconnecting and reconnecting
- Check if you have MON in your smart account

For more help, see [Troubleshooting](../help/troubleshooting.md).
