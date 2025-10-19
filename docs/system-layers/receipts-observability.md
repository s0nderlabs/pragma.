---
title: Receipts & Observability
---

# Receipts & Observability

Every plan produces human-readable output and machine-readable records. Observability is designed to be stateless: logs are streamed to stdout, receipts are stored on disk, and optional HyperSync subscriptions provide live updates.

## Receipts

Implementation: `apps/cli/src/services/receiptStore.ts`.

- **Location**: `~/.pragma/receipts/<delegator>/swap-<timestamp>-<qualifier>.json` (override via `PRAGMA_RECEIPT_DIR`).  
- **Schema** (`SwapReceiptRecord`):  
  - `status`: `success` or `failed`.  
  - `mode`, `delegator`, `sessionKey`, `chainId`.  
  - `tokenIn` / `tokenOut` metadata (address, symbol, decimals).  
  - `amountInWei`, `amountOutWei`, `minAmountOutWei`.  
  - `slippageBps`, `deadlineSeconds`, `quoteId`, `planHash`.  
  - `txHash`, `blockNumber`, `gasUsedWei`.  
  - `createdAt`, `previewedAt`, `executedAt`, and `summary` text.  
  - `error`: serialized error context when a plan fails.

CLI helpers:

```bash
pragma receipts [--delegator <addr>]  # list recent receipts
```

`listReceipts` sorts by most recent `createdAt`. `findReceiptByTxHash` lets you locate a record by hash.

## Observability Events

| Phase | Event examples | Source |
| --- | --- | --- |
| Parse | `parse_ok`, `parse_clarify`, `parse_reject` | Intent engine result |
| Route | `route_quoted`, `route_error` | Monorail quote success/failure |
| Simulation | `sim_passed`, `sim_failed`, `cap_exceeded` | Preview stage |
| Preview | `preview_shown`, `preview_skipped`, `preview_forced` | User confirmation logic |
| Execution | `exec_success`, `exec_revert`, `bundler_reject` | Swap outcome |
| Receipt | `receipt_written`, `receipt_error` | Persistence status |

Logs are keyed by `plan_hash` so you can trace an action end-to-end. Toggle structured telemetry via `PRAGMA_AGENT_LOG=1` or `PRAGMA_AGENT_DEBUG=1` (`apps/cli/src/services/agentTelemetry.ts`).

## HyperSync & Live Observers

- `apps/cli/src/services/liveObservers.ts` subscribes to HyperSync (if configured) for Monorail swaps, DelegationManager events, and ERC‑20 transfers.  
- Set `NEXT_PUBLIC_PRAGMA_DISABLE_HYPERSYNC=1` (web) or `PRAGMA_DISABLE_HYPERSYNC=1` (CLI) to disable subscriptions.  
- Fixture runs (`PRAGMA_REPL_FIXTURE=1`) skip observers entirely.

## Quick Mode Metrics

Quick mode toggles are tracked per session (`quick-mode.ts`). When enabled, successful swaps bypass the confirmation step but still produce previews and receipts. Disabling quick mode mid-session reverts to the manual confirm flow.

## Troubleshooting Logs

- **Missing receipt file** → ensure the swap reached execution; previews alone do not produce receipts.  
- **No logs when running tests** → fixture mode suppresses live observers and replaces on-chain calls with deterministic outputs.  
- **Telemetry spam** → set `PRAGMA_AGENT_LOG_LEVEL=warn` or unset `PRAGMA_AGENT_LOG`.

Receipts are the canonical source of truth for user-facing history. Use plan hash + tx hash to reconcile with on-chain explorers or downstream dashboards.
