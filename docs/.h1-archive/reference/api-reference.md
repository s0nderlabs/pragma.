---
title: API Reference
last_updated: 2025-01-20
---

# 🌐 API Reference

The Next.js web app exposes REST routes under `/api` for chat, onboarding, quotes, and token metadata. These endpoints mirror the same core logic used by the CLI, ensuring consistent behavior across surfaces.

**Base URL:** `http://localhost:3000` (development)

---

## 💬 Chat Endpoints

### `POST /api/chat/respond`

Agent response endpoint with Server-Sent Events (SSE). Processes natural language input and executes swap/wrap/transfer operations with streaming responses.

**Authentication:** None (uses client-side delegation from localStorage)

**Request Schema:**

```typescript
{
  message: string;                    // Natural language input
  delegation?: {                      // Optional delegation context
    artifact: {
      artifactId: string;
      delegator: string;
      sessionKeyAddress: string;
      mode: "safe" | "normal";
      expiresAt: number;
      allowedTokens: string[];
      // ... additional delegation fields
    };
    tokens: Array<{
      address: string;
      symbol: string;
      decimals: number;
    }>;
  };
  quickMode?: boolean;                // Enable auto-execution (default: false)
}
```

**Request Example:**

```bash
curl -N -X POST http://localhost:3000/api/chat/respond \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "message": "swap 0.1 MON to USDC",
    "delegation": {
      "artifact": {
        "artifactId": "test-artifact-1",
        "delegator": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
        "sessionKeyAddress": "0x1234567890123456789012345678901234567890",
        "mode": "normal",
        "expiresAt": 1737504000000,
        "allowedTokens": ["0x...", "0x..."]
      },
      "tokens": [
        {"address": "0x...", "symbol": "USDC", "decimals": 6}
      ]
    },
    "quickMode": false
  }'
```

**Response Format:** Server-Sent Events stream

**Event Types:**

1. **chunk** - Text content from agent:
```
event: message
data: {"type":"chunk","content":"Fetching quote from Monorail..."}
```

2. **control** - Actionable control messages:
```
event: message
data: {"type":"control","control":{"type":"swap_preview","payload":{...}}}
```

3. **error** - Error occurred:
```
event: message
data: {"type":"error","message":"Insufficient balance"}
```

4. **done** - Stream complete:
```
event: message
data: {"type":"done"}
```

**Complete Stream Example:**

```
event: message
data: {"type":"chunk","content":"Fetching quote from Monorail..."}

event: message
data: {"type":"chunk","content":"\n\n📊 Swap Preview\n\n"}

event: message
data: {"type":"chunk","content":"Input: 0.1 MON\n"}

event: message
data: {"type":"chunk","content":"Expected Output: ~0.095 USDC\n"}

event: message
data: {"type":"control","control":{"type":"swap_preview","payload":{"amountIn":"0.1","tokenIn":"MON","amountOut":"0.095","tokenOut":"USDC","planHash":"0xabcd..."}}}

event: message
data: {"type":"done"}
```

**Error Stream Example:**

```
event: message
data: {"type":"chunk","content":"❌ Error: Token not in delegation scope\n"}

event: message
data: {"type":"error","message":"WETH is not included in your current delegation."}

event: message
data: {"type":"done"}
```

**Client-Side Consumption:**

```typescript
const eventSource = new EventSource('/api/chat/respond', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: "swap 0.1 MON to USDC", delegation: {...} })
});

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'chunk':
      console.log('Text:', data.content);
      break;
    case 'control':
      console.log('Control:', data.control);
      break;
    case 'error':
      console.error('Error:', data.message);
      break;
    case 'done':
      eventSource.close();
      break;
  }
};
```

**Status Codes:**
- `200` - Stream started successfully
- `400` - Invalid request body
- `500` - Server error before stream starts

---

## 📊 Quote Endpoint

### `POST /api/monorail/quote`

Fetches swap quotes from Monorail Pathfinder. Used to get expected outputs and routing information before execution.

**Authentication:** None

**Request Schema:**

```typescript
{
  fromToken: string;                  // Token address to swap from
  toToken: string;                    // Token address to swap to
  amountDecimal: string;              // Amount in decimal format (not wei)
  sender: string;                     // Sender address (HybridDelegator)
  destination?: string;               // Optional recipient (defaults to sender)
  maxSlippageBps?: number;            // Optional slippage tolerance in basis points
}
```

**Request Example:**

```bash
curl -X POST http://localhost:3000/api/monorail/quote \
  -H "Content-Type: application/json" \
  -d '{
    "fromToken": "0x0000000000000000000000000000000000000000",
    "toToken": "0x1234567890123456789012345678901234567890",
    "amountDecimal": "0.1",
    "sender": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
    "maxSlippageBps": 25
  }'
```

**Response Schema:**

```typescript
{
  quoteId: string;                    // Monorail quote identifier
  transactionData: string;            // Encoded calldata for aggregator
  transactionValue: string;           // Native value to send (wei, as string)
  rawInput: string;                   // Expected input amount (wei, as string)
  rawOutput: string;                  // Expected output amount (wei, as string)
  rawMinOutput: string;               // Minimum output after slippage (wei, as string)
  gasEstimate?: string;               // Estimated gas (wei, as string)
  routes: Array<{
    poolAddress: string;
    symbols: string[];                // [tokenIn, tokenOut]
    priceImpact: string;              // Percentage as string
    splitPercentage: number;          // Route weight (0-100)
  }>;
  fees?: {
    protocolFee: string;              // Fee amount (wei, as string)
    protocolFeeBps: number;           // Fee in basis points
  };
}
```

**Success Response Example:**

```json
{
  "quoteId": "monorail-quote-abc123",
  "transactionData": "0x1234567890abcdef...",
  "transactionValue": "0",
  "rawInput": "100000000000000000",
  "rawOutput": "95000",
  "rawMinOutput": "94762",
  "gasEstimate": "150000",
  "routes": [
    {
      "poolAddress": "0xabcd...ef01",
      "symbols": ["MON", "USDC"],
      "priceImpact": "0.02",
      "splitPercentage": 100
    }
  ],
  "fees": {
    "protocolFee": "10",
    "protocolFeeBps": 1
  }
}
```

**Error Response Examples:**

**Missing App ID:**
```json
{
  "error": "CONFIG_MISSING: Monorail app id is required to request quotes."
}
```

**No Route Found:**
```json
{
  "error": "QUOTE_NO_ROUTE: Monorail could not build a route for this pair."
}
```

**Invalid Parameters:**
```json
{
  "error": "Invalid token addresses or amount"
}
```

**Status Codes:**
- `200` - Quote fetched successfully
- `400` - Invalid request parameters
- `500` - Monorail app ID not configured
- `502` - Monorail Pathfinder error

---

## 🪙 Token Endpoints

### `GET /api/tokens`

Fetches the curated token allowlist from Monorail Data API. Used during delegation issuance to populate token selection.

**Authentication:** None

**Query Parameters:** None

**Request Example:**

```bash
curl http://localhost:3000/api/tokens
```

**Response Schema:**

```typescript
{
  tokens: Array<{
    address: string;                  // Checksummed token address
    symbol: string;                   // Token symbol (e.g., "USDC")
    decimals: number;                 // Token decimals (e.g., 6, 18)
    kind?: "native" | "wrapped" | "erc20";
    name?: string;                    // Full token name
    categories?: string[];            // Tags (e.g., ["stablecoin", "verified"])
    logoURI?: string;                 // Token logo URL
  }>;
  error?: string;                     // Optional error message if fallback used
}
```

**Success Response Example:**

```json
{
  "tokens": [
    {
      "address": "0x0000000000000000000000000000000000000000",
      "symbol": "MON",
      "decimals": 18,
      "kind": "native",
      "name": "Monad Native Token",
      "categories": ["native"]
    },
    {
      "address": "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701",
      "symbol": "WMON",
      "decimals": 18,
      "kind": "wrapped",
      "name": "Wrapped MON",
      "categories": ["wrapped", "native"]
    },
    {
      "address": "0x1234567890123456789012345678901234567890",
      "symbol": "USDC",
      "decimals": 6,
      "kind": "erc20",
      "name": "USD Coin",
      "categories": ["stablecoin", "verified"],
      "logoURI": "https://..."
    }
  ]
}
```

**Fallback Response (API Failure):**

When Monorail API is unavailable, returns minimal fallback with MON/WMON:

```json
{
  "tokens": [
    {
      "address": "0x0000000000000000000000000000000000000000",
      "symbol": "MON",
      "decimals": 18,
      "kind": "native",
      "categories": ["fallback"]
    },
    {
      "address": "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701",
      "symbol": "WMON",
      "decimals": 18,
      "kind": "wrapped",
      "categories": ["fallback"]
    }
  ],
  "error": "monorail_fetch_failed"
}
```

**Status Codes:**
- `200` - Success (includes fallback case)

**Caching:**
- In-memory cache: 5 minutes
- Cache implementation: `memoryCache` (per instance)

---

## 🚪 Onboarding Endpoints

### `POST /api/onboarding/deploy`

Deploys a HybridDelegator smart account using CREATE2. This server action is used when the account doesn't exist and needs gasless deployment via admin funding.

**Authentication:** None (uses server-side admin private key)

**Request Schema:**

```typescript
{
  factory: string;                    // Factory contract address (must match SimpleFactory)
  factoryData: string;                // Encoded deployment data
  delegator?: string;                 // Optional delegator address for validation
  owner?: string;                     // Optional owner address for validation
}
```

**Request Example:**

```bash
curl -X POST http://localhost:3000/api/onboarding/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "factory": "0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c",
    "factoryData": "0x1234567890abcdef...",
    "delegator": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
    "owner": "0x1234567890123456789012345678901234567890"
  }'
```

**Response Schema:**

```typescript
{
  transactionHash: string;            // Deployment transaction hash
}
```

**Success Response Example:**

```json
{
  "transactionHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
}
```

**Error Response Examples:**

**Missing Admin Key:**
```json
{
  "error": "Admin private key not configured for deployment"
}
```

**Invalid Factory:**
```json
{
  "error": "Unsupported factory address. Expected: 0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c"
}
```

**RPC Error:**
```json
{
  "error": "RPC error: transaction reverted"
}
```

**Status Codes:**
- `200` - Deployment transaction sent
- `400` - Invalid request (missing parameters or unsupported factory)
- `500` - Server configuration error or RPC failure

**Requirements:**
- `PRAGMA_ADMIN_TEST_PK` or `NEXT_PUBLIC_PRAGMA_ADMIN_TEST_PK` must be set
- Factory must be `0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c` (SimpleFactory)
- RPC configured via `MONAD_RPC_URL` or `NEXT_PUBLIC_MONAD_RPC_URL`

---

## 🔧 Environment Variables

All API routes rely on environment configuration. Client-facing routes use `NEXT_PUBLIC_*` prefixes.

**Required:**
- `NEXT_PUBLIC_MONORAIL_APP_ID` - Monorail application ID (for quotes and tokens)
- `NEXT_PUBLIC_OPENAI_API_KEY` - OpenAI API key (for agent chat)
- `PRAGMA_ADMIN_TEST_PK` - Admin private key (for deployment endpoint)

**Optional:**
- `NEXT_PUBLIC_MONAD_RPC_URL` - Override default RPC endpoint
- `NEXT_PUBLIC_MONORAIL_PATHFINDER_URL` - Override Pathfinder URL
- `NEXT_PUBLIC_MONORAIL_DATA_API_URL` - Override Data API URL
- `NEXT_PUBLIC_MONORAIL_API_KEY` - API key for Monorail requests

Refer to [`docs/getting-started/install.md`](../getting-started/install.md) for complete variable definitions and [`docs/appendix/providers.md`](../appendix/providers.md) for provider-specific configuration.

---

## 🧪 Fixture Mode

All routes honor fixture flags for deterministic testing:

| Variable | Effect |
|----------|--------|
| `PRAGMA_REPL_FIXTURE=1` | Use deterministic fixtures when available |
| `NEXT_PUBLIC_PRAGMA_FIXTURE_MODE=1` | Enable fixture behavior on the client |
| `PRAGMA_FIXTURE_DIR` | Directory for fixture JSON files (e.g., `tokens.json`, `quote.json`) |

**Fixture File Examples:**

`tokens.json`:
```json
{
  "tokens": [
    {"address": "0x...", "symbol": "USDC", "decimals": 6}
  ]
}
```

`quote.json`:
```json
{
  "quoteId": "fixture-quote-1",
  "rawOutput": "95000",
  ...
}
```

These toggles keep API responses deterministic during integration tests (see `apps/web/playwright.config.ts`).

---

## 🔒 Security Considerations

**No server-side delegation storage:**
- Delegation artifacts stored client-side in localStorage
- Session keys never transmitted to server
- Server only processes operations, doesn't store secrets

**Input validation:**
- All addresses validated with `viem.getAddress()`
- Natural language input sanitized before AI processing
- Factory address validated against whitelist

**Rate limiting:**
- Consider implementing rate limits for `/api/chat/respond`
- Monorail API has its own rate limits
- Admin-funded deployments should be rate-limited

**Error handling:**
- Error messages don't expose sensitive internals
- Stack traces only in development mode
- Canonical error codes from `@pragma/core/errors`

---

## 🧪 Testing API Endpoints

**Using cURL:**

```bash
# Test chat endpoint with streaming
curl -N -X POST http://localhost:3000/api/chat/respond \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"what is pragma"}'

# Test quote endpoint
curl -X POST http://localhost:3000/api/monorail/quote \
  -H "Content-Type: application/json" \
  -d '{
    "fromToken":"0x0000000000000000000000000000000000000000",
    "toToken":"0x1234567890123456789012345678901234567890",
    "amountDecimal":"0.1",
    "sender":"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1"
  }'

# Test token allowlist
curl http://localhost:3000/api/tokens

# Test deployment
curl -X POST http://localhost:3000/api/onboarding/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "factory":"0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c",
    "factoryData":"0x...",
    "delegator":"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1"
  }'
```

**Using Playwright tests:**

See [`docs/reference/testing.md`](./testing.md) for E2E test examples that exercise these endpoints.

---

## 📚 Related Documentation

- [🚪 Onboarding Flow](../getting-started/onboarding.md) - Uses `/api/onboarding/deploy`
- [💬 Web Console Guide](../guides/web-ui-guide.md) - User interface for these APIs
- [⚙️ Provider Configuration](../appendix/providers.md) - Environment variables
- [🧪 Testing Reference](./testing.md) - API testing examples
- [🐛 Error Catalog](../system-layers/errors.md) - Error codes reference
- [🔄 Routing & Quotes](../system-layers/routing-quotes.md) - Monorail integration details
