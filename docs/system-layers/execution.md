---
title: Execution
---

# Execution

Execution consumes the previewed plan, builds a UserOperation (when necessary), redeems the delegation, and waits for confirmation. Implementation details live in `packages/core/src/execution/swap.ts`, `wrap.ts`, and `transfer.ts`.

## Session Wallets

`createSessionWallet` (`@pragma/core`) wraps the stored session key and points it at the HybridDelegator’s `DelegationManager`. The CLI/web provide:

- `publicClient` → HyperRPC (`MONAD_ENVIO_READ_RPC_URL`) for fast reads.  
- `fallbackPublicClient` → standard RPC (`MONAD_EXECUTION_RPC_URL`).  
- `sessionWalletFactory` → constructs a wallet using the session key private key and `monadChain` metadata.

## Swap Execution

1. **Allowance check** (`ensureAllowance`)  
   - Reads ERC‑20 allowances for the Monorail aggregator.  
   - If insufficient, submits a delegated `approve` before the swap. Approval strategy defaults to `wait` but can be overridden (Fire-and-forget) via `SwapExecutionConfig.approvalStrategy`.

2. **Execution struct**  
   - Calldata comes directly from Monorail (`transactionData`, `transactionValue`).  
   - Delegation Manager call:  
     ```ts
     redeemDelegations(
       sessionWallet,
       client,
       environment.DelegationManager,
       [{
         permissionContext: [session.delegation],
         executions: [execution],
         mode: ExecutionMode.SingleDefault,
       }],
     );
     ```
   - `ExecutionMode.SingleDefault` ensures the swap reverts if any step (approval/swap) fails.

3. **Receipt handling**  
   - Waits for the transaction receipt using HyperRPC with fallback.  
   - Captures gas (`receipt.gasUsed`) and block number.  
   - Updates per-token/native caps (`persistSwapSessionCaps`) and logs success via `ExecutionLogger`.

4. **Result**  
   - Returns `SwapResult` containing `txHash`, `amountIn`, `amountOut`, `minAmountOut`, `quoteId`, `slippageToleranceBps`, `blockNumber`, and `gasUsed`.

## Wrap / Unwrap

Wrapping calls the WMON contract directly (no router):

- Wrap: send MON as `value`, call `deposit()`.  
- Unwrap: call `withdraw(amount)` and wait for the receipt.  
- Errors include `AMOUNT_MALFORMED`, `SIM_PREVIEW_EXPIRED`, and `SIM_BALANCE_TOO_LOW`.

## Transfers

Native and token transfers follow a similar pattern:

- Native: create an execution where `target = recipient`, `value = amount`, `callData = 0x`.  
- Token: call `ERC20.transfer(recipient, amount)` after confirming the token is on the allowlist.  
- Caps (`session.transferMaxAmount`) and balances are enforced before execution.

## Bundlers & Sponsorship

- **Onboarding deployment**: Pimlico’s bundler/paymaster handles CREATE2 deployment (see `apps/cli/src/services/onboarding4337.ts`).  
- **Regular operations**: Swaps, wraps, and transfers run as direct `redeemDelegations` calls signed by the session wallet; Pimlico is not required post-onboarding unless you configure alternative transport.

## Error Codes

Execution-specific codes originate in `@pragma/core/errors`:

| Code | Meaning |
| --- | --- |
| `EXEC_DELEGATION_REDEEM_REVERT` | `redeemDelegations` reverted. |
| `EXEC_CAVEAT_SCOPE_REJECT` | Delegation scope blocked the call. |
| `EXEC_CAVEAT_TTL_EXPIRED` / `EXEC_CAVEAT_RATE_LIMIT` / `EXEC_CAVEAT_NONCE_REJECT` | DTK caveats failed validation. |
| `EXEC_ROUTER_REVERT` | Monorail aggregator reverted during execution. |
| `EXEC_DUPLICATE_NONCE` | Session nonce already used. |
| `EXEC_BUNDLER_SUBMIT_FAILED`, `EXEC_PAYMASTER_REJECT` | Bundler/paymaster errors (mainly surfaced during onboarding). |

These codes are bubbled to the CLI/web surfaces for troubleshooting and mapping to user-facing copy.
