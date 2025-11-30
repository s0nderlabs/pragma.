/**
 * Chain Configurations
 *
 * Shared chain definitions for both client and server code.
 * Used by viem publicClient and walletClient across the app.
 */

import { defineChain } from 'viem';
import { MONAD_BLOCK_EXPLORER_URL } from './config';

/**
 * Monad Chain Configuration
 *
 * Environment variables (with defaults):
 * - NEXT_PUBLIC_MONAD_CHAIN_ID: Chain ID (default: 143)
 * - NEXT_PUBLIC_MONAD_RPC_URL: RPC endpoint (default: /api/rpc proxy)
 */
export const monadDevnet = defineChain({
  id: Number.parseInt(
    process.env.NEXT_PUBLIC_MONAD_CHAIN_ID ?? "143",
    10
  ),
  name: "Monad",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    // CRITICAL: Use proxy URL for all RPC calls to ensure authentication
    // Viem uses chain.rpcUrls.default even when custom transport is passed
    default: {
      http: ["/api/rpc"],
    },
    public: {
      http: ["/api/rpc"],
    },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: MONAD_BLOCK_EXPLORER_URL,
    },
  },
  testnet: false,
});

/**
 * Monad Execution RPC URL
 *
 * Used for transaction submission (may differ from read RPC).
 * Falls back to MONAD_RPC_URL if not specified.
 */
export const MONAD_EXECUTION_RPC_URL =
  process.env.NEXT_PUBLIC_MONAD_EXECUTION_RPC_URL ??
  process.env.NEXT_PUBLIC_MONAD_RPC_URL ??
  "/api/rpc";
