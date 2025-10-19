---
title: Simulation & Preview
---

# Simulation & Preview

Simulation ensures a quoted plan is still valid with live chain data before spending gas. The logic lives in `packages/core/src/execution/swap.ts` (`previewSwapWithSession`).

## Inputs

- Session metadata: `SessionDelegationInfo` (expiresAt, per-token/native caps, call limits).  
- Quote metadata: `MonorailQuote` (expected output, calldata, min output).  
- Intent fields: amount (`exact`, `fraction`, `max`), slippage, deadline.

## Steps

1. **Resolve the swap amount**  
   - `exact` → convert to wei immediately (`parseUnits`).  
   - `fraction`/`max` → fetch the HybridDelegator’s balance (native or ERC‑20) using HyperRPC with a direct RPC fallback (`callWithRpcFallback`).  
   - Clamp the resolved amount against off-chain caps via `verifyTokenCaps`.

2. **Construct the calldata**  
   - Wraps Monorail’s `transactionData` and `transactionValue` into an execution request.  
   - No adjustments are made to the route; the simulation checks the plan as-is.

3. **Run `eth_call`**  
   - Invokes the HybridDelegator contract with the prepared calldata and `minAmountOut`.  
   - Uses HyperRPC (Envio) by default; falls back to `MONAD_EXECUTION_RPC_URL` if necessary.  
   - Any revert surfaces a canonical error such as `SIM_ROUTE_REVERT` or `SIM_RPC_ERROR`.

4. **Validate invariants**  
   - `simulated_out ≥ minAmountOut` → else emit `SIM_MIN_OUT_NOT_MET`.  
   - TTL and delegation expiry → `SIM_PREVIEW_EXPIRED` if the session is stale.  
   - Deadline clamp → ensures a minimum 60 seconds and maximum of 900/1800 seconds depending on mode.

5. **Produce the preview record**  
   - Contains resolved `amountIn`, `expectedAmountOut`, `minAmountOut`, `valueForSwap`, `gasEstimate`, warnings, and `plan_hash`.
   - CLI prints a human-readable summary; the REPL/web app present a preview card for confirmation.

## Preview Expiry

Previews expire implicitly when:

- Delegation TTL passes.  
- `plan_hash` no longer matches (e.g., new quote fetched).  
- The CLI tracks `previewId` with ~90s validity; changed inputs force a re-simulation.

## Error Codes

| Code | Meaning |
| --- | --- |
| `SIM_BALANCE_TOO_LOW` | Delegator lacks sufficient balance for resolved amount. |
| `SIM_POLICY_CAP_EXCEEDED` | Amount exceeds remaining per-token/native cap. |
| `SIM_RPC_ERROR` | Underlying RPC failure during `eth_call`. |
| `SIM_ROUTE_REVERT` | Aggregator route reverted during simulation. |
| `SIM_MIN_OUT_NOT_MET` | Simulated output below tolerance-adjusted `minAmountOut`. |
| `SIM_PREVIEW_EXPIRED` | Delegation expired before execution. |

All errors bubble up to the CLI/web surfaces and prevent execution.
