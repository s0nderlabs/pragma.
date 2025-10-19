---
title: Architecture Overview
---

# Architecture Overview

Pragma is organized as a pnpm workspace with three primary areas: shared protocol logic (`packages/core`), the CLI (`apps/cli`), and the web console (`apps/web`). Each surface consumes the same primitives to keep behavior consistent.

## Monorepo Layout

| Path | Purpose |
| --- | --- |
| `packages/core` | Intent engine, policy helpers, Monorail integrations, execution/simulation utilities, canonical errors. |
| `packages/contracts` | Solidity caveat enforcers and tests (built-in DTK enforcers cloned locally). |
| `packages/utils` | Shared TypeScript helpers (formatting, hashing, env utilities). |
| `apps/cli` | Commander-based CLI, onboarding flows, wrap/unwrap/transfer engines, receipt persistence. |
| `apps/web` | Next.js App Router front end (web app with chat interface, onboarding UI, REST endpoints). |

## Core Dependencies

- **MetaMask Delegation Toolkit (DTK)** – HybridDelegator implementation, `redeemDelegations`, caveat enforcers.  
- **Monorail Pathfinder/Data** – Quote generation and token metadata.  
- **Envio HyperRPC/HyperSync** – Fast RPC for simulation and optional live event streaming.  
- **Pimlico** – Bundler/paymaster used during 4337 onboarding deployment.  
- **Web3Auth** – Identity provider for root signature requests.

## Data Flow

1. **User surfaces** (CLI REPL, CLI commands, web app) gather input and fetch delegation artifacts from disk or browser storage.  
2. **Intent engine** (`@pragma/core/intent`) normalizes the request and returns a canonical `SwapIntent`.  
3. **Policy layer** (delegation metadata + clamps) validates scope, TTL, call limits, and optional caps.  
4. **Monorail** provides quotes and calldata.  
5. **Simulation** (`@pragma/core/execution/swap.previewSwapWithSession`) validates balances/min-out using HyperRPC.  
6. **Execution** (`@pragma/core/execution/*`) redeems the delegation through DTK and submits transactions.  
7. **Observability** (logs, receipts, optional HyperSync) completes the loop and persists artifacts.

## Shared Utilities

- `callWithRpcFallback` → wraps read operations with HyperRPC + execution RPC fallback.  
- `computeSwapPlanHash` → deterministic plan hashing across surfaces.  
- `verifyTokenCaps` / `persistSwapSessionCaps` → enforce and track per-token/native swap caps.

## Environments

- **Development:** Node-based CLI, Next.js dev server, local `.env` file.  
- **Fixtures:** `PRAGMA_REPL_FIXTURE=1` swaps in deterministic fixtures for testing (no live RPC).  
- **Production-readiness:** The architecture is stateless—rehydrate from delegation artifacts, on-chain state, and external APIs. No database is required.

Use this overview to orient yourself before diving into specific flows or layer docs.
