---
title: Glossary
---

# Glossary

- **HybridDelegator**  
  MetaMask DTK smart account deployed via ERC‑4337. Holds balances, redeems delegations, and executes swaps.

- **Delegation / Session Key**  
  Signed DTK blob granting limited authority to a session key. Stored in `~/.pragma/test-delegations/…` along with the session key secret. Session key revocation is handled through nonce bumps.

- **Safe Mode**  
  Pair-scoped delegation with 1 h TTL, 6-call limit, and 25 bps slippage clamp. Best for cautious workflows.

- **Normal Mode**  
  Allowlist-based delegation with 24 h TTL, 12-call limit, and 50 bps slippage clamp. Suitable for power users.

- **Monorail Pathfinder**  
  Aggregator API used for routing and calldata generation. Requires `MONORAIL_APP_ID`.

- **plan_hash**  
  `keccak256` hash of chain, tokens, amounts, slippage, deadline, quote/previews IDs. Used to tie preview, execution, and receipt together.

- **Preview**  
  Result of `eth_call` simulation that validates balances, caps, and min-out. A preview must exist before the swap is executed.

- **Receipt**  
  JSON + human summary stored on disk describing the plan, outcome, and relevant hashes. Helps reconcile actions with on-chain explorers.

- **Quick Mode**  
  Optional shortcut that auto-confirms previewed swaps when policy conditions permit. Toggle via REPL meta commands or chat settings.

- **HyperRPC / HyperSync**  
  Envio services providing high-performance reads (`HyperRPC`) and event streaming (`HyperSync`). Both are optional but enabled by default.

- **Pimlico**  
  Bundler/paymaster provider used during onboarding to sponsor CREATE2 deployment. Regular swaps operate without the paymaster once the HybridDelegator is funded.

- **Delegation Cap**  
  Off-chain tracking of per-token/native allowances stored in the delegation artifact (`perTokenCapsWei`, `nativeTokenCapWei`). Enforced in simulation and decremented after successful swaps.

- **Nonce Bump**  
  `DelegationManager.incrementNonce`. Invalidates every existing delegation for a delegator. Exposed via `pragma revoke`.
