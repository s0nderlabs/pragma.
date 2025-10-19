---
title: Web Console UI Guide
---

# 💻 Web Console UI Guide

Complete walkthrough of the Pragma web interface—from setup to delegation management.

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

### Agent Capabilities

Powered by same engine as CLI REPL (gpt-5-mini):

**Supported inputs:**
- Natural language swaps: "swap 0.1 MON to USDC"
- Educational questions: "what tokens are in my delegation?"
- Meta queries: "show my balance", "trending tokens"
- System commands: "quick on", "quick off"

**Agent responses:**
- Swap previews with quote details
- Clarifications when parameters missing
- Educational insights about Pragma, Monad, DeFi
- Safety warnings (low balances, expiring delegations)
- Trending token data from Monorail

> 💡 **Requires:** `NEXT_PUBLIC_OPENAI_API_KEY` for full capabilities

### Quick Mode Toggle

Located in chat header:

**Disabled (default):**
- Shows preview before every swap
- Confirmation required
- Safer for new users

**Enabled:**
- Skips confirmations when policy allows
- Faster execution
- For experienced users

**Persistence:** Preference saved to localStorage across sessions

### Streaming Responses

Server-Sent Events (SSE) for real-time output:
- Text appears incrementally as agent generates
- Visual feedback during processing
- Fallback to non-streaming if disabled

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
