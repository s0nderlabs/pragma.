"use client";

import { custom, createWalletClient, type Address, type Chain, type Transport, type WalletClient } from "viem";
import { createReadOnlyPublicClient } from "@pragma/core/clients/publicClient";

import {
  MONAD_CHAIN_ID,
  MONAD_BLOCK_EXPLORER_URL,
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_READ_RPC_URL,
  MONAD_EXECUTION_RPC_URL,
  MONAD_RPC_URL,
} from "./config";

export const monadChain: Chain = {
  id: MONAD_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: {
    name: "Monad",
    symbol: MONAD_NATIVE_TOKEN_SYMBOL,
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [MONAD_RPC_URL] },
    public: { http: [MONAD_RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: MONAD_BLOCK_EXPLORER_URL,
    },
  },
};

export type MonadPublicClient = ReturnType<typeof createReadOnlyPublicClient>;

export const createMonadPublicClient = (): MonadPublicClient =>
  createReadOnlyPublicClient({
    chain: monadChain,
    readUrl: MONAD_READ_RPC_URL,
    // CRITICAL: Use same proxy URL as fallback to prevent bypass to direct RPC
    // Previous: fallbackUrl: MONAD_EXECUTION_RPC_URL (= testnet-rpc.monad.xyz) ← BYPASSES AUTH
    fallbackUrl: MONAD_READ_RPC_URL,
  });

export const createMonadExecutionClient = (): MonadPublicClient =>
  createReadOnlyPublicClient({
    chain: monadChain,
    readUrl: MONAD_EXECUTION_RPC_URL,
    fallbackUrl: MONAD_EXECUTION_RPC_URL,
  });

export interface WalletWithAddress {
  walletClient: WalletClient<Transport, typeof monadChain>;
  address: Address;
}

export const createWalletClientFromProvider = async (provider: unknown): Promise<WalletWithAddress> => {
  type Eip1193Provider = {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  };

  const isEip1193Provider = (value: unknown): value is Eip1193Provider => {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as { request?: unknown };
    return typeof candidate.request === "function";
  };

  if (!isEip1193Provider(provider)) {
    throw new Error("Wallet provider does not expose a request method");
  }

  const transport = custom({
    request: async ({ method, params }) => provider.request({ method, params }),
  });

  const baseClient = createWalletClient({
    chain: monadChain,
    transport,
  });

  let address: Address | undefined;
  try {
    [address] = await baseClient.getAddresses();
  } catch {
    address = undefined;
  }

  if (!address) {
    const result = await provider.request({ method: "eth_requestAccounts", params: [] }) as string[] | undefined;
    address = result?.[0] ? (result[0] as Address) : undefined;
  }

  if (!address) {
    throw new Error("Wallet provider did not return an account address");
  }

  const walletClient = createWalletClient({
    chain: monadChain,
    transport,
    account: address,
  });

  return {
    walletClient,
    address,
  };
};
