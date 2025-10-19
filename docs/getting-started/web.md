---
title: Web Console
---

# 💻 Web Console

The Next.js app in `apps/web` mirrors the CLI experience through a chat-first interface. It reuses the same `@pragma/core` modules for intent parsing, swap execution, and Monorail integration.

---

## 🚀 Quick Start

### 1. Start the Dev Server

```bash
pnpm --filter @pragma/web dev
# Opens http://localhost:3000
```

The console runs with TurboPack hot reloading.

### 2. Configure Environment

The web layer reads configuration from `NEXT_PUBLIC_*` variables. Mirror the CLI settings you need:

**Minimum recommended:**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_WEB3_AUTH_ID` | Web3Auth client ID |
| `NEXT_PUBLIC_WEB3_AUTH_NETWORK` | Web3Auth environment (default: sapphire_devnet) |
| `NEXT_PUBLIC_MONAD_RPC_URL` | Execution RPC endpoint |
| `NEXT_PUBLIC_MONAD_ENVIO_READ_RPC_URL` | HyperRPC for reads |
| `NEXT_PUBLIC_PIMLICO_API_KEY` | Bundler/paymaster access |
| `NEXT_PUBLIC_MONORAIL_APP_ID` | Monorail Pathfinder/Data access |
| `NEXT_PUBLIC_OPENAI_API_KEY` | Agent insights (gpt-5-mini) |

> 📖 **Full list:** See [`install.md`](install.md) for all available variables

### 3. Authenticate & Use

1. Open `http://localhost:3000`
2. Click "Connect account"
3. Authenticate via Web3Auth
4. Start chatting with the Pragma agent!

**Example commands:**
- "swap 0.1 MON to USDC"
- "show my delegation"
- "what tokens are available?"

---

## ⚙️ What the Console Provides

### 🤖 Conversational Agent

- **Natural language interface:** Type requests in plain English
- **Streaming responses:** Real-time SSE for instant feedback
- **Educational insights:** Ask questions about Pragma, Monad, DeFi
- **Same engine as CLI:** Identical parser + gpt-5-mini enhancement

### 🔐 Secure Onboarding

- **CREATE2 deployment:** `/api/onboarding/deploy` server action
- **Sponsorship:** Uses `PRAGMA_ADMIN_TEST_PK` for gasless deployment
- **Identity provider:** Web3Auth

### 💱 Swap Execution

- **Quote explorer:** `/api/monorail/quote` forwards requests to Pathfinder
- **Full preview:** See quote, slippage, gas before execution
- **Receipt storage:** JSON records in localStorage

### 📊 Token Management

- **Token picker:** `/api/tokens` loads Monorail data API
- **5-minute cache:** Falls back to MON/WMON if unavailable
- **Allowlist + custom:** Support for user-provided ERC-20s

### 🎛️ UI Features

- **4-tab modal:** Overview, Actions, Delegations, Receipts
- **Emergency controls:** Revoke All, Rotate Key (always visible)
- **Delegation issuance:** Safe/Normal modes with visual token selection
- **Quick mode:** Toggle confirmations on/off

> 💡 **Full UI walkthrough:** See [`/guides/web-ui-guide.md`](/guides/web-ui-guide.md)

---

## 🔧 Optional Toggles

| Variable | Effect |
|----------|--------|
| `NEXT_PUBLIC_PRAGMA_DISABLE_HYPERSYNC=1` | HyperSync currently disabled (future feature) |
| `NEXT_PUBLIC_PRAGMA_AGENT_STREAM_INSIGHTS=0` | Disable streaming, use full responses |

---

## 💾 Local Storage

All data stored in browser (no server persistence):

| Key | Contents |
|-----|----------|
| `pragma.h1.delegations.v1` | Delegation artifacts (schema v2) |
| `pragma.h1.active-delegator.v1` | Currently selected delegator |
| `pragma.h1.receipts.v1` | Transaction receipts |
| `pragma.h1.quick-mode` | Quick mode preference |

---

## 🧪 Testing Notes

### Fixture Mode

Playwright tests use fixture mode to avoid live API calls:

```bash
# Environment setup for tests
NEXT_PUBLIC_PRAGMA_FIXTURE_MODE=1
PRAGMA_REPL_FIXTURE=1
```

Fixture data loaded from `fixtures/` directory.

---

## 🎯 Common Workflows

### First-Time Setup

```bash
# 1. Configure environment
cp .env.example .env.local
# Add NEXT_PUBLIC_* variables

# 2. Start dev server
pnpm --filter @pragma/web dev

# 3. Open browser
open http://localhost:3000

# 4. Authenticate
# Click "Connect account" → Web3Auth

# 5. Onboard
# Chat: "onboard with safe mode"
# Or click "Issue Delegation" in Actions tab

# 6. Execute swap
# Chat: "swap 0.1 MON to USDC"
```

### Chat Examples

**Natural language:**
```
> swap 0.5 MON to USDC
> wrap 1 MON
> what's my balance?
> show trending tokens
```

**Quick mode:**
```
> quick on
> swap max MON to WMON
[Executes immediately without confirmation]
```

---

## 📚 Next Steps

- [📖 Full UI walkthrough](../guides/web-ui-guide.md) — Detailed guide to all UI features
- [🔧 Environment setup](install.md) — Complete variable reference
- [🚪 Onboarding flow](onboarding.md) — Deploy your first smart account
- [🔄 Swap flow details](../flows/swap.md) — Understand execution lifecycle
- [🔌 API reference](../reference/api-reference.md) — Backend route documentation
