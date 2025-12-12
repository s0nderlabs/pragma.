---
title: Web Console UI Guide
last_updated: 2025-01-20
---

# 💻 Web Console UI Guide

Complete walkthrough of the Pragma web interface—from first visit to advanced delegation management. This guide covers every UI element, user journey, and interaction pattern in the web app.

---

## 🚪 First Visit Experience

### Landing Page

When you first visit `http://localhost:3000`, you'll see:

**Visual Elements:**
- **Pragma Logo:** Center of the screen with purple glow effect
  - Light mode: Standard logo with accent drop shadow
  - Dark mode: White logo with purple glow
- **Chat Console:** Input area below logo
- **Connect Account Button:** Top-right corner (amber accent)

**Initial State:**
- No wallet connected
- Chat input available but prompts connection for operations
- Agent can answer educational questions without connection

### First Connection

**Click "Connect account" button:**

1. **Web3Auth Modal Appears**
   - Choose authentication method (Google, Email, Wallet, etc.)
   - Powered by Web3Auth embedded login
   - Secure authentication flow in popup window

2. **After Authentication:**
   - Button changes to "Connected · [shortened address]"
   - Chat interface fully enabled
   - Agent ready for operations

3. **First-Time User Prompt:**
   - Agent detects no existing delegation
   - Suggests onboarding: "I noticed you haven't set up a delegation yet. Would you like me to help you create one?"
   - Can proceed with natural language: "yes, help me set up"

---

## 🎬 Complete User Journeys

### Journey 1: First-Time User → First Swap

**Step-by-step flow from brand new user to executed swap:**

1. **Visit app** → See landing page with logo and chat

2. **Connect wallet** → Click "Connect account"
   - Authenticate with Web3Auth
   - Status changes to "Connected"

3. **Open Connected Account modal** → Click "Connected · [address]" button
   - Modal opens to **Overview tab**
   - See three addresses: Owner, Delegator, Session Key
   - Status shows "Awaiting issuance" (not deployed yet)

4. **Navigate to Actions tab** → Click "Actions" in modal navigation
   - See delegation issuance panel
   - Choose mode: Safe or Normal

5. **Configure delegation** (Normal mode example):
   - Select tokens from allowlist (purple chips)
   - Add custom tokens if needed (amber chips)
   - Optionally expand "Show Advanced Options" for caps/limits
   - Click "Issue Delegation" button

6. **Sign delegation**:
   - Wallet prompts for EIP-712 signature
   - Approve the delegation request
   - Wait for deployment (if first time)
   - Success toast: "Delegation issued successfully"

7. **Navigate to Delegations tab** → Verify active delegation
   - Green "Active" badge
   - Token allowlist displayed
   - Expiration countdown starts

8. **Close modal** → Return to chat interface

9. **Execute first swap** → Type in chat: "swap 0.1 MON to USDC"
   - Agent parses intent
   - Fetches quote from Monorail
   - Shows preview card with:
     - Input: 0.1 MON
     - Expected output: ~X USDC
     - Minimum output after slippage
     - Price impact
   - Confirmation prompt: "Execute swap?"

10. **Confirm swap** → Click "Execute" or type "yes"
    - Transaction submits using session key
    - Loading state with spinner
    - Success message: "Swap complete! 0.1 MON → X USDC"
    - Transaction hash displayed

11. **View receipt** → Open Connected Account modal → Receipts tab
    - See swap entry with green checkmark
    - Click row to view details
    - Full plan hash, tx hash, gas used, timestamps

**Time to complete:** ~3-5 minutes for first-time user

### Journey 2: Returning User → Quick Swap

**For users with existing active delegation:**

1. **Visit app** → Auto-connects if session exists
2. **Enable quick mode** → Toggle "Quick Mode" to "On" in chat header
3. **Type swap** → "swap 0.5 MON to WMON"
4. **Auto-executes** → No confirmation needed (quick mode enabled)
5. **View result** → Receipt appears in Receipts tab

**Time to complete:** ~30 seconds

### Journey 3: Managing Delegations

**Scenario: Delegation expired, need to reissue:**

1. **Notice expiration** → Chat shows warning: "Your delegation expired 2 hours ago"
2. **Open Connected Account modal** → Navigate to Delegations tab
3. **Check status** → Red "Expired" badge on delegation card
4. **Navigate to Actions tab** → Click "Actions"
5. **Update configuration** → Modify token list or caps if needed
6. **Click "Reissue Delegation"** → Button text shows "Reissue" (not "Issue")
7. **Sign delegation** → Wallet prompts for new signature
8. **Verify new delegation** → Delegations tab shows new green "Active" badge
9. **Resume operations** → Return to chat and continue swapping

### Journey 4: Emergency Revocation

**Scenario: Session key potentially compromised:**

1. **Open Connected Account modal** → Click "Connected · [address]"
2. **Navigate to Actions tab** → See emergency actions bar (amber warning)
3. **Click "Revoke All"** → Red destructive button
4. **Confirmation panel appears** → Shows count of delegations to revoke
5. **Click "Confirm Revoke"** → Nonce increments on-chain
6. **Verify revocation** → Delegations tab shows red "Revoked" badges
7. **Rotate key** → Click "Rotate Key" to generate new session key
8. **Reissue delegation** → Follow standard issuance flow with new key
9. **Resume safely** → Operations continue with new secure session

---

## 🎯 Connected Account Modal

Access via the **"Connected · [address]"** button in the top-right corner after authentication.

### Overview

Four-tab interface for complete account management:

| Tab | Purpose |
|-----|---------|
| **📍 Overview** | Identity info, deployment status, disconnect |
| **⚡ Actions** | Emergency controls + delegation issuance |
| **📜 Delegations** | Active delegation status + history |
| **🧾 Receipts** | Transaction history with details |

---

## 📍 Overview Tab

### Account Identity

Displays three key addresses:

- **👤 Owner:** Your EOA (externally owned account)
- **🏦 Delegator:** HybridDelegator smart account address
- **🔑 Session Key:** Ephemeral key for delegation redemption

### Deployment Status

Shows current state:
- ✅ "HybridDelegator ready" — Deployed and functional
- ⏳ "Awaiting issuance" — Not yet deployed
- 📍 "Already deployed" — Exists on-chain

### Disconnect

**"Disconnect" button** — Clears session and returns to login screen

---

## ⚡ Actions Tab

Two-part layout combining emergency controls with delegation issuance.

### 🚨 Emergency Actions Bar

Always visible at top with amber warning container:

#### Revoke All Button
- **Style:** Red destructive button
- **Action:** Invalidates all active delegations immediately
- **Flow:**
  1. Click "Revoke All"
  2. Confirmation panel appears
  3. Shows count of delegations to revoke
  4. Click "Confirm Revoke"
  5. Success toast: "X delegations revoked"
- **Result:** Status badges update to "Revoked" (red)

#### Rotate Key Button
- **Style:** Amber caution button
- **Action:** Generates new session key + reissues delegation
- **Flow:**
  1. Click "Rotate Key"
  2. New key generated with fresh entropy
  3. Old delegation automatically revoked
  4. New delegation issued with new key
  5. Session key address updates in Overview tab
- **Result:** Seamless transition, no downtime

> ⚠️ **Why always visible?** Emergency actions are critical security controls if your account is compromised or a session key is leaked.

### 🎛️ Delegation Issuance Panel

#### Mode Selector

Choose your risk tolerance:

| Mode | Description |
|------|-------------|
| **🛡️ Safe** | Single pair, 1hr expiry, ≤10 calls, ≤25bps slippage |
| **⚡ Normal** | Multi-token, 24hr expiry, flexible limits, ≤50bps slippage |

#### Token Selection (Normal Mode)

**Allowlist Tokens** (purple chips):
- Fetched from Monorail data API
- Curated list of verified tokens
- Click to toggle selection

**Custom Tokens** (amber chips):
- User-provided ERC-20 addresses
- Address validation via viem `getAddress()`
- Duplicate detection (checks allowlist + existing custom)
- Remove button for custom tokens

**Add Custom Token:**
```
1. Enter token address in "0x..." input field
2. Click "Add" button
3. Validation checks:
   ✓ Valid Ethereum address format
   ✓ Not already in allowlist
   ✓ Not duplicate custom token
4. Token appears as amber chip
5. Included in delegation when issued
```

#### Advanced Options (Collapsible)

Click "Show Advanced Options" to reveal:

- **Custom expiry override** — Duration in seconds
- **Call limit toggle** — Enable/disable + set count
- **Native token cap** — Maximum MON amount (wei)
- **Per-token caps** — Individual limits for each ERC-20

#### Issue Delegation Button

**Text changes based on state:**
- "Issue Delegation" — No active delegation
- "Reissue Delegation" — Updating existing delegation

**Flow:**
1. Click button
2. Delegation artifact built with:
   - Mode (Safe/Normal)
   - Token allowlist (purple + amber chips)
   - Expiry, call limits, caps
   - DTK caveats (timestamp, limitedCalls, nonce)
3. EIP-712 signature requested from owner wallet
4. Artifact stored in localStorage
5. UI updates to show active delegation in Delegations tab

---

## 📜 Delegations Tab

### Primary Delegation Card

Shows most recent **active** delegation (not expired, not revoked).

#### Status Badges

Color-coded indicators:

| Badge | Color | Meaning |
|-------|-------|---------|
| **Active** | 🟢 Green | Valid, unexpired, not revoked |
| **Expired** | 🟡 Amber | Past `expiresAt` timestamp |
| **Revoked** | 🔴 Red | Manually revoked via emergency action |

**Real-time updates:** Status checks using `Math.floor(Date.now() / 1000)` against timestamps—no server polling.

#### Card Contents

- **Mode indicator:** Safe or Normal
- **Token allowlist chips:** Visual list of permitted tokens
- **Expiration countdown:** Real-time timer until delegation expires
- **Details:**
  - Created timestamp
  - Expires timestamp
  - Call limit (used / total)
  - Session key preview

#### View Button

Expands to show full delegation details:
- Complete token list with addresses
- All caveats and their values
- Signature data
- Delegation hash

### Delegation History

Toggle "Show history" to reveal all past delegations.

**Chronological list** with:
- Status badge for each delegation
- Creation timestamp
- Expiration timestamp
- Revocation timestamp (if applicable)
- Token count

**Useful for:**
- Auditing delegation lifecycle
- Verifying revocations
- Tracking token permission changes

---

## 🧾 Receipts Tab

### Transaction History

Displays swap receipts with human-readable summaries.

#### Receipt Cards

**Format:** "Swap [amount] [token_in] → [amount] [token_out]"

Example: "Swap 0.1 MON → 0.2 WMON"

#### Status Indicators

| Status | Icon | Meaning |
|--------|------|---------|
| **Success** | ✅ Green checkmark | Transaction confirmed on-chain |
| **Pending** | ⏳ Spinner | Awaiting confirmation |
| **Failed** | ❌ Red X | Transaction reverted |

#### Detail Modal

Click any receipt row to open detailed view:

**Plan Information:**
- **Plan hash** — Canonical identifier
- **Quote details:**
  - Input token + amount
  - Output token + amount (expected)
  - Minimum output after slippage
  - Slippage tolerance (bps)

**Execution Details:**
- **Transaction hash** — Link to block explorer
- **Block number** — Inclusion block
- **Gas used** — Wei amount
- **Timestamps:**
  - Created (quote fetched)
  - Executed (tx confirmed)

**Delegation Context:**
- Session key used
- Delegator address
- Mode (Safe/Normal)

#### Filters

**Filter by type:**
- All transactions
- Swaps only
- Transfers only
- Wraps/unwraps only

#### Storage

Receipts stored in localStorage: `pragma.h1.receipts.v1`

---

## 💬 Chat Interface

### Layout Components

The chat interface consists of three main areas:

**Header Row:**
- **Quick Mode Toggle** (left side)
  - Label: "Quick Mode" on desktop, "Quick" on mobile
  - Button: "On" (purple) or "Off" (gray)
  - Compact on mobile with `py-1`, standard `py-2` on desktop
- **Connected Button** (right side)
  - Shows "Connected" on mobile, "Connected · [address]" on desktop
  - Opens Connected Account modal when clicked

**Chat Messages Area:**
- Scrollable conversation history
- User messages (right-aligned)
- Agent responses (left-aligned)
- System notifications (center, amber for warnings)
- Empty state: Helpful prompts like "Try: swap 0.1 MON to USDC"

**Input Area (bottom):**
- Multi-line textarea for user input
- Send button (purple accent)
- Auto-focus on page load
- Keyboard shortcuts: Enter to send, Shift+Enter for new line

### Agent Capabilities

Powered by same engine as CLI REPL (gpt-5-mini):

**Supported inputs:**
- **Natural language swaps:** "swap 0.1 MON to USDC", "exchange half my MON for WMON"
- **Wraps/unwraps:** "wrap 0.5 MON", "unwrap all my WMON"
- **Transfers:** "send 0.1 MON to 0x...", "transfer USDC to..."
- **Educational questions:** "what tokens are in my delegation?", "explain quick mode"
- **Meta queries:** "show my balance", "trending tokens", "what's my delegation status?"
- **System commands:** "quick on", "quick off"

**Agent responses:**

1. **Swap Previews** - Structured card format:
   ```
   📊 Swap Preview

   Input: 0.1 MON
   Expected Output: ~0.095 USDC
   Minimum Output: 0.094 USDC
   Slippage: 25 bps (0.25%)
   Price Impact: 0.02%

   Ready to execute? (yes/no)
   ```

2. **Clarifications** - When parameters missing:
   ```
   I see you want to swap MON, but I need a few more details:
   - How much MON would you like to swap?
   - What token do you want to receive?
   ```

3. **Educational Insights:**
   ```
   Your delegation is in Safe mode, which means:
   - Pair-locked to 2 tokens
   - 1 hour expiration
   - Up to 6 calls
   - Maximum 25 bps slippage

   Would you like to switch to Normal mode for more flexibility?
   ```

4. **Safety Warnings:**
   ```
   ⚠️ Your delegation expires in 15 minutes.
   Consider reissuing to avoid interruption.
   ```

5. **Balance Information:**
   ```
   Your current balances:
   - MON: 1.5 (native)
   - WMON: 0.5 (wrapped)
   - USDC: 2.3
   ```

6. **Trending Tokens:**
   ```
   📈 Trending on Monorail:
   1. USDC - 24h volume: $2.5M
   2. WETH - 24h volume: $1.8M
   3. DAI - 24h volume: $900K
   ```

> 💡 **Requires:** `NEXT_PUBLIC_OPENAI_API_KEY` for full capabilities. Without it, only basic intent parsing works.

### Quick Mode Toggle

Located in chat header (top-left):

**Visual States:**

| State | Label | Button | Behavior |
|-------|-------|--------|----------|
| Off (default) | "Quick Mode" / "Quick" | Gray "Off" | Preview + confirmation required |
| On | "Quick Mode" / "Quick" | Purple "On" | Auto-execute when safe |

**When to use:**

**Quick Mode OFF (recommended for new users):**
- Shows preview before every swap
- Confirmation required: "Execute swap? (yes/no)"
- Safer for new users
- Time to review quote, slippage, amounts

**Quick Mode ON (experienced users):**
- Skips confirmations when policy allows
- Faster execution flow
- Still shows preview but auto-proceeds
- Disabled for Safe mode delegations

**Persistence:** Preference saved to `localStorage` (`pragma.h1.quick-mode`) across sessions

### Streaming Responses

Real-time agent output using Server-Sent Events (SSE):

**User Experience:**
1. Type message and send
2. Agent typing indicator appears
3. Text streams in word-by-word
4. Visual feedback during long responses
5. Complete message displayed at end

**Technical Details:**
- Endpoint: `/api/chat/stream`
- Protocol: SSE with `text/event-stream`
- Timeout: 1200ms for first chunk
- Fallback: Non-streaming if SSE fails

**Visual Indicators:**
- Animated dots while waiting
- Incremental text rendering
- Smooth scrolling to bottom
- Done indicator when complete

---

## 🎨 UI States & Visual Feedback

### Loading States

**Delegation Issuance:**
```
[Spinner] Generating session key...
[Spinner] Building delegation artifact...
[Spinner] Waiting for signature...
[Spinner] Deploying smart account...
✅ Delegation issued successfully!
```

**Swap Execution:**
```
[Spinner] Fetching quote from Monorail...
[Spinner] Simulating transaction...
[Spinner] Executing swap...
[Spinner] Waiting for confirmation...
✅ Swap complete! 0.1 MON → 0.095 USDC
```

**Token List Loading:**
```
[Skeleton] Loading allowlist tokens...
[Chips appear] USDC, WETH, DAI, MON, WMON...
```

### Success States

**Green checkmark with message:**
- "Delegation issued successfully"
- "Swap complete! [summary]"
- "X delegations revoked"
- "Session key rotated"

**Toast notifications:**
- Auto-dismiss after 3 seconds
- Positioned top-right
- Green background with white text

### Error States

**Red X with error message:**

```
❌ Error: Insufficient balance
Your delegator has 0.05 MON but you're trying to swap 0.1 MON.

Suggested fix: Fund your delegator or reduce swap amount.
```

**Common error patterns:**

1. **Network errors:**
   ```
   ❌ Failed to fetch quote
   The Monorail API is temporarily unavailable.
   Retry in a few seconds.
   ```

2. **Policy violations:**
   ```
   ❌ Token not in delegation scope
   WETH is not included in your current delegation.

   Fix: Add WETH in Actions tab and reissue delegation.
   ```

3. **Expired delegation:**
   ```
   ❌ Delegation expired
   Your delegation expired 2 hours ago.

   Fix: Navigate to Actions tab and reissue.
   ```

### Empty States

**No Delegations:**
```
📭 No delegations yet

Create your first delegation to start swapping.

[Issue Delegation Button]
```

**No Receipts:**
```
📭 No transaction history

Execute your first swap to see receipts here.

Try: "swap 0.1 MON to USDC"
```

**No Custom Tokens:**
```
No custom tokens added yet.

Enter a token address above to add.
```

### Warning States

**Amber warnings for attention-needed states:**

```
⚠️ Delegation expires in 15 minutes
Consider reissuing to avoid interruption.
```

```
⚠️ Low balance warning
Your delegator has only 0.01 MON remaining.
Fund your account to continue swapping.
```

```
⚠️ High slippage
Your requested swap has 2.5% price impact.
This is higher than normal. Proceed carefully.
```

---

## ⚙️ Settings & Storage

### Local Storage Schema

| Key | Purpose | Version |
|-----|---------|---------|
| `pragma.h1.delegations.v1` | Delegation artifacts | v2 |
| `pragma.h1.active-delegator.v1` | Currently active delegator | v1 |
| `pragma.h1.receipts.v1` | Transaction receipts | v1 |
| `pragma.h1.quick-mode` | Quick mode preference | - |

---

## 🎨 Visual Design

### Glass Morphism Theme

Consistent styling across all components:
- Purple accents (#846FFA primary, #674CF9 secondary)
- Semi-transparent panels with backdrop blur
- Rounded corners (xl for panels, full for buttons)
- Shadow depth for elevation

### Status Colors

| State | Color | Usage |
|-------|-------|-------|
| Active | Emerald (green) | Valid delegations, success states |
| Warning | Amber (yellow/orange) | Expiring soon, caution actions |
| Error | Red | Revoked, failed transactions |
| Info | Purple | Custom tokens, normal info |

### Responsive Behavior

- **Desktop:** Full 4-tab modal with side-by-side layouts
- **Tablet:** Stacked layouts, smaller modal
- **Mobile:** Full-screen modal, single column

---

## 🔍 Troubleshooting

### "Connected" button not appearing

**Cause:** Identity provider not connected

**Fix:**
1. Check `NEXT_PUBLIC_WEB3_AUTH_ID` is set
2. Verify network is correct (sapphire_devnet)
3. Clear browser cache and cookies

### Delegation not showing as active

**Cause:** Expired or revoked

**Check:**
1. Look for status badge color (should be green)
2. Verify expiration timestamp hasn't passed
3. Check if accidentally revoked in Actions tab

### Custom token not appearing in list

**Causes:**
- Invalid address format
- Already in allowlist (shows as purple, not amber)
- Duplicate custom token already added

**Fix:** Check address format is valid checksummed Ethereum address

### Receipts tab empty

**Causes:**
- No transactions executed yet
- localStorage cleared
- Wrong delegator selected

**Check:** Try executing a small swap first

---

## 📚 Related Docs

- [🔧 Environment Setup](../getting-started/install.md)
- [🚪 Onboarding Flow](../getting-started/onboarding.md)
- [🔄 Swap Flow Details](../flows/swap.md)
- [⚙️ API Reference](../reference/api-reference.md)
