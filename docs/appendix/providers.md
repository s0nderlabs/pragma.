---
title: Provider Configuration
---

# Provider Configuration

Pragma stitches together several third-party services. The tables below list the relevant environment variables, defaults, and where each provider is used.

## Web3Auth (Identity)

| Variable | Description | Used By |
| --- | --- | --- |
| `WEB3AUTH_CLIENT_ID` / `WEB3_AUTH_ID` | Web3Auth application ID. | CLI & Web. |
| `WEB3AUTH_CLIENT_SECRET` / `WEB3_AUTH_SECRET` | Web3Auth secret for the local bridge. | CLI & Web. |
| `WEB3AUTH_NETWORK` (`sapphire_devnet`) | Web3Auth environment. | CLI & Web. |
| `WEB3AUTH_BRIDGE_PORT` | Override port for the local bridge server. | CLI. |

## Pimlico (Bundler & Paymaster)

| Variable | Description | Used By |
| --- | --- | --- |
| `PIMLICO_API_KEY` | Required API key for bundler/paymaster RPC. | CLI onboarding, web onboarding. |
| `PIMLICO_CHAIN` (`monad-testnet`) | Chain slug for URL construction. | CLI & Web. |
| `PIMLICO_BUNDLER_URL`, `PIMLICO_PAYMASTER_URL` | Override default Pimlico URLs. | CLI & Web. |
| `PIMLICO_SPONSORSHIP_POLICY_ID` | Optional custom sponsorship policy ID. | CLI & Web. |

Pimlico is only needed for the 4337 deployment step. Regular swaps execute directly against the HybridDelegator.

## Monorail (Routing & Tokens)

| Variable | Description | Used By |
| --- | --- | --- |
| `MONORAIL_APP_ID` | Required application ID for Pathfinder. | CLI, Web, API routes. |
| `MONORAIL_API_KEY` | Optional API key (falls back to `ENVIO_TOKEN_API` or `MONORAIL_APP_ID`). | CLI, Web, API routes. |
| `MONORAIL_PATHFINDER_URL` (`https://testnet-pathfinder.monorail.xyz/v4`) | Pathfinder base URL. | CLI & Web. |
| `MONORAIL_DATA_API_URL` (`https://testnet-api.monorail.xyz/v1`) | Token metadata source. | CLI & Web. |
| `MONORAIL_AGGREGATOR_ADDRESS` (`0x525B929fCd6a64AfF834f4eeCc6E860486cED700`) | Aggregator contract executed on-chain. | CLI & Web. |

## Envio Infrastructure (HyperRPC & HyperSync)

Envio provides two services for Pragma:
- **HyperRPC**: Fast read-only RPC endpoint for simulations and balance queries (currently active)
- **HyperSync**: Real-time streaming endpoint for transaction observability and live updates (future - currently disabled)

| Variable | Description | Used By |
| --- | --- | --- |
| `MONAD_ENVIO_READ_RPC_URL` (`https://monad-testnet.rpc.hypersync.xyz`) | HyperRPC endpoint for read-only calls and simulations. Currently active. | CLI & Web. |
| `MONAD_HYPERSYNC_URL` (`https://monad-testnet.hypersync.xyz`) | HyperSync streaming endpoint (future). Currently disabled. | CLI & Web (future). |
| `ENVIO_TOKEN_API` | Optional bearer token appended to Envio API requests. | CLI, Web, API routes. |
| `PRAGMA_DISABLE_HYPERSYNC` / `NEXT_PUBLIC_PRAGMA_DISABLE_HYPERSYNC` | Currently set to `1` by default (HyperSync disabled). Will enable HyperSync subscriptions in future release. | CLI & Web. |

## Monad RPC (Execution Fallback)

| Variable | Description | Used By |
| --- | --- | --- |
| `MONAD_EXECUTION_RPC_URL` (`https://testnet-rpc.monad.xyz`) | Primary RPC for writes, approvals, and fallbacks. | CLI & Web. |
| `MONAD_RPC_URL` | Deprecated alias for `MONAD_EXECUTION_RPC_URL`. | CLI onboarding deploy route. |

## OpenAI (Agent Intelligence)

| Variable | Description | Used By |
| --- | --- | --- |
| `OPENAI_API_KEY` | Required for agent insights, clarifications, and educational responses. | CLI REPL, Web app. |
| `NEXT_PUBLIC_OPENAI_API_KEY` | Browser-side mirror of `OPENAI_API_KEY` for web app agent. | Web app. |
| `PRAGMA_AGENT_STREAM_INSIGHTS` | Enable streaming SSE responses (default: enabled). | CLI & Web. |
| `PRAGMA_AGENT_STREAM_TIMEOUT_MS` | First chunk timeout in milliseconds (default: 1200). | CLI & Web. |

**Models used:** gpt-5-mini (primary).

Without this key, the agent will only parse swap intents deterministically but won't provide insights or answer educational questions. The conversational AI capabilities (clarifications with context, system explanations, trending tokens, safety warnings) require a valid OpenAI API key.

## Tokens & Symbols

| Variable | Default | Purpose |
| --- | --- | --- |
| `MONAD_NATIVE_TOKEN_SYMBOL` | `MON` | Display labels for native token. |
| `MONAD_NATIVE_TOKEN_ADDRESS` | `0x000…000` | Checksummed MON address. |
| `MONAD_WRAPPED_TOKEN_SYMBOL` | `WMON` | Display label for wrapped token. |
| `MONAD_WMON_ADDRESS` | `0x760afe86e5de5fa0ee542fc7b7b713e1c5425701` | WMON contract address. |

## Storage Overrides

| Variable | Description |
| --- | --- |
| `PRAGMA_DELEGATION_DIR` | Override `~/.pragma/test-delegations`. |
| `PRAGMA_RECEIPT_DIR` | Override `~/.pragma/receipts`. |

## Fixture & Testing Helpers

| Variable | Description |
| --- | --- |
| `PRAGMA_REPL_FIXTURE=1` | Run CLI commands against fixtures (no RPC). |
| `NEXT_PUBLIC_PRAGMA_FIXTURE_MODE=1` | Enable fixture endpoints for the web console. |
| `PRAGMA_FIXTURE_DIR` | Directory containing JSON fixtures (tokens, quotes, insights). |

Refer back to [`docs/getting-started/install.md`](../getting-started/install.md) for installation steps and to [`docs/reference/api-reference.md`](../reference/api-reference.md) for details on the REST endpoints that rely on these providers.
