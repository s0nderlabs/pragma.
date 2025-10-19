---
title: Onboard a HybridDelegator
---

# Onboard a HybridDelegator (ERC‑4337)

`pragma onboard:4337` deploys a MetaMask HybridDelegator, issues a session delegation, and saves the resulting artifact under `~/.pragma/test-delegations/…`. The command wires together Web3Auth, Pimlico, Monorail metadata, and the DTK caveat helpers hosted in `@pragma/core`.

## 1. Launch the CLI

```bash
pnpm --filter @pragma/cli dev
```

Running `pragma` with no arguments opens the interactive REPL. You can also invoke commands directly:

```bash
pragma onboard:4337
```

## 2. Pick a Mode

You can preselect a mode or follow the interactive prompt.

| Flag | Effect |
| --- | --- |
| `--mode safe` | Pair-scoped delegation, 1 h TTL, default 6 calls. |
| `--mode normal` | Curated allowlist delegation, 24 h TTL, default 12 calls. |

If omitted, the CLI prompts you to choose between Safe and Normal after authentication.

## 3. Identity Provider

**Web3Auth** is used for authentication. The bridge spins up a local HTTP server; override the port via `WEB3AUTH_BRIDGE_PORT` if you need a consistent origin.

## 4. Token Scope & Call Limits

- **Safe mode** prompts you to select exactly two tokens from the live Monorail allowlist. The CLI automatically includes both native MON and wrapped MON if you choose the native asset so that wrap/unwrap remains available. The delegation is pair-locked; swapping other assets requires a re-issue.
- **Normal mode** starts with the curated Monorail list. You can append or remove tokens before signing, and the allowlist is persisted for later use.

Call limits default to `DEFAULT_CALL_LIMITS` (`6` for Safe, `12` for Normal). Override with:

| Flag | Behavior |
| --- | --- |
| `--calls <count>` | Set a custom limit enforced by DTK’s `LimitedCalls` caveat. |
| `--unlimited-calls` | Skip the limited-calls caveat entirely (uses nonce + TTL only). |

> `--calls` and `--unlimited-calls` are mutually exclusive. Passing both aborts the command.

## 5. Session Key & Delegation Signing

During onboarding the CLI:

1. Generates a new session key pair (`@pragma/core`’s `generateSessionKey`) unless an existing secret is detected.
2. Builds a DTK delegation via `buildHybridScope` and `buildHybridCaveats`:
   - Caveats: `timestamp` (TTL), `limitedCalls` (unless disabled), `nonce`.
   - Scope: Monorail aggregator `aggregate`, ERC‑20 `approve`/`transfer`, and WMON `deposit`/`withdraw` when relevant.
3. Requests a root signature through the chosen identity bridge (`signDelegation`).
4. Optionally redeploys the HybridDelegator using Pimlico sponsorship if it does not exist yet.

## 6. Artifact Storage

Artifacts are written to:

```
~/.pragma/test-delegations/<delegator>/delegation-4337-<timestamp>.json
```

Each file contains:

- The signed delegation blob (authority → session key).
- Session key address and private key (encrypted only if you wrap storage yourself).
- Mode metadata, TTL, call limit, optional per-token/native caps.
- Cached Monorail allowlist with decimals for swap validation.

Use `pragma delegation:list` to view stored artifacts, EXP/TLL, remaining call count, and signature diagnostics.

## 7. Funding & Maintenance

- **Initial funding:** `pragma fund` prints the HybridDelegator address and watches for incoming MON. `pragma fund:faucet` sends MON/WMON from `PRAGMA_ADMIN_TEST_PK` (dev only).
- **Revoke all:** `pragma revoke` bumps the DTK nonce (and optionally calls `disableDelegation`). Every prior session key becomes unusable.
- **Token updates:** `pragma delegation:update-tokens` re-enters the onboarding prompts for an existing delegator so you can append allowlist entries without hand-editing JSON.
- **Session rotation:** `pragma replace` rotates the session key and issues a fresh delegation in one flow.

With an artifact in place, you can start [swapping](../flows/swap.md), [wrapping](../flows/wrap-unwrap.md), or [transferring assets](../flows/transfer.md).
