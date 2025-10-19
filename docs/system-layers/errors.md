---
title: Error Catalog
---

# Error Catalog (User-Facing Summary)

Pragma surfaces canonical error objects defined in `@pragma/core/errors/index.ts`. Each error contains:

```json
{
  "code": "SIM_MIN_OUT_NOT_MET",
  "class": "Drift",
  "module": "Simulation",
  "severity": "error",
  "retriable": true,
  "message": "Simulated output below minOut bound",
  "context": { ... }
}
```

Below is a user-facing summary of the most common codes grouped by class/module. Refer to the CLI/web surfaces for exact copy mapping.

## Intent & Policy

| Code | Meaning | Typical Fix |
| --- | --- | --- |
| `ACTION_UNSUPPORTED` | Verb other than `swap` detected. | Rephrase the request. |
| `ACTION_MALFORMED` | Parser could not isolate the action. | Provide a full sentence (“swap 0.1 MON to USDC”). |
| `TOKEN_UNRESOLVED` | Symbol/address not recognized. | Use a full hex address or an allowlisted symbol. |
| `TOKEN_OUT_OF_SCOPE` | Token not covered by the delegation. | Reissue the delegation with the desired asset. |
| `PAIR_REQUIRED_SAFE_MODE` | Safe mode requires both tokens specified. | Provide both `from` and `to` assets. |
| `SAME_TOKEN_PAIR` | Identical token_in/token_out. | Swap between different assets. |
| `AMOUNT_MISSING` | Amount absent and clarification disabled. | Provide an amount or respond to the prompt. |
| `AMOUNT_MALFORMED` | Non-numeric or negative amount. | Enter a valid decimal/fraction. |
| `AMOUNT_EXCEEDS_CAP` | Off-chain native cap exceeded. | Reduce the amount or reissue the delegation with a higher cap. |
| `POLICY_CONFLICT` | Request conflicts with mode rules (e.g., using token transfer command for MON). | Switch commands or adjust the delegation. |
| `SESSION_KEY_INVALID` | Delegation lacks session key metadata or has been revoked. | Re-onboard or rotate the session key. |

## Routing

| Code | Meaning | Typical Fix |
| --- | --- | --- |
| `CONFIG_MISSING` | `MONORAIL_APP_ID` absent. | Set the environment variable and retry. |
| `QUOTE_NO_ROUTE` | Monorail could not build a route. | Try a different pair or lower amount. |
| `QUOTE_RPC_ERROR` | Pathfinder request failed. | Retry; check network connectivity and API key. |
| `QUOTE_STALE` | Cached quote exceeded its TTL. | Refresh the quote before executing. |

## Simulation

| Code | Meaning | Typical Fix |
| --- | --- | --- |
| `SIM_POLICY_CAP_EXCEEDED` | Per-token/native cap exceeded. | Reduce amount or reissue with updated caps. |
| `SIM_BALANCE_TOO_LOW` | HybridDelegator balance insufficient. | Fund the delegator or wrap/unlock more tokens. |
| `SIM_ALLOWANCE_TOO_LOW` | ERC‑20 allowance missing. | Allow the CLI to send the approval or approve manually. |
| `SIM_RPC_ERROR` | `eth_call` failed due to RPC issues. | Retry with a healthy RPC. |
| `SIM_ROUTE_REVERT` | Aggregator reverted during `eth_call`. | Refresh the quote or inspect route details. |
| `SIM_MIN_OUT_NOT_MET` | Output below tolerance-adjusted minimum. | Increase slippage (within mode limits) or wait for better prices. |
| `SIM_PREVIEW_EXPIRED` | Delegation expired mid-preview. | Re-issue before attempting again. |
| `SIM_DEADLINE_EXPIRED` | Deadline exceeded before execution. | Rebuild the plan with a fresh deadline. |

## Drift

| Code | Meaning | Typical Fix |
| --- | --- | --- |
| `DRIFT_PREVIEW_EXPIRED` | Preview ID expired (plan hash mismatch). | Regenerate preview. |
| `DRIFT_QUOTE_STALE` | Quote changed between preview and execution. | Fetch a new quote. |
| `RECEIPT_PLAN_HASH_MISMATCH` | Execution plan differs from preview. | Investigate before retrying; plan hash should match. |

## Execution

| Code | Meaning | Typical Fix |
| --- | --- | --- |
| `EXEC_CAVEAT_TTL_EXPIRED` / `EXEC_CAVEAT_RATE_LIMIT` / `EXEC_CAVEAT_NONCE_REJECT` | DTK caveats rejected the call (expired, call limit hit, nonce bumped). | Reissue/revoke as appropriate. |
| `EXEC_DELEGATION_REDEEM_REVERT` | Delegation redemption failed. | Inspect context; reissue delegation if corrupted. |
| `EXEC_ROUTER_REVERT` | Monorail aggregator reverted during execution. | Re-simulate and inspect route. |
| `EXEC_ENTRYPOINT_REVERT` | EntryPoint reverted (AA-level failure). | Check bundler logs and account configuration. |
| `EXEC_DUPLICATE_NONCE` | UserOperation nonce reused. | Wait for pending ops or increment nonce. |
| `EXEC_BUNDLER_SUBMIT_FAILED`, `EXEC_PAYMASTER_REJECT` | Bundler/paymaster rejection (usually onboarding). | Verify Pimlico credentials or coverage. |
| `EXEC_TX_DROPPED_OR_STALE`, `EXEC_UNDERPRICED` | Transaction dropped or underpriced. | Resubmit with adequate gas. |

## Onboarding

| Code | Meaning |
| --- | --- |
| `ONBOARD_AUTH_FAILED` | Identity provider failed (Web3Auth). |
| `ONBOARD_DELEGATION_SIGN_REJECTED` | User rejected the EIP‑712 signature. |
| `ONBOARD_DEPLOY_FAILED` | HybridDelegator deployment reverted. |
| `ONBOARD_ENTRYPOINT_NOT_SUPPORTED` | Wrong EntryPoint for the current chain. |
| `ONBOARD_NONCE_BUMP_FAILED` | Delegation revocation transaction failed. |
| `ONBOARD_FUNDING_REQUIRED` | Not enough MON to pay for future UserOperations. |
| `ONBOARD_7702_*` | 7702 flow is deferred in H1; these codes remain for future support. |

## Infra & IO

| Code | Meaning |
| --- | --- |
| `RPC_UNAVAILABLE`, `RPC_RATE_LIMITED`, `TIMEOUT` | Upstream RPC issues. |
| `CONFIG_MISSING` | Required configuration absent (e.g., Monorail app ID). |
| `LOG_WRITE_FAILED`, `METRICS_FLUSH_FAILED` | Local logging/metrics persistence failed. |
| `RECEIPT_BUILD_FAILED`, `RECEIPT_DECODE_FAILED`, `RECEIPT_LOGS_MISSING` | Issues assembling or reading receipts. |

## Handling Errors Programmatically

`createErrorFromCode` (exported by `@pragma/core/errors`) ensures every thrown error conforms to the schema above. Use `assertKnownErrorCode` if you need to guard custom handling logic.

When presenting errors to users, prefer the canonical `message` and offer targeted remediation steps as shown in the tables. Keep the `code` unchanged—automation and telemetry rely on its stability.
