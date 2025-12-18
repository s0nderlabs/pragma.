# Troubleshooting

Solutions for common issues.

## Connection Issues

### Can't Connect Wallet

**Symptoms:**
- "Connect" button doesn't respond
- Web3Auth popup doesn't appear
- Stuck on loading

**Solutions:**
1. **Clear browser cache** - Remove stored data and try again
2. **Disable popup blocker** - Web3Auth needs popups
3. **Try different browser** - Chrome/Firefox recommended
4. **Check internet connection** - Stable connection required

### Session Expired

**Symptoms:**
- Actions fail silently
- "Not connected" errors
- Session key not found

**Solutions:**
1. **Reconnect** - Click disconnect, then connect again
2. **Refresh page** - Full page refresh
3. **Clear local storage** - Browser settings → Clear site data

### Web3Auth Popup Blocked

**Symptoms:**
- Nothing happens when clicking Connect
- Brief flash then nothing

**Solutions:**
1. **Allow popups** for the Pragma domain
2. **Check popup blocker extensions**
3. **Try incognito/private mode**

---

## Transaction Issues

### Transaction Failed

**Symptoms:**
- "Transaction failed" message
- Operation not completed
- No receipt shown

**Common Causes & Solutions:**

**Session Key Low Balance:**
The system will auto-fund on your next transaction. Ensure your smart account has MON.

**Quote Expired:**
```
[Request a new quote for your operation]
```

**Network Congestion:**
- Wait a moment and retry
- Network may be processing many transactions

**Slippage Too Low:**
- Price moved beyond tolerance
- Request new quote (includes current price)

### Quote Expired

**Symptoms:**
- "Quote expired" message
- Can't confirm after delay

**Solutions:**
1. Request a new quote for your operation
2. Confirm within 5 minutes next time
3. Use Quick Mode for faster execution:
   ```
   Enable quick mode
   ```

### Insufficient Balance

**Symptoms:**
- "Insufficient balance" error
- Can't complete swap/stake

**Solutions:**
1. **Check balance:**
   ```
   What's my balance?
   ```
2. **Account for fees** - Need 1% more than swap amount
3. **Check the right token** - Ensure you have the input token

### Transaction Pending

**Symptoms:**
- Transaction submitted but no confirmation
- Waiting for long time

**Solutions:**
1. **Wait** - Block times vary, usually ~1 second
2. **Check transaction** - Use the provided explorer link
3. **Network issues** - Temporary congestion

---

## Balance Issues

### Balance Shows 0

**Symptoms:**
- Balance displays as 0
- Tokens not appearing

**Solutions:**
1. **Check connection:**
   ```
   What's my account info?
   ```
2. **Refresh balances:**
   ```
   What's my balance?
   ```
3. **Verify address** - Ensure you're checking the right account

### Wrong Balance Displayed

**Symptoms:**
- Amount doesn't match expected
- Recent transaction not reflected

**Solutions:**
1. **Wait for confirmation** - Transaction may still be processing
2. **Refresh:**
   ```
   What's my [TOKEN] balance?
   ```
3. **Check transaction status** - Use explorer link from receipt

### Tokens Missing After Swap

**Symptoms:**
- Swapped but tokens not showing
- Input deducted, output missing

**Solutions:**
1. **Check for the new token:**
   ```
   What's my USDC balance?
   ```
2. **Verify transaction succeeded** - Check explorer
3. **Add token to view** - Some tokens need manual addition

---

## Session Key Issues

### Session Key Not Found

**Symptoms:**
- "Session key not found" errors
- Can't execute transactions

**Solutions:**
1. **Reconnect:**
   - Disconnect
   - Connect again
   - New session key created automatically

### Session Key Low Balance

**Symptoms:**
- "Low balance" warning
- Transactions failing

**Solutions:**
1. **Wait for auto-fund** - Happens automatically on next transaction
2. **Check smart account balance** - Need MON available for auto-refill:
   ```
   What's my MON balance?
   ```

### Funding Failed

**Symptoms:**
- Can't fund session key
- Funding transaction fails

**Solutions:**
1. **Check smart account MON balance:**
   ```
   What's my MON balance?
   ```
2. **Add MON to smart account** - Need funds to transfer

---

## Staking Issues

### Unstake Request Not Found

**Symptoms:**
- Can't find request ID
- "Request not found" error

**Solutions:**
1. **Check all requests:**
   ```
   Check my unstake status
   ```
2. **Verify request ID** - May have already claimed
3. **Wait if just submitted** - Allow time for confirmation

### Claim Not Available

**Symptoms:**
- Request shows pending
- Can't claim yet

**Solutions:**
1. **Check status:**
   ```
   Check my unstake status
   ```
2. **Wait for epoch** - 12-18 hours typical
3. **Note claimable time** - Will show estimated time

### Already Claimed

**Symptoms:**
- "Already claimed" error
- Request not in list

**Solutions:**
1. **Check MON balance** - May have received already
2. **Review transaction history** - Confirm claim succeeded

---

## NFT Issues

### Collection Not Found

**Symptoms:**
- "Collection not found" error
- Can't browse collection

**Solutions:**
1. **Check exact slug:**
   ```
   Search for [collection name]
   ```
2. **Use slug, not name** - "skrumpeys" not "Skrumpeys"
3. **Verify collection exists** - May not be on OpenSea

### NFT Not Listed

**Symptoms:**
- Can't buy specific NFT
- "Not listed" error

**Solutions:**
1. **Browse available listings:**
   ```
   Browse [collection-slug]
   ```
2. **NFT may have sold** - Someone else bought it
3. **Owner delisted** - No longer for sale

### Purchase Failed

**Symptoms:**
- Buy transaction failed
- NFT not received

**Solutions:**
1. **Check if sold** - Someone else may have bought it
2. **Request new quote** - Price may have changed
3. **Check balance** - Need NFT price + 1% + gas

---

## Quick Fixes

### General Reset
1. Disconnect wallet
2. Clear browser cache
3. Reconnect

### Check Everything
```
What's my account info?
```
Shows account, session key, and balances.

### Refresh Session Key
Disconnect from Settings and reconnect - a new session key is created automatically.

---

## Agent Behavior Issues

### Agent Explains Instead of Acting

**Symptoms:**
- Agent describes what should happen instead of executing
- No tool calls made when you request an action
- Agent says "you should..." instead of doing it

**Cause:** Sliding window context can become confused after many exchanges.

**Solutions:**
1. **Refresh the page** - Best fix, resets context completely
2. **Ask something simple first:**
   ```
   What's my balance?
   ```
   Then retry your original request
3. **Be explicit:** "Execute a swap of 50 MON to USDC" instead of "can you swap..."

### Agent Gives Wrong Information

**Symptoms:**
- Balance information is outdated
- References operations that didn't happen

**Solutions:**
1. **Refresh the page** - Clears stale context
2. **Ask for current data:**
   ```
   What's my balance right now?
   ```

---

## Still Having Issues?

If none of these solutions work:
1. Note the exact error message
2. Check which operation failed
3. Review the [FAQ](faq.md)
4. Refresh the page and try again
5. If persistent, disconnect and reconnect your wallet
