"use client";

import * as React from "react";
import { Web3Auth } from "@web3auth/modal";
import { OpenloginAdapter } from "@web3auth/openlogin-adapter";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import { createWalletClient, custom, getAddress, type Address, type Hex } from "viem";
const CHAIN_NAMESPACES = {
  EIP155: "eip155" as const,
};

import {
  MONAD_CHAIN_ID,
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_RPC_URL,
  WEB3AUTH_CLIENT_ID,
  WEB3AUTH_NETWORK,
} from "../lib/config";
import { createWalletClientFromProvider, monadChain, type WalletWithAddress } from "../lib/clients";
import { createHybridDelegatorHandle } from "../lib/onboarding/hybridDelegator";
import { setActiveDelegator, clearActiveDelegator, IDENTITY_EVENT } from "../lib/storage/active-delegator";
import { clearOwnerDelegator, getOwnerDelegator, setOwnerDelegator } from "../lib/storage/owner-delegators";

export type IdentityStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "connecting"
  | "connected"
  | "error";

type IdentitySnapshot = {
  status: IdentityStatus;
  wallet: WalletWithAddress | null;
  error?: string;
};

const isMockIdentity = process.env.NEXT_PUBLIC_PRAGMA_IDENTITY_PROVIDER === "mock";
const DEFAULT_MOCK_OWNER = (process.env.NEXT_PUBLIC_PRAGMA_MOCK_OWNER_ADDRESS ?? "0x1111111111111111111111111111111111111111") as Address;
const DEFAULT_MOCK_DELEGATOR = (process.env.NEXT_PUBLIC_PRAGMA_MOCK_DELEGATOR_ADDRESS ?? "0x2222222222222222222222222222222222222222") as Address;

const createMockWallet = (address: Address): WalletWithAddress => {
  const baseClient = createWalletClient({
    chain: monadChain,
    account: address,
    transport: custom({
      request: async () => {
        throw new Error("Mock wallet client cannot perform RPC requests");
      },
    }),
  });

  const mockClient = baseClient.extend(() => ({
    signTypedData: async (...args: Parameters<typeof baseClient.signTypedData>) => {
      void args;
      return "0x" as Hex;
    },
  }));

  return {
    address,
    walletClient: mockClient,
  };
};

let identitySnapshot: IdentitySnapshot = {
  status: "idle",
  wallet: null,
  error: undefined,
};

const identityListeners = new Set<() => void>();

const subscribeIdentity = (listener: () => void) => {
  identityListeners.add(listener);
  return () => identityListeners.delete(listener);
};

const getIdentitySnapshot = () => identitySnapshot;

const setIdentitySnapshot = (partial: Partial<IdentitySnapshot>) => {
  identitySnapshot = { ...identitySnapshot, ...partial };
  identityListeners.forEach((listener) => listener());
};

const updateMockIdentityState = (status: IdentityStatus, walletAddress: string | null) => {
  if (!isMockIdentity || typeof window === "undefined") return;
  (window as typeof window & {
    __PRAGMA_IDENTITY_STATE__?: { status: IdentityStatus; wallet: string | null };
  }).__PRAGMA_IDENTITY_STATE__ = {
    status,
    wallet: walletAddress,
  };
};

let web3authInstance: Web3Auth | null = null;
let initPromise: Promise<Web3Auth> | null = null;
let walletRef: WalletWithAddress | null = null;
let bootstrapCleanup: (() => void) | null = null;
let mockApiInitialised = false;

const announceIdentity = async (walletClient: WalletWithAddress | null) => {
  if (!walletClient || isMockIdentity) {
    return;
  }

  const ownerAddress = walletClient.address;
  let delegator = getOwnerDelegator(ownerAddress);
  if (!delegator) {
    try {
      const handle = await createHybridDelegatorHandle(walletClient.walletClient, ownerAddress);
      delegator = handle.delegator;
      setOwnerDelegator(ownerAddress, delegator);
    } catch (deriveError) {
      console.warn("Failed to derive HybridDelegator address", deriveError);
    }
  }

  if (delegator) {
    setActiveDelegator(delegator, ownerAddress);
  } else if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(IDENTITY_EVENT, { detail: { delegator: null, owner: ownerAddress } }));
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("pragma:delegation:updated"));
  }
};

const initializeWeb3Auth = async (): Promise<Web3Auth> => {
  if (isMockIdentity) {
    if (identitySnapshot.status === "idle") {
      setIdentitySnapshot({ status: "ready" });
    }
    updateMockIdentityState(identitySnapshot.status, identitySnapshot.wallet?.address ?? null);
    throw new Error("Mock identity provider does not initialize Web3Auth");
  }

  if (web3authInstance) {
    return web3authInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  if (typeof window === "undefined") {
    throw new Error("Web3Auth can only be initialised in the browser");
  }

  if (identitySnapshot.status === "idle") {
    setIdentitySnapshot({ status: "initializing" });
  }

  if (!WEB3AUTH_CLIENT_ID) {
    const message = "Missing NEXT_PUBLIC_WEB3_AUTH_ID environment variable";
    setIdentitySnapshot({ status: "error", error: message });
    throw new Error(message);
  }

  if (!WEB3AUTH_NETWORK) {
    throw new Error("Missing NEXT_PUBLIC_WEB3AUTH_NETWORK environment variable");
  }

  const promise = (async () => {
    const privateKeyProvider = new EthereumPrivateKeyProvider({
      config: {
        chainConfig: {
          chainNamespace: CHAIN_NAMESPACES.EIP155,
          chainId: `0x${MONAD_CHAIN_ID.toString(16)}`,
          rpcTarget: MONAD_RPC_URL,
          displayName: "Monad Testnet",
          ticker: MONAD_NATIVE_TOKEN_SYMBOL,
          tickerName: "Monad",
        },
      },
    });

    const instance = new Web3Auth({
      clientId: WEB3AUTH_CLIENT_ID,
      web3AuthNetwork: WEB3AUTH_NETWORK as never,
      privateKeyProvider,
    });

    const openlogin = new OpenloginAdapter({
      adapterSettings: {
        uxMode: "popup",
      },
    });

    instance.configureAdapter(openlogin);

    try {
      console.log("[Web3Auth] Initializing modal with config:", {
        clientId: WEB3AUTH_CLIENT_ID.slice(0, 10) + "...",
        network: WEB3AUTH_NETWORK,
        chainId: MONAD_CHAIN_ID,
      });
      await instance.initModal();
      console.log("[Web3Auth] Modal initialized successfully");
      web3authInstance = instance;
      return instance;
    } catch (error) {
      // Check if this is a session validation error (400) from Web3Auth
      const errorMessage = error instanceof Error ? error.message : String(error);
      const is400Error = errorMessage.includes("400") || errorMessage.includes("Non-200");
      const isSessionError = errorMessage.toLowerCase().includes("session") ||
                           errorMessage.toLowerCase().includes("token") ||
                           errorMessage.toLowerCase().includes("invalid");

      if (is400Error || isSessionError) {
        // Expected error from expired/invalid Web3Auth session - handle gracefully
        console.log("[Web3Auth] Session validation failed (likely expired token), clearing state");

        // Try to clear Web3Auth's cached state
        try {
          await instance.clearCache();
        } catch (clearError) {
          // Ignore errors when clearing cache
        }

        // Set to ready state instead of error - user can reconnect
        setIdentitySnapshot({ status: "ready", error: undefined });
        web3authInstance = instance; // Store instance even if init failed
        return instance;
      }

      // Real error - log and throw
      console.error("[Web3Auth] Authorization/Initialization failed:", error);
      console.error("[Web3Auth] Please verify your Web3Auth configuration and network settings");
      throw error;
    }
  })().catch((error) => {
    initPromise = null;
    throw error;
  });

  initPromise = promise;
  return promise;
};

const ensureBootstrap = () => {
  if (bootstrapCleanup || typeof window === "undefined") {
    return bootstrapCleanup;
  }

  if (isMockIdentity) {
    if (identitySnapshot.status === "idle") {
      setIdentitySnapshot({ status: "ready" });
      updateMockIdentityState("ready", identitySnapshot.wallet?.address ?? null);
    }
    return null;
  }

  let cancelled = false;

  (async () => {
    try {
      const instance = await initializeWeb3Auth();
      if (cancelled) return;

      if (instance.provider) {
        const walletClient = await createWalletClientFromProvider(instance.provider);
        if (cancelled) return;
        walletRef = walletClient;
        setIdentitySnapshot({ status: "connected", wallet: walletClient, error: undefined });
        await announceIdentity(walletClient);
      } else {
        setIdentitySnapshot({ status: "ready" });
      }
    } catch (error) {
      if (cancelled) return;

      // Check if this is a session validation error that was already handled
      const errorMessage = error instanceof Error ? error.message : String(error);
      const is400Error = errorMessage.includes("400") || errorMessage.includes("Non-200");
      const isSessionError = errorMessage.toLowerCase().includes("session") ||
                           errorMessage.toLowerCase().includes("token");

      if (is400Error || isSessionError) {
        // Session error already handled in initializeWeb3Auth, set to ready
        console.log("[Web3Auth] Bootstrap handling session validation error gracefully");
        setIdentitySnapshot({ status: "ready", error: undefined });
      } else {
        // Real error - set error state
        const message = error instanceof Error ? error.message : String(error);
        setIdentitySnapshot({ status: "error", error: message });
      }
    }
  })();

  bootstrapCleanup = () => {
    cancelled = true;
  };

  return bootstrapCleanup;
};

const applyMockConnection = (owner: Address, delegatorOverride?: Address) => {
  const normalizedOwner = getAddress(owner);
  const walletClient = createMockWallet(normalizedOwner);
  walletRef = walletClient;
  setIdentitySnapshot({ status: "connected", wallet: walletClient, error: undefined });
  updateMockIdentityState("connected", normalizedOwner);

  const mappedDelegator = delegatorOverride
    ? getAddress(delegatorOverride)
    : getOwnerDelegator(normalizedOwner) ?? DEFAULT_MOCK_DELEGATOR;

  setOwnerDelegator(normalizedOwner, mappedDelegator);
  setActiveDelegator(mappedDelegator, normalizedOwner);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("pragma:delegation:updated"));
  }

  return walletClient;
};

const connectIdentity = async (): Promise<WalletWithAddress> => {
  if (isMockIdentity) {
    const nextConfig =
      typeof window !== "undefined"
        ? ((window as unknown as { __PRAGMA_IDENTITY_MOCK_NEXT__?: { owner?: string; delegator?: string } })
            .__PRAGMA_IDENTITY_MOCK_NEXT__ ?? null)
        : null;

    const ownerAddress = nextConfig?.owner ? getAddress(nextConfig.owner as Address) : DEFAULT_MOCK_OWNER;
    const delegatorAddress = nextConfig?.delegator
      ? getAddress(nextConfig.delegator as Address)
      : DEFAULT_MOCK_DELEGATOR;

    return applyMockConnection(ownerAddress, delegatorAddress);
  }

  try {
    const instance = web3authInstance ?? (await initializeWeb3Auth());
    web3authInstance = instance;
    setIdentitySnapshot({ status: "connecting" });
    updateMockIdentityState("connecting", walletRef?.address ?? null);

    const provider = await instance.connect();
    if (!provider) {
      throw new Error("Web3Auth connection did not return a provider");
    }

    const walletClient = await createWalletClientFromProvider(provider);
    walletRef = walletClient;
    setIdentitySnapshot({ status: "connected", wallet: walletClient, error: undefined });
    updateMockIdentityState("connected", walletClient.address);
    await announceIdentity(walletClient);
    return walletClient;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Check if user cancelled the Web3Auth modal
    const isCancelled = message.toLowerCase().includes("user closed") ||
                       message.toLowerCase().includes("user cancelled");

    if (isCancelled) {
      // User cancelled - return to ready state, don't treat as error
      console.log("[Web3Auth] User cancelled connection modal");
      setIdentitySnapshot({ status: "ready", error: undefined });
      updateMockIdentityState("ready", walletRef?.address ?? null);
      throw error; // Still throw so caller can handle if needed
    }

    // Real error - set error state
    console.error("[Web3Auth] Connection failed:", message);
    setIdentitySnapshot({ status: "error", error: message });
    updateMockIdentityState("error", walletRef?.address ?? null);
    throw error;
  }
};

const disconnectIdentity = async () => {
  if (web3authInstance) {
    try {
      await web3authInstance.logout();
      // Explicitly clear Web3Auth cache to prevent auto-reconnection
      await web3authInstance.clearCache();
    } catch (error) {
      console.warn("Web3Auth logout/clear cache failed", error);
    }
  }

  const previous = walletRef;
  walletRef = null;
  setIdentitySnapshot({ status: "ready", wallet: null });
  updateMockIdentityState("ready", null);
  clearActiveDelegator(previous?.address);
  clearOwnerDelegator(previous?.address);

  if (typeof window !== "undefined") {
    const ownerDetail = previous?.address ? { owner: previous.address } : {};
    window.dispatchEvent(new CustomEvent(IDENTITY_EVENT, { detail: { delegator: null, ...ownerDetail } }));
    window.dispatchEvent(new Event("pragma:delegation:updated"));
  }
};

const ensureMockApi = () => {
  if (!isMockIdentity || typeof window === "undefined" || mockApiInitialised) return;
  mockApiInitialised = true;

  const api = {
    connect: (owner: Address, delegator?: Address) => applyMockConnection(owner, delegator),
    disconnect: () => disconnectIdentity(),
  } satisfies {
    connect: (owner: Address, delegator?: Address) => WalletWithAddress;
    disconnect: () => Promise<void>;
  };

  (window as typeof window & { __PRAGMA_IDENTITY_MOCK__?: typeof api }).__PRAGMA_IDENTITY_MOCK__ = api;
};

export const useIdentity = () => {
  const snapshot = React.useSyncExternalStore(subscribeIdentity, getIdentitySnapshot, getIdentitySnapshot);

  React.useEffect(() => {
    ensureMockApi();
    const cleanup = ensureBootstrap();
    return () => {
      cleanup?.();
    };
  }, []);

  return {
    status: snapshot.status,
    wallet: snapshot.wallet,
    error: snapshot.error,
    connect: connectIdentity,
    disconnect: disconnectIdentity,
    web3auth: web3authInstance,
  };
};

/**
 * Get current identity snapshot (fresh state without closure staleness)
 * Useful for accessing wallet state outside React component lifecycle
 */
export { getIdentitySnapshot };
