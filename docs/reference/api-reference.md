---
title: API Reference
---

# API Reference (Next.js App Router)

The web console exposes a handful of API routes under `apps/web/src/app/api`. They are lightweight wrappers around `@pragma/core` functionality.

## `GET /api/tokens`

Returns an allowlist of tokens for onboarding and quick actions.

- **Cache:** In-memory per instance for five minutes (`memoryCache`).  
- **Sources:** Monorail Data API (`MONORAIL_DATA_API_URL`, `MONORAIL_API_KEY`).  
- **Fallback:** Returns MON and WMON metadata if the API fails.

```json
{
  "tokens": [
    {
      "address": "0x...",
      "symbol": "MON",
      "decimals": 18,
      "kind": "native",
      "categories": ["fallback"]
    }
  ],
  "error": "monorail_fetch_failed" // optional
}
```

## `POST /api/monorail/quote`

Sanitizes `QuoteRequestParams`, forwards them to Monorail Pathfinder, and normalizes bigints to strings.

- **Body:**  
  ```json
  {
    "fromToken": "0x...",
    "toToken": "0x...",
    "amountDecimal": "0.2",
    "sender": "0x...",
    "destination": "0x..." // optional
  }
  ```
- **Responses:**  
  - `200 OK` → normalized `MonorailQuote`.  
  - `400 Bad Request` → missing parameters or invalid JSON.  
  - `500` → misconfiguration (`MONORAIL_APP_ID` missing).  
  - `502` → Pathfinder error (message returned in `{ "error": "..." }`).

## `POST /api/chat/respond`

Streams agent responses over Server-Sent Events (SSE). The handler wires `@pragma/core/agent/pragmaAgent` with optional OpenAI clarifier/insight functions.

- **Request payload:**
  ```json
  {
    "message": "swap 0.2 MON to USDC",
    "delegation": {
      "artifact": { ... },   // DelegationArtifact
      "tokens": [ ... ]      // AllowedToken[]
    },
    "quickMode": true
  }
  ```
- **Responses:**  
  - `text/event-stream` when streaming: events can be  
    - `{ "type": "chunk", "content": "..." }`  
    - `{ "type": "control", "control": { "type": "...", "payload": ... } }`  
    - `{ "type": "error", "message": "..." }`  
    - `{ "type": "done" }` (terminator)  
  - `application/json` fallback (non-streaming insight) if streaming is disabled.  
  - Errors surface as `{ "error": "<message>" }` with appropriate status codes.
- **Fixture mode:** When `NEXT_PUBLIC_PRAGMA_FIXTURE_MODE=1` or `PRAGMA_REPL_FIXTURE=1`, agent data can be loaded from JSON fixtures on disk.

## `POST /api/onboarding/deploy`

Server action used by the web console to send a CREATE2 deployment transaction when the HybridDelegator is missing.

- **Body:**  
  ```json
  {
    "factory": "0x69Aa...",
    "factoryData": "0x…",
    "delegator": "0x...",   // optional
    "owner": "0x..."        // optional
  }
  ```
- **Requirements:**  
  - `factory` must match `0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c` (SimpleFactory).  
  - `PRAGMA_ADMIN_TEST_PK` (or `NEXT_PUBLIC_PRAGMA_ADMIN_TEST_PK`) must be set; the server uses it to sign the transaction.  
  - Uses `MONAD_RPC_URL` / `NEXT_PUBLIC_MONAD_RPC_URL` for transport.
- **Responses:**  
  - `200 OK` → `{ "transactionHash": "0x..." }` after confirmation.  
  - `400` → missing payload or unsupported factory address.  
  - `500` → missing admin key or RPC error (`{ "error": "..." }`).

## Fixture Helpers

All routes honor fixture flags:

| Variable | Effect |
| --- | --- |
| `PRAGMA_REPL_FIXTURE=1` | Use deterministic fixtures when available. |
| `NEXT_PUBLIC_PRAGMA_FIXTURE_MODE=1` | Enable fixture behavior on the client. |
| `PRAGMA_FIXTURE_DIR` | Directory for fixture JSON files (e.g., `tokens.json`, `quote.json`). |

These toggles keep the API calls deterministic during integration tests (see `apps/web/playwright.config.ts`).
