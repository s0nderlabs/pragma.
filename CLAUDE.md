
# 🤖 AGENTS.md — Pragma H1

This file guides AI agents in contributing to **Pragma H1**.  
Follow tasks sequentially. Always use **official docs** + **frozen baseline** ([docs](./docs/)) as the single source of truth.

---

## 1. Tech Stack

- **Node.js / TypeScript** (pnpm workspaces)
- **Next.js (App Router)** — frontend UI
- **Commander / Chalk / Ora / Inquirer** — CLI interface
- **Viem** ([docs](https://viem.sh/docs/getting-started))
- **Wagmi** ([docs](https://wagmi.sh/react/getting-started))
- **MetaMask Delegation Toolkit (DTK)** ([docs](https://docs.metamask.io/delegation-toolkit))
- **Pimlico** — bundler / paymaster infra
- **Foundry** — contracts + caveats

---

## 2. Build & Dev Commands

Run from **repo root**.

```
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm --filter @pragma/cli dev
```

CLI shortcuts:

```
pragma onboard
pragma swap --from ETH --to USDC --amount 0.5
pragma simulate
pragma receipts
pragma epoch bump
```

For Deterministic Deployment Using CREATE2, refer to this [docs](https://getfoundry.sh/guides/deterministic-deployments-using-create2/)

---

## 3. Project Layout

- `apps/cli` → CLI entrypoint & commands
- `apps/web` → Next.js frontend
- `packages/core` → intent engine, routing, simulation, execution, errors
- `packages/contracts` → solidity caveats + tests
- `packages/utils` → shared TypeScript helpers
- `docs/` → frozen baseline H1 design ([link](./docs/))

---

## 4. Sequential Workflow

### 🔹 Major Points (end-to-end flow)

1. **Onboarding**

   - Docs:
     [onboarding/4337](`./docs/02_System/1_Onboarding/4337.md`)
     [onboarding/7702](`./docs/02_System/1_Onboarding/7702.md`)
   - Covers 4337 HybridDelegator + 7702 StatelessDelegator, nonce bumps, revoke-all
   - Related Tasks: [tasks/core.md](./docs/03_Tasks/CORE.md) (Onboarding section), [tasks/cli.md](./docs/03_Tasks/CLI.md), [tasks/web.md](./docs/03_Tasks/WEB.md)

2. **Intent Engine**

   - Docs:
     [intent_engine/overview](`./docs/02_System/2_Intent_Engine/overview.md`)
     [intent_engine/pipeline](`./docs/02_System/2_Intent_Engine/pipeline.md`)
     [intent_engine/prompts_and_tests](`./docs/02_System/2_Intent_Engine/prompts_and_tests.md`)
     [intent_engine/schema](`./docs/02_System/2_Intent_Engine/schema.md`)
     [intent_engine/overview](`./docs/02_System/2_Intent_Engine/errors.md`)
   - Parse → normalize → canonical intent build
   - Related Tasks: [tasks/core.md](./docs/03_Tasks/CORE.md)

3. **Policy & Safety**

   - Docs:
     [policy_and_safety](`./docs/02_System/3_Policy_&_Safety/policy_and_safety.md`)
   - Allowlist enforcement, Safe vs Normal clamps
   - Related Tasks: [tasks/core.md](./docs/03_Tasks/CORE.md)

4. **Routing & Quotes**

   - Docs:
     [routing_and_quotes](`./docs/02_System/4_Routing_&_Quotes/routing_and_quotes.md`)
   - Uniswap v3 Quoter integration
   - Related Tasks: [tasks/core.md](./docs/03_Tasks/CORE.md)

5. **Simulation & Preview**

   - Docs:
     [simulation_and_preview](`./docs/02_System/5_Simulation_&_Preview/simulation_and_preview.md`)
   - `eth_call` dry-run, caps, TTL, drift rejection
   - Related Tasks: [tasks/core.md](./docs/03_Tasks/CORE.md)

6. **Execution**

   - Docs:
     [execution](`./docs/02_System/6_Execution_Layer/execution.md`)
   - Build UserOperation, attach delegation, enforce caveats
   - Related Tasks: [tasks/core.md](./docs/03_Tasks/CORE.md)
     [tasks/contracts.md](./docs/03_Tasks/CONTRACTS.md)

7. **Receipts & Verification**

   - Docs:
     [receipts_and_verification](`./docs/02_System/7_Receipts_&_Verification/receipts_and_verification.md`)
   - Human-readable + JSON receipts, plan_hash invariant
   - Related Tasks: [tasks/core.md](./docs/03_Tasks/CORE.md), [tasks/web.md](./docs/03_Tasks/WEB.md), [tasks/cli.md](./docs/03_Tasks/CLI.md)

8. **Observability**

   - Docs:
     [observability](`./docs/02_System/8_Observability/observability.md`)
   - Structured logs, counters, plan_hash traceability
   - Related Tasks: [tasks/observability.md](./docs/03_Tasks/OBSERVABILITY.md)

9. **Errors**
   - Docs:
     [errors](`./docs/02_System/9_Error_Handling/errors.md`)
   - Canonical error catalog (Intent / Policy / Simulation / Execution / Infra)
   - Related Tasks: [tasks/core.md](./docs/03_Tasks/CORE.md)

---

### 🔹 Subset View (per package)

- **Core** → [tasks/core.md](./docs/03_Tasks/CORE.md)
- **Contracts** → [tasks/contracts.md](./docs/03_Tasks/CONTRACTS.md)
- **CLI** → [tasks/cli.md](./docs/03_Tasks/CLI.md)
- **Web** → [tasks/web.md](./docs/03_Tasks/WEB.md)
- **Utils** → [tasks/utils.md](./docs/03_Tasks/UTILS.md)
- **Observability** → [tasks/observability.md](./docs/03_Tasks/OBSERVABILITY.md)

---

### 🟪 Monad Integration

- Core Integration → [MONAD_INTEGRATION.md](./docs/H1/MONAD_INTEGRATION.md)
- Docs → [Monad_Docs](./docs/monad/)

---

## 5. Verification

Before merging:

- Run `pnpm test` (unit + integration).
- Run `pnpm lint && pnpm typecheck`.
- For web: `pnpm --filter @pragma/web build` (must succeed).
- Confirm diffs are **confined to correct package**.
- Verify against frozen baseline (`docs/`) — no spec drift.

---

<!-- FAST-TOOLS PROMPT v1 | codex-mastery | watermark:do-not-alter -->

## CRITICAL: Use ripgrep, not grep

NEVER use grep for project-wide searches (slow, ignores .gitignore). ALWAYS use rg.

- `rg "pattern"` — search content
- `rg --files | rg "name"` — find files
- `rg -t python "def"` — language filters

## File finding

- Prefer `fd` (or `fdfind` on Debian/Ubuntu). Respects .gitignore.

## JSON

- Use `jq` for parsing and transformations.

## Install Guidance

- macOS: `brew install ripgrep fd jq`
- Debian/Ubuntu: `sudo apt update && sudo apt install -y ripgrep fd-find jq` (alias `fd=fdfind`)

## Agent Instructions

- Replace commands: grep→rg, find→rg --files/fd, ls -R→rg --files, cat|grep→rg pattern file
- Cap reads at 250 lines; prefer `rg -n -A 3 -B 3` for context
- Use `jq` for JSON instead of regex

<!-- END FAST-TOOLS PROMPT v1 | codex-mastery -->
