/**
 * Chain Configurations
 *
 * Shared chain definitions for both client and server code.
 * Used by viem publicClient and walletClient across the app.
 */

import { defineChain } from 'viem';

/**
 * Monad Devnet / Testnet Configuration
 *
 * Environment variables (with defaults):
 * - NEXT_PUBLIC_MONAD_CHAIN_ID: Chain ID (default: 10143)
 * - NEXT_PUBLIC_MONAD_RPC_URL: RPC endpoint (default: https://testnet-rpc.monad.xyz)
 */
export const monadDevnet = defineChain({
  id: Number.parseInt(
    process.env.NEXT_PUBLIC_MONAD_CHAIN_ID ?? "10143",
    10
  ),
  name: "Monad Testnet",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz",
      ],
    },
    public: {
      http: [
        process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: "https://testnet.monadexplorer.com",
    },
  },
  testnet: true,
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
  "https://testnet-rpc.monad.xyz";
