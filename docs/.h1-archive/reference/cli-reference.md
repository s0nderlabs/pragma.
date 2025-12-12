---
title: CLI Command Reference
---

# CLI Command Reference

The tables below summarize the end-user commands registered in `apps/cli/src/index.ts`. Commands marked as “dev” are intended for internal testing and are excluded here.

## Onboarding & Session Management

| Command | Description |
| --- | --- |
| `onboard:4337 [options]` | Deploy a HybridDelegator, generate a session key, and sign a Safe/Normal delegation. Options: `--mode safe|normal`, `--calls <n>`, `--unlimited-calls`. |
| `onboard:7702` | Prints a notice that 7702 onboarding is postponed for H1. |
| `status [--delegator <addr>]` | Show HybridDelegator balance, active delegation TTL, remaining calls. |
| `fund [--delegator <addr>]` | Display funding instructions and an optional balance watcher. |
| `fund:faucet [--delegator <addr>]` | Send MON/WMON from `PRAGMA_ADMIN_TEST_PK` (dev helper). |
| `delegation:list` | Enumerate stored delegation artifacts with expiry, allowlist, and signature diagnostics. |
| `delegation:issue` | Re-run the 4337 signing flow for the selected delegator. |
| `delegation:update-tokens` | Append allowlisted tokens and reissue the delegation. |
| `delegation:prune-tokens` | Remove allowlisted tokens and reissue the delegation. |
| `delegation:revoke [--also-disable]` | Increment the DTK nonce (full revoke) and optionally disable the delegation. |
| `replace [--delegator <addr>]` | Rotate the session key and reissue the delegation in one step. |

## Swaps & Quotes

| Command | Description |
| --- | --- |
| `swap --amount <value> --from <token> --to <token> [options]` | Execute a delegated swap using Monorail Pathfinder. Options: `--slippage-bps <bps>`, `--artifact`, `--delegator`. |
| `swap:preview [options]` | Fetch a live Monorail quote and print the preview without executing. |
| `receipts [--delegator <addr>]` | List recent swap receipts stored on disk. |

## Wrap / Unwrap / Transfer

| Command | Description |
| --- | --- |
| `wrap --amount <mon>` | Wrap native MON into WMON using the session delegation. |
| `unwrap --amount <wmon>` | Unwrap WMON back into MON. |
| `transfer:mon [--amount <mon>] [--recipient <addr>]` | Transfer MON from the HybridDelegator via the session key. |
| `transfer:token [--token <symbol|addr>] [--amount <value>] [--recipient <addr>]` | Transfer an allowlisted ERC‑20 token. |

## Miscellaneous

| Command | Description |
| --- | --- |
| `balance [--delegator <addr>]` | Print MON/WMON balances tracked in the CLI session store. |
| `revoke` | Alias for `delegation:revoke`. |
| `dev …` | Development playground commands (see `apps/cli/src/commands/dev.ts`); not part of the user-facing interface. |

### Options Shared Across Commands

| Option | Applies to | Meaning |
| --- | --- | --- |
| `--delegator <addr>` | Most commands | Select a specific HybridDelegator when multiple artifacts exist. |
| `--artifact <path>` | Swap/wrap/unwrap | Point directly to a delegation artifact JSON file. |

### Environment Toggles

| Variable | Effect |
| --- | --- |
| `PRAGMA_REPL_FIXTURE=1` | Run commands in fixture mode (no on-chain calls). |
| `PRAGMA_AGENT_LOG=1`, `PRAGMA_AGENT_DEBUG=1`, `PRAGMA_AGENT_LOG_LEVEL=<level>` | Emit structured agent telemetry for debugging. |
| `PRAGMA_AGENT_SKIP_ONBOARD=1` | Prevent the REPL from auto-onboarding when no delegation exists. |
| `PRAGMA_AGENT_QUICK_MODE=1` | Start the REPL with quick mode enabled. |

Refer to [`docs/getting-started/cli.md`](../getting-started/cli.md) for usage tips and [`docs/flows/swap.md`](../flows/swap.md) for the execution lifecycle behind these commands.
