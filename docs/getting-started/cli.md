---
title: CLI Basics
---

# 🎮 CLI Basics

The CLI is the fastest way to exercise every H1 capability. Running `pnpm --filter @pragma/cli dev` starts a TypeScript watcher and boots the Commander program.

---

## 🚀 Launch Modes

| Command | Behavior |
|---------|----------|
| `pragma` | Starts the **agent REPL** (natural language chat) |
| `pragma <command>` | Executes a specific command **directly** |

---

## 💬 REPL vs ⚡ Command Mode

Choose your workflow:

| | **💬 REPL Mode** | **⚡ Command Mode** |
|---|---|---|
| **Launch** | `pragma` | `pragma <command>` |
| **Style** | Natural language chat | Flag-based CLI |
| **Powered by** | gpt-5-mini agent | Deterministic parser |
| **Example** | "swap half MON to USDC" | `--amount 0.5 --from MON --to USDC` |
| **Best for** | Exploration, learning | Scripting, automation |

### 💬 REPL Mode Features

- **Natural language:** "swap 0.2 MON to USDC" → executed swap
- **Educational Q&A:** "what tokens are in my delegation?"
- **Meta commands:** `:balances`, `:delegation`, `:trending`, `:quick`, `:exit`
- **Streaming insights:** Real-time responses powered by gpt-5-mini

> 💡 **Requires:** `OPENAI_API_KEY` for full agent capabilities. Without it, you get basic intent parsing only.

### ⚡ Command Mode Features

- **Scriptable:** Predictable flags, no LLM calls
- **Fast:** Deterministic execution without agent overhead
- **CI/CD friendly:** Works offline, no API keys needed

<details>
<summary>📖 Full REPL mode guide (click to expand)</summary>

### Meta Commands

Available in REPL only:

| Command | Action |
|---------|--------|
| `:balances` | Show MON/WMON balances |
| `:delegation` | Display active delegation details |
| `:trending` | Fetch trending tokens from Monorail |
| `:quick` | Toggle quick mode (skip confirmations) |
| `:logout` | Clear session and disconnect |
| `:exit` | Exit the REPL |

### Example Session

```
pragma> swap 0.1 MON to USDC
[Agent provides quote preview and confirmation prompt]

pragma> what tokens are in my delegation?
[Agent lists allowlisted tokens with addresses]

pragma> :quick
✓ Quick mode enabled

pragma> swap max MON to WMON
[Executes immediately without confirmation]
```

</details>

---

## ⚙️ Core Commands

### Onboarding & Session Management

| Command | Description |
|---------|-------------|
| `onboard:4337 [options]` | Deploy HybridDelegator + issue delegation |
| `status [--delegator <addr>]` | Show balances, delegation TTL, remaining calls |
| `fund [--delegator <addr>]` | Display funding instructions + balance watcher |
| `fund:faucet [--delegator <addr>]` | Send MON/WMON from admin wallet (dev only) |
| `delegation:list` | List stored delegations with diagnostics |
| `delegation:issue` | Re-run signing flow for existing delegator |
| `delegation:revoke [--also-disable]` | Increment DTK nonce (invalidates all sessions) |
| `replace [--delegator <addr>]` | Rotate session key + reissue delegation |

**Options for onboard:4337:**
- `--mode safe|normal` - Choose safety mode
- `--calls <n>` - Set call limit
- `--unlimited-calls` - Remove call limit

### Swaps & Quotes

| Command | Description |
|---------|-------------|
| `swap --amount <value> --from <token> --to <token>` | Execute delegated swap |
| `swap:preview [options]` | Fetch quote without executing |
| `receipts [--delegator <addr>]` | List recent swap receipts |

**Swap options:**
- `--slippage-bps <bps>` - Set slippage tolerance
- `--artifact <path>` - Point to specific delegation file
- `--delegator <addr>` - Select delegator when multiple exist

### Wrap / Unwrap / Transfer

| Command | Description |
|---------|-------------|
| `wrap --amount <mon>` | Wrap MON → WMON |
| `unwrap --amount <wmon>` | Unwrap WMON → MON |
| `transfer:mon [--amount] [--recipient]` | Transfer native MON |
| `transfer:token [--token] [--amount] [--recipient]` | Transfer ERC-20 token |

---

## 🔧 Environment Toggles

| Variable | Effect |
|----------|--------|
| `PRAGMA_REPL_FIXTURE=1` | Run commands against fixtures (no RPC calls) |
| `PRAGMA_AGENT_LOG=1` | Emit structured agent telemetry |
| `PRAGMA_AGENT_SKIP_ONBOARD=1` | Prevent auto-onboarding prompt |
| `PRAGMA_AGENT_QUICK_MODE=1` | Start REPL with quick mode enabled |

> See [`install.md`](install.md) for full environment reference.

---

## 📂 Artifact & Receipt Locations

- **Delegations:** `~/.pragma/test-delegations/<delegator>/delegation-4337-*.json`
- **Receipts:** `~/.pragma/receipts/<delegator>/swap-*.json`

Override with `PRAGMA_DELEGATION_DIR` and `PRAGMA_RECEIPT_DIR`.

---

## 🎯 Common Workflows

### Quick Start

```bash
# 1. Onboard with Safe mode
pragma onboard:4337 --mode safe

# 2. Execute a swap
pragma swap --amount 0.1 --from MON --to USDC

# 3. Check receipts
pragma receipts
```

### REPL Workflow

```bash
# Launch REPL
pragma

# Natural language commands
> swap 0.2 MON to USDC
> what's my balance?
> :delegation
> :exit
```

### Scripting Example

```bash
#!/bin/bash
# Automated swap rotation

pragma delegation:revoke --also-disable
pragma delegation:issue
pragma swap --amount 1.0 --from MON --to WMON --slippage-bps 25
```

---

## 📚 Next Steps

- [🔄 Walk through the swap flow](../flows/swap.md)
- [⚙️ Explore all CLI commands](../reference/cli-reference.md)
- [📝 Learn about receipts](../system-layers/receipts-observability.md)
