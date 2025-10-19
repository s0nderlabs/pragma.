---
title: Routing & Quotes
---

# Routing & Quotes

All quotes come from Monorail Pathfinder (`packages/core/src/monorail/pathfinder.ts`). The CLI and web layers act as thin wrappers that sanitize payloads and surface structured summaries.

## Configuration

`apps/cli/src/services/monorailPathfinder.ts` builds a `MonorailPathfinderConfig`:

- `appId` → `MONORAIL_APP_ID` (required).  
- `pathfinderUrl` → `MONORAIL_PATHFINDER_URL` (defaults to `https://testnet-pathfinder.monorail.xyz/v4`).  
- `aggregatorAddress` → `MONORAIL_AGGREGATOR_ADDRESS` (defaults to `0x525B…`).  
- `apiKey` → optional `MONORAIL_API_KEY` (falls back to `ENVIO_TOKEN_API` or `MONORAIL_APP_ID`).

If `appId` is blank, `fetchMonorailQuote` throws `CONFIG_MISSING`.

## Request Payload

```ts
type QuoteRequestParams = {
  fromToken: Address;
  toToken: Address;
  amountDecimal: string; // decimal, not wei
  sender: Address;
  destination?: Address; // defaults to sender
  maxSlippageBps?: number;
};
```

Identifiers are checksummed (`getAddress`) before the request is sent.

## Response Shape (`MonorailQuote`)

| Field | Description |
| --- | --- |
| `quoteId` | Monorail-generated identifier for caching and receipts. |
| `transactionData` | Calldata returned by Pathfinder, ready to submit to the aggregator. |
| `transactionValue` | Native value (wei) accompanying the call. |
| `rawInput`, `rawOutput`, `rawMinOutput` | Expected amounts in wei (bigints). |
| `gasEstimate` | Optional gas estimate. |
| `routes` | Route summaries, each including pool addresses, symbols, price impact, and split percentages. |
| `fees` | Protocol/referral fee amounts & basis points when supplied. |

The CLI formats route information for stdout and prints fee details (using `formatUnits`) after execution.

## Plan Hash

`computeSwapPlanHash` (in `packages/core/src/execution/plan.ts`) hashes:

```
chainId, tokenIn, tokenOut,
amountInWei, minAmountOutWei,
slippageBps, deadlineSeconds,
hash(quoteId), hash(previewId)
```

`plan_hash` ties together quote, preview, execution, and receipt records. Any change to the plan (new quote, different amount, updated deadline) produces a new hash.

## Error Handling

Pathfinder errors propagate as `CONFIG_MISSING`, `QUOTE_RPC_ERROR`, or `QUOTE_NO_ROUTE`. The CLI and web console surface these as user-facing messages and stop before simulation.

## Token Metadata

Token lists come from `buildAllowedTokens` (`packages/core/src/monorail/tokens.ts`), which:

- Calls Monorail’s data API with the configured key.  
- Caches responses via `TokenCache` (memory cache in the web API route).  
- Injects fallback entries for MON/WMON if the API fails.

Delegation onboarding stores the normalized allowlist (address, symbol, decimals, categories) so swaps can be executed offline once tokens are selected.
