"use client";

import * as React from "react";
import { Web3Auth } from "@web3auth/modal";
import { OpenloginAdapter } from "@web3auth/openlogin-adapter";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
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
import { createWalletClientFromProvider, type WalletWithAddress } from "../lib/clients";

export type IdentityStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "connecting"
  | "connected"
  | "error";

export const useIdentity = () => {
  const [status, setStatus] = React.useState<IdentityStatus>("idle");
  const [web3auth, setWeb3auth] = React.useState<Web3Auth | null>(null);
  const [wallet, setWallet] = React.useState<WalletWithAddress | null>(null);
  const [error, setError] = React.useState<string>();
  const web3authRef = React.useRef<Web3Auth | null>(null);
  const initPromiseRef = React.useRef<Promise<Web3Auth> | null>(null);

  const initialize = React.useCallback(async (): Promise<Web3Auth> => {
    if (web3authRef.current) {
      return web3authRef.current;
    }
    if (initPromiseRef.current) {
      return initPromiseRef.current;
    }
    if (typeof window === "undefined") {
      throw new Error("Web3Auth can only be initialised in the browser");
    }

    setStatus((current) => (current === "idle" ? "initializing" : current));

    if (!WEB3AUTH_CLIENT_ID) {
      const message = "Missing NEXT_PUBLIC_WEB3_AUTH_ID environment variable";
      setStatus("error");
      setError(message);
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
      await instance.initModal();
      web3authRef.current = instance;
      return instance;
    })().catch((err) => {
      initPromiseRef.current = null;
      throw err;
    });

    initPromiseRef.current = promise;
    return promise;
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    let cancelled = false;

    initialize()
      .then(async (instance) => {
        if (cancelled) return;
        setWeb3auth(instance);
        if (instance.provider) {
          setStatus("connected");
          const walletClient = await createWalletClientFromProvider(instance.provider);
          if (!cancelled) {
            setWallet(walletClient);
          }
        } else {
          setStatus("ready");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [initialize]);

  const connect = React.useCallback(async () => {
    try {
      const instance = web3authRef.current ?? (await initialize());
      setWeb3auth(instance);
      setStatus("connecting");
      const provider = await instance.connect();
      if (!provider) {
        throw new Error("Web3Auth connection did not return a provider");
      }
      const walletClient = await createWalletClientFromProvider(provider);
      setWallet(walletClient);
      setStatus("connected");
      return walletClient;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(web3authRef.current?.provider ? "connected" : "error");
      throw err;
    }
  }, [initialize]);

  const disconnect = React.useCallback(async () => {
    const instance = web3authRef.current;
    if (!instance) return;
    await instance.logout();
    setWallet(null);
    setStatus("ready");
  }, []);

  return {
    status,
    wallet,
    error,
    connect,
    disconnect,
    web3auth,
  };
};
