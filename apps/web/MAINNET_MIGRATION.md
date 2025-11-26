# Mainnet Migration Guide

This document describes all environment variables and configuration changes needed to migrate Pragma from Monad Testnet to Monad Mainnet.

## Overview

The codebase now uses environment variables with testnet defaults for all network-specific configuration. To migrate to mainnet, update the environment variables in your `.env` file.

---

## Environment Variables to Update

### Network Configuration

| Variable | Testnet Value | Mainnet Value | Description |
|----------|---------------|---------------|-------------|
| `NEXT_PUBLIC_MONAD_CHAIN_ID` | `10143` | TBD | Chain ID for Monad network |
| `NEXT_PUBLIC_MONAD_BLOCK_EXPLORER_URL` | `https://testnet.monadexplorer.com` | TBD | Block explorer URL for transaction links |

### RPC Endpoints

| Variable | Testnet Value | Mainnet Value | Description |
|----------|---------------|---------------|-------------|
| `MONAD_RPC_URL` | `https://testnet-rpc.monad.xyz` | TBD | Server-side RPC (may include API key) |
| `NEXT_PUBLIC_MONAD_RPC_URL` | `https://testnet-rpc.monad.xyz` | TBD | Public RPC URL |
| `NEXT_PUBLIC_MONAD_EXECUTION_RPC_URL` | `/api/rpc` (proxy) | `/api/rpc` (proxy) | Transaction execution RPC |

### Monorail DEX Aggregator

| Variable | Testnet Value | Mainnet Value | Description |
|----------|---------------|---------------|-------------|
| `NEXT_PUBLIC_MONORAIL_PATHFINDER_URL` | `https://testnet-pathfinder.monorail.xyz/v4` | TBD | Swap pathfinder API |
| `NEXT_PUBLIC_MONORAIL_DATA_API_URL` | `https://testnet-api.monorail.xyz/v1` | TBD | Token data API |
| `NEXT_PUBLIC_MONORAIL_AGGREGATOR_ADDRESS` | `0x525B929fCd6a64AfF834f4eeCc6E860486cED700` | TBD | Aggregator contract address |

### Token Addresses

| Variable | Testnet Value | Mainnet Value | Description |
|----------|---------------|---------------|-------------|
| `NEXT_PUBLIC_MONAD_WMON_ADDRESS` | `0x760afe86e5de5fa0ee542fc7b7b713e1c5425701` | TBD | Wrapped MON (WMON) contract |
| `NEXT_PUBLIC_APRIORI_ADDRESS` | `0xb2f82D0f38dc453D596Ad40A37799446Cc89274A` | TBD | aPriori staking contract |

### Pimlico (Bundler/Paymaster)

| Variable | Testnet Value | Mainnet Value | Description |
|----------|---------------|---------------|-------------|
| `NEXT_PUBLIC_PIMLICO_CHAIN` | `monad-testnet` | TBD | Pimlico chain identifier |

---

## No Changes Needed (CREATE2 Deterministic)

These addresses are deployed using CREATE2 deterministic deployment and are **identical on testnet and mainnet**:

| Contract | Address | Notes |
|----------|---------|-------|
| Smart Account Factory | `0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c` | HybridDelegator factory |
| All DTK Enforcer Contracts | Same addresses | MetaMask Delegation Toolkit contracts |

---

## Token Fallback Lists (Manual Update)

**Important:** These files contain hardcoded testnet token addresses used as fallbacks when the Monorail API is unavailable. For mainnet, the Monorail API should return correct token lists.

If you experience issues with token lists on mainnet, update:

- `apps/web/src/lib/monorail.ts` - `FALLBACK_TOKENS` array (51 tokens)
- `apps/web/src/app/api/tokens/route.ts` - `FALLBACK_TOKENS` array (51 tokens)
- `apps/web/src/lib/h2/tokens.ts` - Minimal fallback (3 tokens: MON, WMON, USDC)

**Strategy:** The fallback lists are rarely used since the Monorail API should be reliable on mainnet. If needed, replace testnet token addresses with mainnet equivalents.

---

## Migration Checklist

### Pre-Migration

- [ ] Obtain all mainnet values (chain ID, RPC URLs, contract addresses)
- [ ] Verify Monorail mainnet API endpoints
- [ ] Verify Pimlico mainnet chain identifier
- [ ] Test mainnet RPC connectivity

### Environment Update

- [ ] Update `.env` with mainnet values
- [ ] Verify `MONAD_RPC_URL` points to mainnet RPC (server-side)
- [ ] Verify `NEXT_PUBLIC_MONAD_BLOCK_EXPLORER_URL` points to mainnet explorer
- [ ] Update Vercel/deployment environment variables

### Verification

- [ ] Build passes: `pnpm --filter web build`
- [ ] No hardcoded testnet URLs: `grep -r "testnet.monadexplorer.com" apps/web/src/` returns 0 results
- [ ] Explorer links open correct mainnet URLs
- [ ] Swaps work via Monorail mainnet
- [ ] Staking works via aPriori mainnet
- [ ] Transaction receipts show correct explorer links

### Post-Migration

- [ ] Monitor for any token list issues (fallback may need update)
- [ ] Verify gas estimation and bundler operations
- [ ] Test full user flow: onboarding → swap → stake → transfer

---

## Files Modified for Dynamic Configuration

These files were updated to use environment variables instead of hardcoded testnet values:

### Configuration

- `apps/web/src/lib/config.ts` - Central env var exports (added `MONAD_BLOCK_EXPLORER_URL`)

### Chain Definitions

- `apps/web/src/lib/chains.ts` - Viem chain definition
- `apps/web/src/lib/clients.ts` - Client chain configuration
- `apps/web/src/app/api/chat/respond/route.ts` - H2 agent chain config

### UI Components (Explorer Links)

- `apps/web/src/lib/h2/activityExtractor.ts` - `getExplorerUrl()` function
- `apps/web/src/components/h2/session/SessionKeyStatus.tsx` - Session key explorer link
- `apps/web/src/components/h2/sidebar/ActivityDetailModal.tsx` - Transaction & address links
- `apps/web/src/components/h2/chat/BatchOperationSummary.tsx` - Batch operation tx links

---

## Questions?

For mainnet-specific contract addresses and API endpoints, consult:
- Monad documentation
- Monorail documentation
- aPriori documentation
- Pimlico documentation
