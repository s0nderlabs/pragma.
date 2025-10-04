import { custom, createPublicClient, createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";

import type { Web3AuthBridge } from "./web3authServer.js";
import { SEPOLIA_RPC_URL } from "./config.js";

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
    chain: sepolia,
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
    chain: sepolia,
    transport,
    account: address,
  });

  return {
    address,
    walletClient: walletClient as any,
  };
};

export const createSepoliaPublicClient = () =>
  createPublicClient({
    chain: sepolia,
    transport: http(SEPOLIA_RPC_URL),
  });

export const createWeb3AuthWalletClient = (bridge: Web3AuthBridge) =>
  createWalletClientFromBridge(bridge);
