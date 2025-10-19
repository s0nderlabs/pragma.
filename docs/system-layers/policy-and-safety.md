---
title: Policy & Safety
---

# Policy & Safety

Pragma enforces guardrails through a combination of DTK caveats (on-chain) and off-chain clamps (intent parsing, balance checks, cap tracking). The policy layer determines how Safe and Normal delegations behave and how session keys can be revoked.

## Delegation Modes

Mode metadata is produced during onboarding (`apps/cli/src/services/onboarding4337.ts`) and saved in each delegation artifact.

| Property | Safe | Normal |
| --- | --- | --- |
| Token scope | Exactly two tokens selected during onboarding (pair locked) | Starts with the curated Monorail allowlist; operators can append more tokens before signing |
| TTL (`timestamp` caveat) | 1 hour | 24 hours |
| Default call limit (`limitedCalls` caveat) | 6 redemptions | 12 redemptions |
| Slippage clamp | ≤ 25 bps | ≤ 50 bps |
| Deadline clamp | ≤ 900 s | ≤ 1800 s |
| Token caps | Optional (stored off-chain as `perTokenCapsWei` and `nativeTokenCapWei`) | Same |

Values come from `DEFAULT_CALL_LIMITS`, `buildHybridCaveats`, and onboarding prompts.

## Caveats & Scope

`buildHybridScope` collects all allowed contract targets:

- Monorail aggregator selector: `aggregate`.
- ERC‑20 `approve` / `transfer`.
- WMON `deposit` / `withdraw` when either token is MON/WMON.

`buildHybridCaveats` attaches:

- `timestamp`: TTL clamped to Safe/Normal defaults.  
- `nonce`: session revocation, managed via `pragma revoke`.  
- `limitedCalls`: optional depending on `--calls` / `--unlimited-calls`.

Per-token/native caps are persisted in the artifact for off-chain enforcement (`verifyTokenCaps`). They are not injected as DTK caveats because the Monorail aggregator does not expose simple amount slots to pin safely.

## Safe vs Normal Guardrails

- **Safe mode** forces explicit pair selection. The CLI warns if the allowlist contains fewer than two tokens because swaps would not be possible. Any attempt to swap a non-selected asset is blocked by the intent parser (`TOKEN_OUT_OF_SCOPE`).  
- **Normal mode** carries a curated allowlist from Monorail’s Data API. The CLI allows adding custom addresses, and the delegation must be reissued whenever new tokens are appended.

## Caps & Decrementing

`executeSwapWithSession` loads cap metadata from the artifact, applies it during simulation (`verifyTokenCaps`), and decrements the remaining allowance on success (`persistSwapSessionCaps`). Caps are keyed by lowercased token address and stored as wei strings.

Native/WMON wrap & transfer flows honor `session.transferMaxAmount` when supplied.

## Revocation & Rotation

- **Nonce bump (`pragma revoke`)** → increments the DTK `NonceEnforcer` slot, instantly invalidating all existing delegations.  
- **Session rotation (`pragma replace`)** → generates a new session key pair, updates the artifact, and reissues the delegation.  
- **TTL expiry** → the intent engine and execution layer reject actions with `SIM_PREVIEW_EXPIRED` once `expiresAt` passes.

## Quick Mode

Quick mode (CLI agent/web app) allows pre-approved actions to be executed without a confirmation prompt. It only kicks in when:

- Intent parsing succeeds with no clarifications or policy warnings.  
- Delegation mode permits auto-confirmation (Safe always requires a confirmation after preview).  
- `PRAGMA_AGENT_QUICK_MODE=1` or the user toggles quick mode in the UI.

Quick mode never bypasses DTK caveats; it simply suppresses the interactive confirm step.

## Helpful Commands

- `pragma status` – shows delegation summary, TTL, call counters.  
- `pragma delegation:list` – prints per-artifact metadata including remaining calls and signature diagnostics.  
- `pragma delegation:update-tokens` – reissues the delegation with updated allowlists.  
- `pragma fund` – prints the HybridDelegator address and balance so you can keep native caps satisfied.

Policy decisions live entirely in the delegation artifact, making it easy to reason about the session key’s capabilities by inspecting the JSON file.
