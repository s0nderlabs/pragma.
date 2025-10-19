---
title: Troubleshooting
---

# Troubleshooting

This section aggregates frequent issues reported by users and the corresponding remediation steps. Error codes refer to the canonical list in [`system-layers/errors.md`](../system-layers/errors.md).

## Missing Configuration

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Missing environment variable: WEB3AUTH_CLIENT_ID` (or similar) | Required secrets not loaded before starting the CLI/web app. | Populate the variable in `.env` or your shell session. |
| `CONFIG_MISSING: Monorail app id is required to request quotes.` | `MONORAIL_APP_ID` absent. | Set `MONORAIL_APP_ID` (and optionally `MONORAIL_API_KEY`). |
| `Admin fallback not configured` (on `/api/onboarding/deploy`) | `PRAGMA_ADMIN_TEST_PK` missing. | Provide a funding key for fallback deployments. |

## Onboarding

| Symptom | Cause | Fix |
| --- | --- | --- |
| Web3Auth window opens but onboarding exits with `ONBOARD_AUTH_FAILED` | Identity provider denied the login (cancelled, misconfigured). | Re-run onboarding and complete the Web3Auth flow; check provider dashboard for allowed origins. |
| CLI warns `Delegation allowlist returned no tokens` | Monorail Data API temporarily unavailable. | Retry after a short delay; wrapping falls back to MON/WMON but swaps need actual allowlist data. |
| `ONBOARD_DEPLOY_FAILED` | Pimlico bundler rejected the CREATE2 deployment or the factory reverted. | Ensure the HybridDelegator address is not already deployed with incompatible owner; verify Pimlico credentials. |
| `ONBOARD_FUNDING_REQUIRED` after onboarding | HybridDelegator balance too low for future UserOps. | Use `pragma fund` or `pragma fund:faucet` to top up MON. |

## Swaps

| Symptom | Cause | Fix |
| --- | --- | --- |
| `TOKEN_OUT_OF_SCOPE` | Token not in the delegation allowlist. | Run `pragma delegation:update-tokens` and reissue the delegation. |
| `SIM_POLICY_CAP_EXCEEDED` | Per-token or native cap exhausted. | Reissue the delegation with refreshed caps or reduce swap size. |
| `SIM_MIN_OUT_NOT_MET` | Price moved beyond slippage tolerance. | Increase slippage (within mode limits) or fetch a new quote. |
| `EXEC_CAVEAT_RATE_LIMIT` | `limitedCalls` cap reached. | Reissue the delegation or wait for TTL to expire and re-onboard. |
| Repeated `QUOTE_RPC_ERROR` | Pathfinder unreachable or API key invalid. | Check `MONORAIL_PATHFINDER_URL`, `MONORAIL_APP_ID`, and network connectivity. |

## Wrap / Transfer

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Delegation must include both native MON and wrapped MON tokens` | Allowlist missing one of the assets. | Reissue delegation with MON and WMON selected. |
| `Delegation expired` when wrapping/transferring | `expiresAt` passed. | Re-run onboarding or issue a fresh delegation. |
| `SIM_BALANCE_TOO_LOW` | HybridDelegator lacks balance. | Fund the account or unwrap/wrap a smaller amount. |
| `AMOUNT_EXCEEDS_CAP` (native transfer) | `transferMaxAmount` cap in the delegation artifact. | Reissue with a higher cap or transfer less. |

## Receipts & Logs

| Symptom | Cause | Fix |
| --- | --- | --- |
| Receipt missing despite successful swap | Swap did not reach execution (preview only). | Ensure the plan executed successfully and check stderr for errors. |
| `RECEIPT_PLAN_HASH_MISMATCH` | Execution calldata differed from preview plan. | Re-run the swap from scratch; plan hash should remain stable. |
| No live updates in REPL | HyperSync disabled or fixture mode active. | Check `PRAGMA_DISABLE_HYPERSYNC`, `NEXT_PUBLIC_PRAGMA_DISABLE_HYPERSYNC`, and `PRAGMA_REPL_FIXTURE`. |

## General Tips

- Use `pragma status` to confirm delegation TTL, remaining calls, and balances.
- `pragma delegation:list` surfaces signature diagnostics (invalid signatures often point to mismatched owner accounts).
- Toggle telemetry (`PRAGMA_AGENT_LOG=1`) to capture detailed JSON logs when investigating complex errors.
- Fixture mode (`PRAGMA_REPL_FIXTURE=1`) is great for smoke tests but will not hit live RPCs; disable it for real swaps.

Still stuck? Inspect the raw delegation artifact and receipt files— they contain every field used by the pipeline and often point directly to the missing configuration or policy violation.
