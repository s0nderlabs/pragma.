---
title: Wrap & Unwrap MON
---

# Wrap & Unwrap MON

Wrapping converts native MON held by the HybridDelegator into WMON; unwrapping does the inverse. Both flows redeem the same delegation used for swaps and run entirely through MetaMask’s Delegation Toolkit.

## Requirements

- Delegation must include both native MON (`kind: "native"`) and wrapped MON (`kind: "wrappedNative"`) in its allowlist.  
  - When onboarding in Safe mode, select MON *and* WMON as the two tokens if you plan to wrap/unwrap.  
  - In Normal mode, append WMON to the allowlist before signing if it is not already present.
- Delegation must be active (`expiresAt` in the future).

## CLI Commands

```bash
pragma wrap --amount 0.5 [--artifact <path>] [--delegator <addr>]
pragma unwrap --amount 0.25 [--artifact <path>] [--delegator <addr>]
```

- Amounts are decimal MON / WMON values (`parseUnits` with 18 decimals).
- Commands auto-select the latest active swap delegation unless you pass `--artifact`.
- Errors include:  
  - “Delegation must include both native MON and wrapped MON tokens…” (`wrap.ts`).  
  - `Delegation stored at … has expired. Reissue before wrapping.` (thrown in `wrapNativeWithSession`).  
  - `HybridDelegator … has insufficient balance` (when the MON/WMON balance is too low).

## Execution Flow (`@pragma/core/execution/swap.ts`)

1. Validate amount (`AMOUNT_MALFORMED` if ≤ 0).  
2. Confirm the delegation is still valid (`SIM_PREVIEW_EXPIRED` if TTL elapsed).  
3. Fetch balances via HyperRPC with a direct RPC fallback (`callWithRpcFallback`).  
4. Build a single execution targeting the WMON contract:  
   - Wrap: `deposit()` with `value = amount`.  
   - Unwrap: `withdraw(amount)`.  
5. Redeem delegations with `ExecutionMode.SingleDefault`.  
6. Await the receipt and emit a success log such as  
   ```
   Wrapped 0.5 MON -> 0.5 WMON (tx: 0x…, block: 12345678)
   ```

### Caps and Counters

Wrap/unwrap calls do not modify per-token/native caps automatically. Caps are only applied to swap flows. Delegation TTL, limited-calls, and nonce caveats still run during `validateUserOp`.

## Web App

The web app exposes "Wrap MON" and "Unwrap WMON" quick actions. They call the same helpers (`apps/web/src/lib/chat/wrap.ts`), sharing preview logs and error messages with the CLI.

## Troubleshooting

| Error | Cause | Fix |
| --- | --- | --- |
| `Delegation must include [token]` | Allowlist missing MON or WMON. | Re-issue the delegation with both tokens. |
| `Delegation expired` | TTL from onboarding elapsed. | Run `pragma delegation:issue` or re-onboard. |
| `SIM_BALANCE_TOO_LOW` | HybridDelegator lacks MON/WMON balance. | Fund the account or unwrap/wrap a smaller amount. |

After wrapping/unwrapping, you can confirm balances with `pragma status` or by reading receipts in `~/.pragma/receipts/…`.
