---
title: Swap Flow
---

# Swap Flow

Swaps run through the same pipeline whether they originate from the CLI, the REPL agent, or the web app. The implementation lives in `@pragma/core/execution/swap.ts` and is wired into the CLI via `apps/cli/src/services/swapEngine.ts` and the web via `apps/web/src/lib/chat/swap.ts`.

## Prerequisites

- A valid delegation artifact (Safe or Normal) stored under `~/.pragma/test-delegations/…`.
- Tokens you intend to trade must appear in the artifact’s `allowedTokens` array.
- Optional per-token/native caps (`perTokenCapsWei`, `nativeTokenCapWei`) are persisted off-chain and decremented after each successful swap.

## CLI Usage

```bash
pragma swap \
  --amount 0.1 \
  --from MON \
  --to USDC \
  [--slippage-bps 50] \
  [--artifact /path/to/artifact.json] \
  [--delegator 0xYourHybridDelegator]
```

- `--amount` accepts decimal values. Fractions (e.g., “half”) and `max` are supported in the REPL via the intent engine.
- `--from`/`--to` accept symbols or addresses (case-insensitive).
- `--slippage-bps` overrides the delegation clamp (must still respect the Safe/Normal limit).

If no `--artifact` is supplied, the latest active “swap” artifact for the delegator is loaded. The engine validates that the delegation has not expired, the signature is still valid (ERC‑1271 check), and token metadata includes decimals.

## What Happens Under the Hood

1. **Intent resolution**  
   - CLI: `apps/cli/src/commands/swap.ts` calls `resolveSwapToken` to ensure both tokens are on the allowlist.  
   - REPL/web: the natural-language parser (`@pragma/core/intent/parser.ts`) produces a canonical intent (`SwapIntentFields`) with slippage/deadline clamps.

2. **Quote fetching**  
   - `@pragma/core/monorail/pathfinder.fetchMonorailQuote` hits Monorail Pathfinder using `MONORAIL_APP_ID` and optional `MONORAIL_API_KEY`.  
   - The response is normalized to `MonorailQuote` (bigints retained) and a `plan_hash` is computed from chain ID, tokens, amounts, slippage, deadline, and quote metadata.

3. **Simulation & preview** (`@pragma/core/execution/swap.previewSwapWithSession`)  
   - Resolves the actual input amount:  
     - **Exact:** converts to wei immediately.  
     - **Fraction / max:** queries the HybridDelegator’s balance for `token_in` via `publicClient.getBalance` or `ERC20.balanceOf`.  
   - Applies per-token/native caps (`verifyTokenCaps`).  
   - Runs `eth_call` against the HybridDelegator using HyperRPC, with a direct RPC fallback via `callWithRpcFallback`.  
   - Checks `minAmountOut`, deadline, and delegation expiry.  
   - Returns a preview containing `expectedAmountOut`, `minAmountOut`, `valueForSwap`, and warnings.

4. **Execution** (`@pragma/core/execution/swap.executeSwapWithSession`)  
   - Ensures allowances for ERC‑20 trades, sending a delegated `approve` if needed.  
   - Creates a session wallet from the stored private key and builds an `ExecutionStruct` targeting the Monorail aggregator.  
   - Calls `redeemDelegations` (MetaMask DTK) with `ExecutionMode.SingleDefault`. DTK enforces `timestamp`, `limitedCalls`, `nonce`, and the Hybrid scope selectors.  
   - Waits for the UserOperation receipt, captures gas usage, decrements local caps, and persists them back to the artifact (`persistSwapSessionCaps`).

5. **Receipt & logging**  
   - CLI/web compose an English summary and a structured JSON record (`apps/cli/src/services/receiptStore.ts`).  
   - The record includes `plan_hash`, `quoteId`, `slippageBps`, resolved token metadata, `amountIn`/`amountOut`, and the delegation mode.  
   - Observability hooks emit stage-specific logs (`parse`, `route`, `simulation`, `execution`, `receipt`) keyed by `plan_hash`.

## Common Errors

| Code | Trigger | Resolution |
| --- | --- | --- |
| `TOKEN_OUT_OF_SCOPE` | Token not in delegation allowlist (Safe/Normal). | Update the delegation via `pragma delegation:update-tokens`. |
| `SIM_POLICY_CAP_EXCEEDED` | Request exceeds remaining per-token/native cap tracked in the artifact. | Reissue the delegation with new caps or reduce the amount. |
| `SIM_BALANCE_TOO_LOW` | HybridDelegator lacks required balance or allowance. | Fund the account or approve manually, then retry. |
| `SIM_MIN_OUT_NOT_MET` | Simulation output falls below `minAmountOut`. | Refresh the quote (`pragma swap:preview`) or adjust slippage. |
| `EXEC_CAVEAT_*` | DTK caveat rejected the execution (TTL expired, call limit exhausted, nonce mismatch). | Re-issue/revoke the delegation as needed. |

All codes are defined in `@pragma/core/errors`. See [the error catalog](../system-layers/errors.md) for full context.

## Receipts & Plan Hashes

- Receipts live at `~/.pragma/receipts/<delegator>/swap-<timestamp>-<qualifier>.json`.
- Each record tracks `createdAt`, `previewedAt`, `executedAt`, `plan_hash`, `tx_hash`, `quoteId`, gas usage, and any serialized error context.
- Matching `plan_hash` across preview, execution, and receipt ensures the plan that ran is the one you approved.

## Web & Agent Flow Differences

- The web app streams preview logs and insights, but it submits swaps through the same session wallet abstraction.
- HyperSync (future) can push live swap status updates; currently the client polls using `publicClient.getTransactionReceipt`.
- Quick mode (CLI agent & web app) suppresses the confirmation prompt when Safe/Normal policies allow execution without user intervention.

With swaps understood, continue to [wrap/unwrap](wrap-unwrap.md) or [transfer](transfer.md) assets using the same delegation.
