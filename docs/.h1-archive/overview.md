---
title: Pragma Horizon 1 Overview
---

# 📖 Pragma Horizon 1 Overview

> **In brief:** Pragma converts natural-language requests into delegated swaps on Monad testnet. Horizon 1 (H1) keeps the feature set intentionally narrow—every stage remains auditable and easy to revoke.

**Pragma** is a product of [s0nderlabs](https://s0nderlabs.xyz), available at [pr4gma.xyz](https://pr4gma.xyz).

---

## 🔑 What is MetaMask DTK?

**MetaMask Delegation Toolkit (DTK)** is MetaMask's framework for EIP-7702/ERC-4337 delegations. It provides the smart contract infrastructure that enables secure, time-limited authority delegation:

- **HybridDelegator**: ERC-4337 smart account for delegation-based execution (deployed via CREATE2)
- **DelegationManager**: On-chain contract that enforces delegation rules and redeems delegated calls
- **Caveat Enforcers**: On-chain guards that enforce restrictions:
  - **Timestamp caveat**: Time-to-live (TTL) for delegation expiry
  - **LimitedCalls caveat**: Maximum number of transactions allowed
  - **Nonce caveat**: Enables instant revocation by bumping the nonce

**Pragma USES these contracts** (doesn't deploy them) to enable session keys with strict safety rails. Learn more at [MetaMask Delegation Toolkit docs](https://docs.metamask.io/delegation-toolkit).

---

## 🚀 What Ships in H1

### 🔐 HybridDelegator Onboarding (ERC-4337)

Deploy a smart account with:
- **Deployment:** CREATE2 via Pimlico (gasless sponsorship)
- **Authentication:** Web3Auth for root signatures
- **Session keys:** Generated client-side for delegation
- **Storage:** Artifacts saved to `~/.pragma/test-delegations/`

> Available in both CLI and web app.

### 🔄 Delegated Swaps

Execute swaps through Monorail aggregator:
- **Routing:** Optimal paths via Monorail Pathfinder
- **Delegation:** Session key redeems on-chain authority
- **Caveats:** DTK guards for scope, TTL, usage limits
- **Preview:** Full quote + simulation before execution

### 🎁 Wrap / Unwrap / Transfer Helpers

With an active delegation:
- **Wrap:** MON → WMON
- **Unwrap:** WMON → MON
- **Transfer:** Native MON or any allowlisted ERC-20

All using the same session key—no repeated signatures.

### 📊 Preview-First Execution

Every swap includes:
- ✅ Balance resolution
- ✅ `eth_call` simulation with final calldata
- ✅ `minAmountOut` validation
- ✅ `plan_hash` generation (canonical identifier)

UserOperation sent **only after** preview passes.

### 📝 Local Receipts + Observability

Each transaction produces:
- **English summary:** "Swap 0.1 MON → 0.2 USDC"
- **JSON record:** Keyed by `plan_hash`, `tx_hash`, delegation nonce
- **Agent telemetry:** Toggleable debug logs for troubleshooting
- **HyperSync (future):** Real-time streaming for live updates (planned for future release)

> **📍 Current Status:** Pragma uses **HyperRPC** (Envio's fast read-only endpoint) for balance queries and simulations. **HyperSync** (real-time streaming) is planned for a future release and currently disabled (`PRAGMA_DISABLE_HYPERSYNC=1` by default).

---

## 🛡️ Safety Modes

Choose your risk tolerance:

| | **Safe Mode** | **Normal Mode** |
|---|---|---|
| **🎯 Scope** | Pair-locked (2 tokens only) | Monorail allowlist + custom tokens |
| **⏱️ TTL** | 1 hour | 24 hours |
| **📞 Call Limit** | 6 calls (default) | 12 calls (default) |
| **📉 Slippage** | ≤ 25 bps | ≤ 50 bps |
| **Best for** | Testing, tight controls | Flexible trading, wraps/transfers |

> **Note:** Both modes embed DTK `timestamp`, `limitedCalls`, and `nonce` caveats. Per-token and native caps are enforced off-chain by the swap engine.

---

## 💰 Who Pays Gas?

Understanding gas payments is critical for using Pragma effectively:

| Action | Who Pays | Cost | Notes |
|--------|----------|------|-------|
| **Create delegation** | Nobody | ✅ **FREE** | Off-chain EIP-712 signature, zero gas cost |
| **Deploy HybridDelegator** | Pimlico (sponsored) | ✅ **FREE** | One-time CREATE2 deployment, sponsored by Pimlico |
| **Swaps/Transfers/Wrap/Unwrap** | Session key | 💵 ~0.001-0.01 MON per tx | Session key must be funded with ~0.1-1 MON |
| **Revoke delegations** | Main account | 💵 ~0.01 MON | Bumps nonce on-chain via UserOperation |

**Key takeaways:**
- ✅ **Setup is free**: Both delegation creation and HybridDelegator deployment cost zero gas
- 💵 **Fund your session key**: Before executing swaps, ensure your session key has sufficient MON for gas
- 🔄 **Revocation costs gas**: Main account pays a small fee to invalidate all active delegations

---

## 🔄 Pipeline Summary

```
1️⃣ Intent Engine
   ↓ Normalizes request → canonical "swap" struct

2️⃣ Policy & Safety
   ↓ Applies Safe/Normal clamps, highlights cap overruns

3️⃣ Routing & Quotes
   ↓ Fetches Monorail Pathfinder quote → generates plan_hash

4️⃣ Simulation & Preview
   ↓ Resolves amounts, runs eth_call, validates minAmountOut

5️⃣ Execution
   ↓ Builds UserOperation → redeems delegation → waits for inclusion

6️⃣ Receipts & Observability
   ✓ Captures English + JSON receipts, emits telemetry
```

<details>
<summary>🔍 Technical Implementation Details</summary>

### 1. Intent Engine
- **Module:** `@pragma/core/intent`
- **Process:** Normalizes text → resolves symbols → emits canonical intent or clarification
- **Enhancement:** Optional gpt-5-mini layer for conversational responses

### 2. Policy & Safety
- **Module:** `@pragma/core/agent`, delegation artifacts
- **Process:** Enforces mode-specific clamps, checks token allowlists, validates caps

### 3. Routing & Quotes
- **Module:** `@pragma/core/monorail/pathfinder`
- **Process:** Fetches quote from Monorail → normalizes calldata → hashes plan

### 4. Simulation & Preview
- **Module:** `@pragma/core/execution/swap`
- **Process:** Resolves exact/fraction/max amounts → `eth_call` via HyperRPC → checks slippage

### 5. Execution
- **Module:** `@pragma/core/execution/swap`, MetaMask DTK, Pimlico
- **Process:** Builds UserOperation → redeems delegation via `DelegationManager` → submits to bundler

### 6. Receipts & Observability
- **Module:** `apps/cli/src/services/receiptStore.ts`, telemetry (HyperSync planned for future)
- **Process:** Stores structured receipts → emits logs → exposes counters

</details>

---

## 🗺️ Where to Go Next

**Start here:**
- [🔧 Install dependencies and configure environment](getting-started/install.md)
- [🚪 Onboard a HybridDelegator and issue your first delegation](getting-started/onboarding.md)

**Learn the interfaces:**
- [🎮 Explore the CLI REPL and scripted commands](getting-started/cli.md)
- [💻 Use the web app console](getting-started/web.md)

**Deep dives:**
- [🔄 Walk through the swap flow in detail](flows/swap.md)
- [🧠 Dive into specific system layers](system-layers/intent-engine.md)

**Reference:**
- [⚙️ Find provider configuration and troubleshooting tips](appendix/providers.md)
- [⚡ Browse CLI command reference](reference/cli-reference.md)
