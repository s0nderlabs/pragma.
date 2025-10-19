---
title: Delegated Transfers
---

# Delegated Transfers

Transfers let you move native MON or allowlisted ERC‑20 tokens from the HybridDelegator without issuing a new delegation. Both flows reuse the session key and DTK validation stack.

## Commands

```bash
pragma transfer:mon [--amount <mon>] [--recipient <0x…>] [--delegator <0x…>]
pragma transfer:token [--token <symbol|0x…>] [--amount <value>] [--recipient <0x…>] [--delegator <0x…>]
```

- Amount prompts default to `0.01` MON or the ERC‑20’s decimals when omitted.
- Recipients can be provided up front or selected interactively.
- Fixture mode (`PRAGMA_REPL_FIXTURE=1`) prints deterministic outputs instead of hitting the network.

## Validation Steps (`@pragma/core/execution/transfer.ts`)

1. **Delegation active & secret present** (`ensureSessionActive`). Expired delegations or missing session key secrets raise `SIM_PREVIEW_EXPIRED` / `SESSION_KEY_INVALID`.
2. **Scope checks**  
   - Native transfers ensure `amount > 0` and honor `session.transferMaxAmount` when set, emitting `AMOUNT_EXCEEDS_CAP` otherwise.  
   - Token transfers verify the asset appears in `session.allowedTokens`. Attempting to transfer MON via the token command throws `POLICY_CONFLICT`.
3. **Balance checks**  
   - Native: `publicClient.getBalance(hybridDelegator)` via HyperRPC fallback.  
   - Tokens: `ERC20.balanceOf`. Insufficient balance raises `SIM_BALANCE_TOO_LOW`.
4. **Execution**  
   - Native: builds a zero-calldata execution that forwards `value` directly to the recipient.  
   - Token: calls `ERC20.transfer` with `ExecutionMode.SingleDefault`.  
   - Both paths redeem the same delegation blob with `redeemDelegations` and wait for the receipt.
5. **Logging**  
   - Success logs resemble `Transferred 0.05 MON to 0x… (tx: 0x…, block: …)`.  
   - Errors map directly to the canonical error catalog.

## Token Selection Helpers

`pragma transfer:token` loads the current swap delegation (`loadSwapSession`) and:

- Highlights expiry or signature issues before proceeding.
- Suggests an asset picker when multiple tokens are available.
- Formats balances with `viem`’s `formatUnits` so you can verify the delegator balance before confirming.

## Caps & Limits

- `session.transferMaxAmount` (if provided) caps individual native transfers. Update it when reissuing a delegation.
- ERC‑20 transfers do *not* decrement the swap cap fields (`perTokenCapsWei`); they are tracked independently.
- TTL, limited-calls, and nonce caveats still execute at `validateUserOp`.

## Web App

The web app exposes "Send MON" and "Send token" intents. The backend uses the same helpers (`apps/web/src/lib/chat/transfer.ts`), so behavior and errors mirror the CLI.

## Troubleshooting

| Error | Cause | Fix |
| --- | --- | --- |
| `Delegation stored at … has expired` | TTL elapsed. | Re-issue the delegation (`pragma delegation:issue`). |
| `Token … is not included in this delegation scope` | Asset missing from allowlist. | Update tokens via `pragma delegation:update-tokens`. |
| `AMOUNT_EXCEEDS_CAP` | Amount exceeds native transfer cap. | Transfer a smaller amount or reissue with a higher cap. |
| `SIM_BALANCE_TOO_LOW` | HybridDelegator balance insufficient. | Fund the delegator or transfer a smaller amount. |

Receipts for token/natively delegated transfers will appear in the same `~/.pragma/receipts/<delegator>/` directory with type `swap` only when a swap is executed. Transfers rely on CLI console logs today; extend `apps/cli/src/services/receiptStore.ts` if you need persisted transfer receipts.
