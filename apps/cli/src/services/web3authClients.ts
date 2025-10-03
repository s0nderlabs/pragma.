import { custom, createPublicClient, createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";

import type { Web3AuthBridge } from "./web3authServer.js";
import { SEPOLIA_RPC_URL } from "./config.js";

export type ConnectedWallet = {
  address: `0x${string}`;
  walletClient: ReturnType<typeof createWalletClient>;
};

export const createWeb3AuthWalletClient = async (
  bridge: Web3AuthBridge,
): Promise<ConnectedWallet> => {
  const transport = custom({
    request: async ({ method, params }) => bridge.request({ method, params }),
  });

  const baseClient = createWalletClient({
    chain: sepolia,
    transport,
  });

  const [address] = await baseClient.getAddresses();
  if (!address) {
    throw new Error("Web3Auth wallet did not return an address");
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
