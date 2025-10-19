---
title: Install & Configure Pragma
---

# 🔧 Install & Configure Pragma

Pragma is delivered as a TypeScript monorepo managed by `pnpm`. The CLI (`@pragma/cli`), web console (`apps/web`), and shared protocol logic (`@pragma/core`) live in the same workspace.

---

## 📥 1. Clone & Install

```bash
git clone <your fork or the upstream repo>
cd pragma-v1
pnpm install
```

The repository pins `pnpm@10.17.1` (see `package.json`). Install that toolchain to avoid lockfile churn.

---

## ⚙️ 2. Core Scripts

| Command | Description |
| --- | --- |
| `pnpm --filter @pragma/cli dev` | Start the CLI REPL (immediately compiles with `tsx`). |
| `pnpm --filter @pragma/web dev` | Run the Next.js web app on `http://localhost:3000`. |
| `pnpm --filter @pragma/cli build` | Compile the CLI into `apps/cli/dist/`. |
| `pnpm run build` | Type-check the root and build every package. |
| `pnpm run test` | Execute package-level tests (Node's built-in test runner). |

---

## 🔐 3. Environment Variables

The CLI loads server-side configuration from `apps/cli/src/services/config.ts`. The web console mirrors the same switches via `NEXT_PUBLIC_*` aliases (`apps/web/src/lib/config.ts`).

### ⚠️ Required (CLI & Web)

| Variable | Description |
| --- | --- |
| `WEB3AUTH_CLIENT_ID` (or `WEB3_AUTH_ID`) | Web3Auth application identifier for the embedded login bridge. |
| `WEB3AUTH_CLIENT_SECRET` (or `WEB3_AUTH_SECRET`) | Web3Auth client secret used by the local bridge. |
| `PIMLICO_API_KEY` | Access token for Pimlico's bundler/paymaster endpoints. |
| `PRAGMA_ADMIN_TEST_PK` | Private key used for the fallback faucet/onboarding helper (`onboarding/deploy` API route). |
| `OPENAI_API_KEY` | OpenAI API key for agent insights and clarifications (powers gpt-5-mini responses in REPL and web app). |

> 💡 **Tip:** Create a `.env` file in the repo root with these variables. The CLI reads from `process.env` on start. The web console reads `NEXT_PUBLIC_*` variables at build time.

> ⚠️ **Important:** Without `OPENAI_API_KEY`, the agent will only parse swap intents—no conversational insights or educational Q&A.

### 🎛️ Optional (CLI defaults shown in parentheses)

| Variable | Purpose |
| --- | --- |
| `MONORAIL_APP_ID` | Application ID for Monorail Pathfinder API. **Strongly recommended** - required for swap functionality; without it, quote requests will fail. |
| `PIMLICO_CHAIN` (`monad-testnet`) | Chain slug used to build Pimlico URLs. |
| `PIMLICO_BUNDLER_URL`, `PIMLICO_PAYMASTER_URL` | Override automatically generated Pimlico RPC URLs. |
| `PIMLICO_SPONSORSHIP_POLICY_ID` | Pin a custom Pimlico sponsorship policy. |
| `MONAD_EXECUTION_RPC_URL` (`https://testnet-rpc.monad.xyz`) | RPC used for writes and execution fallbacks. |
| `MONAD_ENVIO_READ_RPC_URL` (`https://monad-testnet.rpc.hypersync.xyz`) | Read-only HyperRPC endpoint (currently active). |
| `MONAD_HYPERSYNC_URL` (`https://monad-testnet.hypersync.xyz`) | HyperSync streaming endpoint (future - currently disabled). |
| `ENVIO_TOKEN_API` | Optional bearer token for Envio services; shared with the web console when set. |
| `MONORAIL_PATHFINDER_URL` (`https://testnet-pathfinder.monorail.xyz/v4`) | Monorail Pathfinder REST base. |
| `MONORAIL_DATA_API_URL` (`https://testnet-api.monorail.xyz/v1`) | Token metadata source for allowlists. |
| `MONORAIL_API_KEY` | API key passed to Monorail’s Data/Pathfinder endpoints (falls back to `ENVIO_TOKEN_API` or `MONORAIL_APP_ID`). |
| `MONORAIL_AGGREGATOR_ADDRESS` (`0x525B929fCd6a64AfF834f4eeCc6E860486cED700`) | On-chain router used for swaps. |
| `MONAD_NATIVE_TOKEN_SYMBOL` (`MON`), `MONAD_NATIVE_TOKEN_ADDRESS` (`0x0…0`), `MONAD_WRAPPED_TOKEN_SYMBOL` (`WMON`), `MONAD_WMON_ADDRESS` (`0x760a…5701`) | Token metadata injected into onboarding prompts and wrap/unwrap flows. |
| `WEB3AUTH_NETWORK` (`sapphire_devnet`) | Web3Auth environment. |
| `WEB3AUTH_BRIDGE_PORT` | Force a stable local port for the Web3Auth bridge. |
| `PRAGMA_DELEGATION_DIR`, `PRAGMA_RECEIPT_DIR` | Override the default `~/.pragma` directories for delegation artifacts and receipts. |

### Client-Side Aliases

When running the web console, mirror the values you need with `NEXT_PUBLIC_*` prefixes (for example `NEXT_PUBLIC_MONAD_RPC_URL`, `NEXT_PUBLIC_PIMLICO_API_KEY`, `NEXT_PUBLIC_MONORAIL_APP_ID`, `NEXT_PUBLIC_OPENAI_API_KEY`). Undefined public variables fall back to the same defaults used by the CLI.

---

## ✅ 4. Optional Quality Gates

```bash
pnpm run lint         # emits TypeScript errors (no eslint baseline yet)
pnpm run build:cli    # ensure CLI compiles before packaging
pnpm run test         # run viem-based tests and Node test suites
```

---

## 📂 5. Where Files Are Stored

- Delegation artifacts and session key secrets: `~/.pragma/test-delegations/<delegator>/…`
- Swap receipts: `~/.pragma/receipts/<delegator>/<timestamp>.json`
- Fixture mode (for deterministic runs) can be toggled with `PRAGMA_REPL_FIXTURE=1` before launching the CLI.

With prerequisites, environment variables, and directories in place, you can proceed to [onboarding a HybridDelegator](onboarding.md).
