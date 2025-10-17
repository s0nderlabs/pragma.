import { custom, createWalletClient, type Chain, type Address } from "viem";
import { createReadOnlyPublicClient } from "@pragma/core";

import type { Web3AuthBridge } from "./web3authServer.js";
import {
  MONAD_RPC_URL,
  MONAD_EXECUTION_RPC_URL,
  MONAD_READ_RPC_URL,
  MONAD_CHAIN_ID,
  MONAD_NATIVE_TOKEN_SYMBOL,
} from "./config.js";
import { isFixtureMode, loadFixtureInsights } from "../testing/fixtureRuntime.js";

const monadTestnet: Chain = {
  id: MONAD_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: MONAD_NATIVE_TOKEN_SYMBOL, decimals: 18 },
  rpcUrls: {
    default: { http: [MONAD_RPC_URL] },
    public: { http: [MONAD_RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: "https://testnet-explorer.monad.xyz",
    },
  },
};

export const monadChain = monadTestnet;

export type ConnectedWallet = {
  address: `0x${string}`;
  walletClient: ReturnType<typeof createWalletClient>;
};

export type BridgeRequest = {
  method: string;
  params?: unknown[];
};

export interface WalletRequestBridge {
  request: <T = unknown>(job: BridgeRequest) => Promise<T>;
}

export const createWalletClientFromBridge = async (
  bridge: WalletRequestBridge,
  fallbackAddress?: `0x${string}`,
): Promise<ConnectedWallet> => {
  const transport = custom({
    request: async ({ method, params }) => bridge.request({ method, params }),
  });

  const baseClient = createWalletClient({
    chain: monadTestnet,
    transport,
  });

  let address: `0x${string}` | undefined = fallbackAddress;
  if (!address) {
    try {
      const [discovered] = await baseClient.getAddresses();
      address = discovered;
    } catch (err) {
      // Ignore initial discovery errors; we'll fall back to eth_requestAccounts below.
      if (process.env.DEBUG_IDENTITY_BRIDGE) {
        console.warn("initial account discovery failed", err);
      }
    }
  }

  if (!address) {
    try {
      const result = await bridge.request<{ result?: unknown; length?: number } | string[] | string>(
        { method: "eth_requestAccounts", params: [] },
      );
      if (Array.isArray(result)) {
        address = result[0] as `0x${string}` | undefined;
      } else if (result && typeof result === "object" && "length" in result) {
        const asAny = result as any;
        address = asAny[0] as `0x${string}` | undefined;
      }
      if (!address) {
        const [discovered] = await baseClient.getAddresses();
        address = discovered;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Wallet bridge could not retrieve accounts: ${message}`);
    }
  }

  if (!address) {
    throw new Error(
      "Wallet bridge did not expose any accounts; ensure the embedded wallet is provisioned and retry.",
    );
  }

  const walletClient = createWalletClient({
    chain: monadTestnet,
    transport,
    account: address,
  });

  return {
    address,
    walletClient: walletClient as any,
  };
};

interface FixtureTokenBalance {
  address?: string;
  balance?: string;
}

interface FixtureInsightsData {
  walletBalances?: Record<string, FixtureTokenBalance[]>;
}

const parseBalance = (value: string | undefined): bigint => {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
};

const findTokenBalance = (
  data: FixtureInsightsData | undefined,
  owner: Address,
  token: Address,
): bigint => {
  const ownerKey = owner.toLowerCase();
  const tokenKey = token.toLowerCase();
  const balances = data?.walletBalances?.[ownerKey] ?? [];
  const entry = balances.find((balance) => (balance.address ?? "").toLowerCase() === tokenKey);
  return parseBalance(entry?.balance);
};

const createFixturePublicClient = () => {
  return {
    chain: monadTestnet,
    getBalance: async ({ address }: { address: Address }) => {
      const data = await loadFixtureInsights<FixtureInsightsData>();
      return findTokenBalance(data, address, "0x0000000000000000000000000000000000000000");
    },
    readContract: async ({ address, functionName, args }: { address: Address; functionName: string; args?: unknown[] }) => {
      if (functionName === "balanceOf" && args && args[0]) {
        const owner = args[0] as Address;
        const data = await loadFixtureInsights<FixtureInsightsData>();
        return findTokenBalance(data, owner, address);
      }
      if (functionName === "allowance") {
        return (1n << 128n) - 1n;
      }
      return 0n;
    },
    waitForTransactionReceipt: async () => ({ blockNumber: 0n, status: "success" as const }),
    getBytecode: async () => "0x6000",
  } as any;
};

export const createMonadPublicClient = (): any =>
  isFixtureMode()
    ? createFixturePublicClient()
    : (createReadOnlyPublicClient({
        chain: monadTestnet,
        readUrl: MONAD_READ_RPC_URL,
        fallbackUrl: MONAD_READ_RPC_URL === MONAD_EXECUTION_RPC_URL ? undefined : MONAD_EXECUTION_RPC_URL,
      }) as any);

export const createMonadExecutionClient = (): any =>
  isFixtureMode()
    ? createFixturePublicClient()
    : (createReadOnlyPublicClient({
        chain: monadTestnet,
        readUrl: MONAD_EXECUTION_RPC_URL,
        fallbackUrl: MONAD_EXECUTION_RPC_URL,
      }) as any);

export const createWeb3AuthWalletClient = (bridge: Web3AuthBridge) =>
  createWalletClientFromBridge(bridge);
