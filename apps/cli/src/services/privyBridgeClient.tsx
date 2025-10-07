import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  PrivyProvider,
  usePrivy,
  useWallets,
  useCreateWallet,
  getEmbeddedConnectedWallet,
  type ConnectedWallet,
  type EIP1193Provider,
} from "@privy-io/react-auth";
import type { Address, Hex } from "viem";
import { hashTypedData, recoverTypedDataAddress } from "viem";

const MONAD_CHAIN_ID_HEX = "0x279f"; // 10143

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ProviderRequest = {
  method: string;
  params?: unknown[];
};

type ProviderBridgeJob = {
  id: string;
  type: "provider";
  payload: ProviderRequest;
};

type SignTypedDataBridgeJob = {
  id: string;
  type: "signDelegationTypedData";
  payload: {
    typedDataJson: string;
    from: Address;
  };
};

type BridgeJob = ProviderBridgeJob | SignTypedDataBridgeJob;

type BridgeConfig = {
  state: string;
  appId: string;
  apiBaseUrl: string;
  chainId: number;
};

type ProviderWithAddress = {
  provider: EIP1193Provider;
  address: Address;
};

const usePrivyBridge = ({ config }: { config: BridgeConfig }) => {
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();

  const [status, setStatus] = useState<string>("Connecting to Privy...");
  const [error, setError] = useState<string | null>(null);
  const [providerState, setProviderState] = useState<ProviderWithAddress | null>(null);

  const loginRequestedRef = useRef(false);
  const walletCreationRequestedRef = useRef(false);
  const registeredAddressRef = useRef<Address | null>(null);
  const pollingRef = useRef(false);

  useEffect(() => {
    if (!ready || authenticated || loginRequestedRef.current) {
      return;
    }
    loginRequestedRef.current = true;
    setStatus("Launching Privy login...");
    login();
  }, [ready, authenticated, login]);

  useEffect(() => {
    if (!ready || !authenticated) {
      return;
    }
    if (!walletsReady) {
      setStatus("Fetching wallet information...");
      return;
    }

    const embedded = getEmbeddedConnectedWallet(wallets) as ConnectedWallet | null;
    const userHasEmbedded = Boolean(
      user?.linkedAccounts?.some(
        (account) =>
          account.type === "wallet" &&
          (account as { walletClientType?: string }).walletClientType?.startsWith("privy"),
      ),
    );
    if (!embedded) {
      if (userHasEmbedded) {
        setStatus("Waiting for embedded wallet to hydrate...");
        return;
      }

      if (!walletCreationRequestedRef.current) {
        walletCreationRequestedRef.current = true;
        setStatus("Creating embedded wallet...");
        createWallet().catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
        });
      } else {
        setStatus("Waiting for embedded wallet to be provisioned...");
      }
      return;
    }

    walletCreationRequestedRef.current = false;

    const connectProvider = async () => {
      try {
        setStatus("Preparing embedded wallet provider...");
        const provider = (await embedded.getEthereumProvider()) as EIP1193Provider;
        const address = embedded.address as Address;

        // Ensure Monad testnet is selected; ignore errors if already on the correct chain.
        try {
          await provider.request?.({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: MONAD_CHAIN_ID_HEX }],
          });
        } catch (switchError) {
          // If the wallet already targets Monad testnet, MetaMask-compatible providers
          // throw an error. We can safely ignore it.
        }

        setProviderState({ provider, address });
        setStatus(`Wallet ready: ${address}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      }
    };

    connectProvider();
  }, [ready, authenticated, walletsReady, wallets, createWallet, user]);

  useEffect(() => {
    if (!providerState) {
      return;
    }
    if (registeredAddressRef.current === providerState.address) {
      return;
    }

    const register = async () => {
      setStatus("Registering wallet with CLI...");
      try {
        const response = await fetch(`${config.apiBaseUrl}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: config.state, address: providerState.address }),
        });
        if (!response.ok) {
          throw new Error(`Bridge registration failed (${response.status})`);
        }
        registeredAddressRef.current = providerState.address;
        setStatus("Wallet registered. Awaiting tasks...");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      }
    };

    register();
  }, [providerState, config.apiBaseUrl, config.state]);

  useEffect(() => {
    if (!providerState || pollingRef.current || !registeredAddressRef.current) {
      return;
    }

    pollingRef.current = true;

    const poll = async () => {
      while (pollingRef.current) {
        try {
          const response = await fetch(`${config.apiBaseUrl}/tasks?state=${config.state}`);
          if (response.status === 204) {
            await sleep(400);
            continue;
          }
          if (!response.ok) {
            throw new Error(`Bridge task fetch failed (${response.status})`);
          }

          const job = (await response.json()) as BridgeJob;
          await handleJob({
            job,
            provider: providerState.provider,
            address: providerState.address,
            config,
            setStatus,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          pollingRef.current = false;
        }
      }
    };

    poll();

    return () => {
      pollingRef.current = false;
    };
  }, [providerState, config, config.state, config.apiBaseUrl]);

  return { status, error };
};

type HandleJobArgs = {
  job: BridgeJob;
  provider: EIP1193Provider;
  address: Address;
  config: BridgeConfig;
  setStatus: (status: string) => void;
};

const handleJob = async ({ job, provider, address, config, setStatus }: HandleJobArgs) => {
  const executeRequest = async (args: unknown): Promise<any> => {
    if (typeof provider.request !== "function") {
      throw new Error("Connected wallet does not expose an EIP-1193 request handler");
    }
    return provider.request.call(provider, args as any);
  };

  const submit = async (result: unknown, error?: { message: string }) => {
    const payload = {
      state: config.state,
      jobId: job.id,
      result,
      error,
    };

    await fetch(`${config.apiBaseUrl}/task-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  };

  try {
    switch (job.type) {
      case "provider": {
        setStatus("Processing wallet request...");
        const result = await executeRequest(job.payload);
        await submit(result ?? null);
        setStatus("Awaiting CLI instructions...");
        return;
      }
      case "signDelegationTypedData": {
        setStatus("Awaiting typed data signature in Privy modal...");
        const { typedDataJson, from } = job.payload;

        const obtainSignature = async (): Promise<Hex> => {
          const attempt = async () =>
            await executeRequest({
              method: "eth_signTypedData_v4",
              params: [from, typedDataJson],
            });

          try {
            const signatureResult = await attempt();
            const signatureRaw =
              typeof signatureResult === "string"
                ? signatureResult
                : (signatureResult?.data as string | undefined);

            if (!signatureRaw || typeof signatureRaw !== "string") {
              throw new Error("Delegation signature request did not return a signature string");
            }
            return signatureRaw as Hex;
          } catch (primaryError) {
            // Attempt low-level secp256k1 signing as a fallback (Privy-only helpers expose this).
            try {
              const parsed = JSON.parse(typedDataJson);
              const digest = hashTypedData({
                domain: parsed.domain,
                types: parsed.types,
                primaryType: parsed.primaryType,
                message: parsed.message,
              });

              const fallbackResult = await executeRequest({
                method: "secp256k1_sign",
                params: [digest],
              });

              const signatureRaw =
                typeof fallbackResult === "string"
                  ? fallbackResult
                  : (fallbackResult?.data as string | undefined);

              if (!signatureRaw || typeof signatureRaw !== "string") {
                throw new Error("secp256k1_sign did not return a signature string");
              }

              return signatureRaw as Hex;
            } catch (fallbackError) {
              const message =
                fallbackError instanceof Error ? fallbackError.message : String(fallbackError ?? "");
              const combined = primaryError instanceof Error ? primaryError.message : String(primaryError ?? "");
              throw new Error(`Typed data signing failed: ${combined}. Fallback: ${message}`);
            }
          }
        };

        const signature = await obtainSignature();

        let recoveredAddress: Address | null = null;
        try {
          const parsed = JSON.parse(typedDataJson);
          const recovered = await recoverTypedDataAddress({
            domain: parsed.domain,
            types: parsed.types,
            primaryType: parsed.primaryType,
            message: parsed.message,
            signature,
          });
          recoveredAddress = recovered as Address;
        } catch (recoveryError) {
          console.warn("Failed to recover address from delegation signature", recoveryError);
        }

        await submit({ signature, recoveredAddress: recoveredAddress ?? address });
        setStatus("Delegation signed. Awaiting CLI instructions...");
        return;
      }
      default: {
        await submit(null, { message: `Unsupported job type: ${(job as BridgeJob).type}` });
        return;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await submit(null, { message });
  }
};

const BridgeApp = ({ config }: { config: BridgeConfig }) => {
  const { status, error } = usePrivyBridge({ config });

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", padding: "32px", maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "8px" }}>Pragma Privy Bridge</h1>
      <p style={{ marginBottom: "16px", color: "#4b5563" }}>
        Keep this window open while the CLI completes wallet onboarding. Follow any prompts that
        appear in the Privy modal.
      </p>
      <div
        style={{
          background: "#f3f4f6",
          borderRadius: "12px",
          padding: "16px",
          border: "1px solid #e5e7eb",
        }}
      >
        <strong>Status:</strong>
        <div>{status}</div>
      </div>
      {error ? (
        <div
          style={{
            marginTop: "16px",
            padding: "16px",
            borderRadius: "12px",
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            color: "#b91c1c",
          }}
        >
          <strong>Something went wrong</strong>
          <div>{error}</div>
          <div style={{ marginTop: "8px", fontSize: "13px" }}>
            You can close this window and rerun the CLI command after resolving the issue.
          </div>
        </div>
      ) : null}
    </div>
  );
};

const PrivyBridgeRoot = () => {
  const config = (window as any).__PRIVY_BRIDGE_CONFIG__ as BridgeConfig | undefined;

  if (!config) {
    return (
      <div style={{ fontFamily: "system-ui", padding: "32px" }}>
        <h1>Missing configuration</h1>
        <p>The bridge could not locate its configuration payload. Relaunch the CLI command.</p>
      </div>
    );
  }

  return (
    <PrivyProvider appId={config.appId}>
      <BridgeApp config={config} />
    </PrivyProvider>
  );
};

const container = document.getElementById("app");
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <PrivyBridgeRoot />
    </StrictMode>,
  );
}
