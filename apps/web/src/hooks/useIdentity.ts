"use client";

import * as React from "react";
import { Web3Auth } from "@web3auth/modal";
import { OpenloginAdapter } from "@web3auth/openlogin-adapter";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import { createWalletClient, custom, getAddress, type Address, type Hex } from "viem";
import { createLogger } from "@pragma/core";

const logger = createLogger("[Web3Auth]");

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
import { setIdToken, clearIdToken } from "../lib/api/authenticatedFetch";
import { useH2ChatStore } from "../stores/useH2ChatStore";

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

// Timeout constants
const CONNECTION_TIMEOUT_MS = 60000; // 60 seconds for Web3Auth modal
const API_TIMEOUT_MS = 10000; // 10 seconds for API/RPC calls

/**
 * Wraps a promise with a timeout to prevent infinite hangs
 */
const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  errorMessage: string
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

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
      logger.warn("Failed to derive HybridDelegator address", deriveError);
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
      await instance.initModal();
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
      logger.error("Authorization/Initialization failed:", error);
      logger.error("Please verify your Web3Auth configuration and network settings");
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
      // NOTE: We intentionally do NOT check `cancelled` here.
      // React StrictMode in dev causes mount/unmount/remount, which sets cancelled=true.
      // But the bootstrapCleanup guard prevents new bootstraps, so we must let this one complete.
      // State updates are idempotent - safe to run even after component unmount.

      if (instance.provider) {
        const walletClient = await withTimeout(
          createWalletClientFromProvider(instance.provider),
          API_TIMEOUT_MS,
          "Timeout creating wallet client. Please check your network connection."
        );
        walletRef = walletClient;

        // Retrieve and store Web3Auth ID token for existing session
        try {
          const userInfo = await withTimeout(
            instance.getUserInfo(),
            API_TIMEOUT_MS,
            "Timeout retrieving user info"
          );
          if (userInfo.idToken) {
            setIdToken(userInfo.idToken);
            useH2ChatStore.getState().setTokenReady(true);
          }
        } catch (tokenError) {
          logger.warn('Could not retrieve ID token from existing session:', tokenError);
        }

        setIdentitySnapshot({ status: "connected", wallet: walletClient, error: undefined });
        // announceIdentity is non-fatal - wrap with timeout but don't fail connection
        await withTimeout(
          announceIdentity(walletClient),
          API_TIMEOUT_MS,
          "Timeout announcing identity"
        ).catch(err => {
          logger.warn("announceIdentity timed out:", err);
        });
      } else {
        setIdentitySnapshot({ status: "ready" });
      }
    } catch (error) {
      // Don't check cancelled - let error handling complete for better UX

      // Check if this is a session validation error that was already handled
      const errorMessage = error instanceof Error ? error.message : String(error);
      const is400Error = errorMessage.includes("400") || errorMessage.includes("Non-200");
      const isSessionError = errorMessage.toLowerCase().includes("session") ||
                           errorMessage.toLowerCase().includes("token");

      if (is400Error || isSessionError) {
        // Session error already handled in initializeWeb3Auth, set to ready
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

    const provider = await withTimeout(
      instance.connect(),
      CONNECTION_TIMEOUT_MS,
      "Connection timed out. Please check your network and try again."
    );
    if (!provider) {
      throw new Error("Web3Auth connection did not return a provider");
    }

    const walletClient = await withTimeout(
      createWalletClientFromProvider(provider),
      API_TIMEOUT_MS,
      "Timeout creating wallet client. Please check your network connection."
    );
    walletRef = walletClient;

    // Retrieve and store Web3Auth ID token for API authentication
    try {
      const userInfo = await withTimeout(
        instance.getUserInfo(),
        API_TIMEOUT_MS,
        "Timeout retrieving user info"
      );
      if (userInfo.idToken) {
        setIdToken(userInfo.idToken);
        useH2ChatStore.getState().setTokenReady(true);
      } else {
        logger.warn('No ID token returned from getUserInfo');
      }
    } catch (tokenError) {
      logger.error('Failed to retrieve ID token:', tokenError);
      // Continue without token - API calls will fail auth but connection succeeds
    }

    setIdentitySnapshot({ status: "connected", wallet: walletClient, error: undefined });
    updateMockIdentityState("connected", walletClient.address);
    // announceIdentity is non-fatal - wrap with timeout but don't fail connection
    await withTimeout(
      announceIdentity(walletClient),
      API_TIMEOUT_MS,
      "Timeout announcing identity"
    ).catch(err => {
      logger.warn("announceIdentity timed out:", err);
    });
    return walletClient;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Check if user cancelled the Web3Auth modal
    const isCancelled = message.toLowerCase().includes("user closed") ||
                       message.toLowerCase().includes("user cancelled");

    if (isCancelled) {
      // User cancelled - return to ready state, don't treat as error
      setIdentitySnapshot({ status: "ready", error: undefined });
      updateMockIdentityState("ready", walletRef?.address ?? null);
      throw error; // Still throw so caller can handle if needed
    }

    // Real error - set error state
    logger.error("Connection failed:", message);
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
      logger.warn("Logout/clear cache failed", error);
    }
  }

  // Clear ID token on logout
  clearIdToken();
  useH2ChatStore.getState().setTokenReady(false);

  // Clear wallet balance data (prevents stale balance showing after disconnect)
  useH2ChatStore.getState().setWalletBalance({
    monBalance: '0',
    usdValue: 0,
    change24h: 0,
    allTokens: [],
  });
  useH2ChatStore.getState().setBalanceError(null);

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
