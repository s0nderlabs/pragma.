import http from "node:http";
import { randomBytes } from "node:crypto";
import type { Address, Hex } from "viem";

const ZERO_SALT = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

import {
  WEB3AUTH_CLIENT_ID,
  WEB3AUTH_NETWORK,
  MONAD_EXECUTION_RPC_URL,
  WEB3AUTH_BRIDGE_PORT,
} from "./config.js";

type ProviderRequest = {
  method: string;
  params?: unknown[];
};

type ProviderBridgeJob = {
  id: string;
  type: "provider";
  payload: ProviderRequest;
};

type StatusBridgeJob = {
  id: string;
  type: "statelessDelegatorStatus";
  payload: StatelessDelegatorStatusPayload;
};

type UpgradeBridgeJob = {
  id: string;
  type: "statelessDelegatorUpgrade";
  payload: StatelessDelegatorUpgradePayload;
};

type DelegationBridgeJob = {
  id: string;
  type: "statelessDelegatorSignDelegation";
  payload: StatelessDelegatorDelegationPayload;
};

type SignTypedDataBridgeJob = {
  id: string;
  type: "signDelegationTypedData";
  payload: SignDelegationTypedDataPayload;
};

type CloseBridgeJob = {
  id: string;
  type: "close";
};

type ProviderJob =
  | ProviderBridgeJob
  | StatusBridgeJob
  | UpgradeBridgeJob
  | DelegationBridgeJob
  | SignTypedDataBridgeJob
  | CloseBridgeJob;

type ProviderJobRequest =
  | Omit<ProviderBridgeJob, "id">
  | Omit<StatusBridgeJob, "id">
  | Omit<UpgradeBridgeJob, "id">
  | Omit<DelegationBridgeJob, "id">
  | Omit<SignTypedDataBridgeJob, "id">
  | Omit<CloseBridgeJob, "id">;

type PendingJob = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export type Web3AuthBridge = {
  waitForWallet: () => Promise<{ address: Address }>;
  request: <T = unknown>(job: ProviderRequest) => Promise<T>;
  enqueueDelegatorStatus: (payload: StatelessDelegatorStatusPayload) => Promise<StatelessDelegatorStatusResult>;
  enqueueDelegatorUpgrade: (payload: StatelessDelegatorUpgradePayload) => Promise<StatelessDelegatorUpgradeResult>;
  enqueueDelegatorDelegation: (payload: StatelessDelegatorDelegationPayload) => Promise<StatelessDelegatorDelegationResult>;
  signTypedData: (payload: SignDelegationTypedDataPayload) => Promise<SignDelegationTypedDataResult>;
  shutdown: () => Promise<void>;
};

export type StatelessDelegatorStatusPayload = {
  chainId: number;
  rpcUrl: string;
};

export type StatelessDelegatorStatusResult = {
  upgraded: boolean;
  statelessDelegator?: Address;
};

export type StatelessDelegatorUpgradePayload = {
  chainId: number;
  rpcUrl: string;
  rootScope: unknown;
  rootCaveats?: unknown;
  delegationManager: Address;
};

export type StatelessDelegatorUpgradeResult = {
  statelessDelegator: Address;
  ownerDelegation: {
    delegate: Address;
    delegator: Address;
    authority: Hex;
    caveats: Array<{ enforcer: Address; terms: Hex; args: Hex }>;
    salt: Hex;
    signature: Hex;
  };
};

export type StatelessDelegatorDelegationPayload = {
  chainId: number;
  rpcUrl: string;
  statelessDelegator: Address;
  sessionDelegate: Address;
  scope: unknown;
  caveats: unknown;
  issuedAt: number;
  expiresAt: number;
  nonce: Hex;
  parentDelegation: {
    delegate: Address;
    delegator: Address;
    authority: Hex;
    caveats: Array<{ enforcer: Address; terms: Hex; args: Hex }>;
    salt: Hex;
    signature: Hex;
  };
};

export type StatelessDelegatorDelegationResult = {
  delegation: {
    delegate: Address;
    delegator: Address;
    authority: Hex;
    caveats: Array<{ enforcer: Address; terms: Hex; args: Hex }>;
    salt: Hex;
    signature: Hex;
  };
};

export type SignDelegationTypedDataPayload = {
  typedDataJson: string;
  from: Address;
};

export type SignDelegationTypedDataResult = {
  signature: Hex;
  recoveredAddress: Address;
};

type Web3AuthBridgeOptions = {
  authMode?: "web3auth" | "metamask";
};

export const startWeb3AuthBridge = (
  onReady: (url: string, state: string) => void | Promise<void>,
  options?: Web3AuthBridgeOptions,
): Web3AuthBridge => {
  const authMode: "web3auth" | "metamask" = options?.authMode ?? "web3auth";
  const state = randomBytes(16).toString("hex");
  const jobQueue: ProviderJob[] = [];
  const pendingJobs = new Map<string, PendingJob>();

  let server: http.Server | undefined;
  let walletAddress: Address | undefined;
  let walletResolve: ((value: { address: Address }) => void) | undefined;
  let walletReject: ((reason?: unknown) => void) | undefined;
  let shuttingDown = false;

  const walletPromise = new Promise<{ address: Address }>((resolve, reject) => {
    walletResolve = resolve;
    walletReject = reject;
  });

  const failAllJobs = (error: unknown) => {
    pendingJobs.forEach(({ reject }) => {
      reject(error);
    });
    pendingJobs.clear();
  };

  const handleError = (error: unknown) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    failAllJobs(error);
    walletReject?.(error);
    if (server) {
      server.close();
    }
  };

  const enqueueJob = <T,>(job: ProviderJobRequest): Promise<T> => {
    const jobId = randomBytes(16).toString("hex");
    return new Promise<T>((resolve, reject) => {
      pendingJobs.set(jobId, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      jobQueue.push({ id: jobId, ...job } as ProviderJob);
    });
  };

  const enqueueProviderRequest = <T,>(request: ProviderRequest) =>
    enqueueJob<T>({ type: "provider", payload: request });

  const enqueueStatelessDelegatorStatus = (payload: StatelessDelegatorStatusPayload) =>
    enqueueJob<StatelessDelegatorStatusResult>({ type: "statelessDelegatorStatus", payload });

  const enqueueStatelessDelegatorUpgrade = (payload: StatelessDelegatorUpgradePayload) =>
    enqueueJob<StatelessDelegatorUpgradeResult>({
      type: "statelessDelegatorUpgrade",
      payload,
    });

  const enqueueStatelessDelegatorDelegation = (payload: StatelessDelegatorDelegationPayload) =>
    enqueueJob<StatelessDelegatorDelegationResult>({
      type: "statelessDelegatorSignDelegation",
      payload,
    });

  const enqueueSignDelegationTypedData = (payload: SignDelegationTypedDataPayload) =>
    enqueueJob<SignDelegationTypedDataResult>({
      type: "signDelegationTypedData",
      payload,
    });

  const requestListener: http.RequestListener = async (req, res) => {
    try {
      const url = new URL(req.url ?? "", "http://localhost");

      if (req.method === "GET" && url.pathname === "/auth") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(renderAuthPage(state, authMode));
        return;
      }

      if (req.method === "POST" && url.pathname === "/register") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          try {
            const parsed = JSON.parse(body ?? "{}");
            if (parsed?.state !== state) {
              res.writeHead(400);
              res.end("Invalid state");
              return;
            }

            const address = parsed?.address as string | undefined;
            if (!address) {
              res.writeHead(400);
              res.end("Missing address");
              return;
            }

            walletAddress = address as Address;
            walletResolve?.({ address: walletAddress });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          } catch (error) {
            res.writeHead(500);
            res.end("Invalid payload");
            handleError(error);
          }
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/tasks") {
        if (url.searchParams.get("state") !== state) {
          res.writeHead(400);
          res.end("Invalid state");
          return;
        }

        const job = jobQueue.shift();
        if (!job) {
          res.writeHead(204);
          res.end();
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(job));
        return;
      }

      if (req.method === "POST" && url.pathname === "/task-result") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          try {
            const parsed = JSON.parse(body ?? "{}");
            if (parsed?.state !== state) {
              res.writeHead(400);
              res.end("Invalid state");
              return;
            }

            const { jobId, result, error } = parsed ?? {};
            if (!jobId || !pendingJobs.has(jobId)) {
              res.writeHead(404);
              res.end("Unknown job");
              return;
            }

            const pending = pendingJobs.get(jobId);
            pendingJobs.delete(jobId);

            if (error) {
              const err = new Error(error?.message ?? "Provider request failed");
              (err as Error & { code?: unknown }).code = error?.code;
              pending?.reject(err);
            } else {
              pending?.resolve(result);
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          } catch (error) {
            res.writeHead(500);
            res.end("Invalid payload");
            handleError(error);
          }
        });
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    } catch (error) {
      res.writeHead(500);
      res.end("Server error");
      handleError(error);
    }
  };

  server = http.createServer((req, res) => {
    Promise.resolve(requestListener(req, res)).catch(handleError);
  });

  server.once("error", (error: NodeJS.ErrnoException) => {
    if (WEB3AUTH_BRIDGE_PORT && error.code === "EADDRINUSE") {
      console.error(
        `Web3Auth bridge port ${WEB3AUTH_BRIDGE_PORT} is already in use. Close the existing process or set WEB3AUTH_BRIDGE_PORT to a free port.`,
      );
    }
    handleError(error);
  });

  const bridgeHost = "localhost";
  const requestedPort = WEB3AUTH_BRIDGE_PORT ?? 0;

  server.listen(requestedPort, bridgeHost, async () => {
    const addressInfo = server?.address();
    if (!addressInfo || typeof addressInfo !== "object") {
      handleError(new Error("Web3Auth bridge failed to bind to a port"));
      return;
    }
    const url = `http://${bridgeHost}:${addressInfo.port}/auth`;
    try {
      await onReady(url, state);
    } catch (error) {
      handleError(error);
    }
  });

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    if (walletAddress) {
      try {
        await enqueueJob({ type: "close" });
      } catch (error) {
        // Ignore errors here; shutdown will proceed regardless.
      }
    }
    failAllJobs(new Error("Web3Auth bridge shut down"));
    if (!walletAddress) {
      walletReject?.(new Error("Web3Auth bridge shut down"));
    }
    await new Promise<void>((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
  };

  return {
    waitForWallet: () => walletPromise,
    request: (job) => enqueueProviderRequest(job),
    enqueueDelegatorStatus: (payload) => enqueueStatelessDelegatorStatus(payload),
    enqueueDelegatorUpgrade: (payload) => enqueueStatelessDelegatorUpgrade(payload),
    enqueueDelegatorDelegation: (payload) => enqueueStatelessDelegatorDelegation(payload),
    signTypedData: (payload) => enqueueSignDelegationTypedData(payload),
    shutdown,
  };
};

const renderAuthPage = (state: string, authMode: "web3auth" | "metamask") => {
  if (authMode === "metamask") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Pragma MetaMask Bridge</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
      #status { max-width: 320px; text-align: center; }
      button { padding: 12px 16px; font-size: 16px; }
    </style>
  </head>
  <body>
    <div id="status">
      <h2>Pragma MetaMask</h2>
      <p>Connect MetaMask to sign the delegation request.</p>
      <button id="connect">Connect MetaMask</button>
      <p id="message"></p>
    </div>
    <script>
      const state = ${JSON.stringify(state)};
      const defaultRpcUrl = ${JSON.stringify(MONAD_EXECUTION_RPC_URL)};
      const desiredChainId = "0x279f";

      const setStatus = (text, isError = false) => {
        const message = document.getElementById("message");
        message.textContent = text;
        message.style.color = isError ? "red" : "inherit";
      };

      const ensureTargetChain = async (provider) => {
        const chainId = await provider.request({ method: "eth_chainId" });
        if (chainId === desiredChainId) return;

        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: desiredChainId }],
          });
        } catch (switchError) {
          if (switchError?.code === 4902 || switchError?.code === -32603) {
            await provider.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: desiredChainId,
                chainName: "Monad Testnet",
                rpcUrls: [defaultRpcUrl],
                nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
                blockExplorerUrls: ["https://testnet-explorer.monad.xyz"],
              }],
            });
            await provider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: desiredChainId }],
            });
          } else {
            throw switchError;
          }
        }
      };

      let libraryPromise;
      const loadLibraries = async () => {
        if (!libraryPromise) {
          libraryPromise = Promise.all([
            import("https://esm.sh/viem@2.7.9?bundle"),
            import("https://esm.sh/@metamask/delegation-toolkit@0.13.0?bundle"),
          ]).then(([viem, toolkit]) => ({ viem, toolkit }));
        }
        return libraryPromise;
      };

      const createChainConfig = (chainId, rpcUrl) => ({
        id: chainId,
        name: "chain-" + chainId,
        network: "chain-" + chainId,
        nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      });

      const connectButton = document.getElementById("connect");
      connectButton.addEventListener("click", async () => {
        connectButton.disabled = true;
        setStatus("Connecting to MetaMask...");

        try {
          const provider = window.ethereum;
          if (!provider) {
            throw new Error("MetaMask provider not found. Please install MetaMask.");
          }

          await provider.request({ method: "eth_requestAccounts" });
          await ensureTargetChain(provider);

          const accounts = await provider.request({ method: "eth_accounts" });
          const address = accounts?.[0];
          if (!address) {
            throw new Error("No account returned");
          }

          await fetch("/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state, address }),
          });

          setStatus("Connected. Keep this window open to approve requests.");

          const { viem, toolkit } = await loadLibraries();

          const createClients = async (chainId, rpcUrl) => {
            const effectiveRpc = rpcUrl ?? defaultRpcUrl;
            const chain = createChainConfig(chainId, effectiveRpc);
            const publicClient = viem.createPublicClient({
              chain,
              transport: viem.http(effectiveRpc),
            });
            const walletClient = viem.createWalletClient({
              chain,
              transport: viem.custom(provider),
              account: address,
            });
            return { viem, toolkit, chain, publicClient, walletClient, ownerAddress: address };
          };

          const handleStatelessDelegatorStatus = async (payload) => {
            const { toolkit, publicClient, walletClient } = await createClients(
              payload.chainId,
              payload.rpcUrl,
            );
            const environment = toolkit.getDeleGatorEnvironment(payload.chainId);
            const smartAccount = await toolkit.toMetaMaskSmartAccount({
              client: publicClient,
              implementation: toolkit.Implementation.Stateless7702,
              address,
              signer: { walletClient },
              environment,
            });
            const deployed = await smartAccount.isDeployed();
            if (!deployed) {
              return { upgraded: false };
            }
            const statelessDelegator = await smartAccount.getAddress();
            return { upgraded: true, statelessDelegator };
          };

          const buildDelegationTypedData = (delegation, chainId, verifyingContract) => {
            const caveatList = Array.isArray(delegation.caveats) ? delegation.caveats : [];
            const caveats = caveatList.map((caveat) => ({
              enforcer: viem.getAddress(caveat.enforcer),
              terms: caveat.terms,
            }));
            const authority =
              delegation.authority && delegation.authority !== "0x"
                ? delegation.authority
                : toolkit.ROOT_AUTHORITY;
            const saltSource = delegation.salt ?? "0x";
            const saltBigInt = saltSource === "0x" ? 0n : BigInt(saltSource);
            return {
              domain: {
                chainId,
                name: "DelegationManager",
                version: "1",
                verifyingContract,
              },
              types: {
                Caveat: [
                  { name: "enforcer", type: "address" },
                  { name: "terms", type: "bytes" },
                ],
                Delegation: [
                  { name: "delegate", type: "address" },
                  { name: "delegator", type: "address" },
                  { name: "authority", type: "bytes32" },
                  { name: "caveats", type: "Caveat[]" },
                  { name: "salt", type: "uint256" },
                ],
              },
              primaryType: "Delegation",
              message: {
                delegate: viem.getAddress(delegation.delegate),
                delegator: viem.getAddress(delegation.delegator),
                authority,
                caveats,
                salt: saltBigInt.toString(),
              },
            };
          };

          const polynomials = { createClients, buildDelegationTypedData, handleStatelessDelegatorStatus };

          const poll = async () => {
            for (;;) {
              try {
                const res = await fetch(
                  "/tasks?state=" + encodeURIComponent(state),
                  { cache: "no-store" },
                );
                if (res.status === 204) {
                  await new Promise((resolve) => setTimeout(resolve, 500));
                  continue;
                }
                if (!res.ok) {
                  const message = await res.text();
                  throw new Error(message || "Failed to fetch task");
                }
                const job = await res.json();
                let result;
                let error;
                try {
                  if (job.type === "close") {
                    await fetch("/task-result", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ state, jobId: job.id, result: { acknowledged: true } }),
                    });
                    setTimeout(() => window.close(), 100);
                    return;
                  } else if (job.type === "provider") {
                    result = await provider.request(job.payload);
                  } else if (job.type === "statelessDelegatorStatus") {
                    setStatus("Checking 7702 upgrade status...");
                    const { handleStatelessDelegatorStatus } = polynomials;
                    result = await handleStatelessDelegatorStatus(job.payload);
                  } else if (job.type === "statelessDelegatorUpgrade") {
                    setStatus("Authorizing 7702 upgrade...");
                    const { createClients, buildDelegationTypedData } = polynomials;
                    const { toolkit, publicClient, walletClient } = await createClients(
                      job.payload.chainId,
                      job.payload.rpcUrl,
                    );
                    const environment = toolkit.getDeleGatorEnvironment(job.payload.chainId);
                    const smartAccount = await toolkit.toMetaMaskSmartAccount({
                      client: publicClient,
                      implementation: toolkit.Implementation.Stateless7702,
                      address,
                      signer: { walletClient },
                      environment,
                    });
                    const statelessDelegator = await smartAccount.getAddress();
                    const ownerDelegation = toolkit.createDelegation({
                      environment,
                      scope: job.payload.rootScope,
                      caveats: job.payload.rootCaveats,
                      from: address,
                      to: statelessDelegator,
                      salt: ZERO_SALT,
                    });
                    ownerDelegation.caveats = ownerDelegation.caveats ?? [];
                    const { signature: _ownerSignature, ...delegationToSign } = ownerDelegation;
                    const signature = await toolkit.signDelegation(walletClient, {
                      delegation: {
                        ...delegationToSign,
                        caveats: delegationToSign.caveats ?? [],
                      },
                      delegationManager: job.payload.delegationManager,
                      chainId: job.payload.chainId,
                    });
                    result = {
                      statelessDelegator,
                      ownerDelegation: {
                        ...ownerDelegation,
                        signature,
                      },
                    };
                  } else if (job.type === "statelessDelegatorSignDelegation") {
                    setStatus("Signing delegation...");
                    const { createClients } = polynomials;
                    const { toolkit, publicClient, walletClient } = await createClients(
                      job.payload.chainId,
                      job.payload.rpcUrl,
                    );
                    const environment = toolkit.getDeleGatorEnvironment(job.payload.chainId);
                    const smartAccount = await toolkit.toMetaMaskSmartAccount({
                      client: publicClient,
                      implementation: toolkit.Implementation.Stateless7702,
                      address,
                      signer: { walletClient },
                      environment,
                    });
                    const sessionDelegation = toolkit.createDelegation({
                      environment,
                      scope: job.payload.scope,
                      from: job.payload.statelessDelegator,
                      to: job.payload.sessionDelegate,
                      caveats: job.payload.caveats,
                      parentDelegation: job.payload.parentDelegation,
                      salt: ZERO_SALT,
                    });
                    sessionDelegation.caveats = sessionDelegation.caveats ?? [];
                    const { signature: _ignored, ...delegationForSigning } = sessionDelegation;
                    const signature = await smartAccount.signDelegation({
                      delegation: delegationForSigning,
                      chainId: job.payload.chainId,
                    });
                    result = {
                      delegation: {
                        ...sessionDelegation,
                        signature,
                      },
                    };
                  } else {
                    throw new Error("Unknown job type: " + job.type);
                  }
                } catch (err) {
                  const message = err?.message ?? "Provider request failed";
                  const code = err?.code;
                  error = { message, code };
                  console.error("Provider request error", err);
                }
                await fetch("/task-result", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ state, jobId: job.id, result, error }),
                });
                if (error) {
                  setStatus("A signature request failed. Check the CLI window.", true);
                } else {
                  setStatus("Request completed. Awaiting next action...");
                }
              } catch (err) {
                console.error("Polling error", err);
                setStatus("Connection lost. Retrying...", true);
                await new Promise((resolve) => setTimeout(resolve, 1500));
              }
            }
          };

          poll();
        } catch (error) {
          console.error(error);
          connectButton.disabled = false;
          setStatus(error?.message ?? "Failed to connect", true);
        }
      });
    </script>
  </body>
</html>`;
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Pragma Web3Auth</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
      #status { max-width: 320px; text-align: center; }
      button { padding: 12px 16px; font-size: 16px; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/@web3auth/modal@10.3.1/dist/modal.umd.min.js"></script>
  </head>
  <body>
    <div id="status">
      <h2>Pragma Web3Auth</h2>
      <p>Connect your wallet to sign the delegation request.</p>
      <button id="connect">Connect Wallet</button>
      <p id="message"></p>
    </div>
    <script>
      const state = ${JSON.stringify(state)};
      const clientId = ${JSON.stringify(WEB3AUTH_CLIENT_ID)};
      const web3AuthNetwork = ${JSON.stringify(WEB3AUTH_NETWORK)};

      const desiredChainId = "0x279f";
      const defaultRpcUrl = ${JSON.stringify(MONAD_EXECUTION_RPC_URL)};

      const setStatus = (text, isError = false) => {
        const message = document.getElementById("message");
        message.textContent = text;
        message.style.color = isError ? "red" : "inherit";
      };

      const ensureTargetChain = async (provider) => {
        const chainId = await provider.request({ method: "eth_chainId" });
        if (chainId === desiredChainId) return;

        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: desiredChainId }],
          });
        } catch (switchError) {
          if (switchError?.code === 4902 || switchError?.code === -32603) {
            await provider.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: desiredChainId,
                chainName: "Monad Testnet",
                rpcUrls: [defaultRpcUrl],
                nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
                blockExplorerUrls: ["https://testnet-explorer.monad.xyz"],
              }],
            });
            await provider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: desiredChainId }],
            });
          } else {
            throw switchError;
          }
        }
      };

      let libraryPromise;
      const loadLibraries = async () => {
        if (!libraryPromise) {
          libraryPromise = Promise.all([
            import("https://esm.sh/viem@2.7.9?bundle"),
            import("https://esm.sh/@metamask/delegation-toolkit@0.13.0?bundle"),
          ]).then(([viem, toolkit]) => ({ viem, toolkit }));
        }
        return libraryPromise;
      };

      const createChainConfig = (chainId, rpcUrl) => ({
        id: chainId,
        name: "chain-" + chainId,
        network: "chain-" + chainId,
        nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      });

      const buildDelegationTypedData = (delegation, chainId, verifyingContract, viem, toolkit) => {
        const caveatList = Array.isArray(delegation.caveats) ? delegation.caveats : [];
        const caveats = caveatList.map((caveat) => ({
          enforcer: viem.getAddress(caveat.enforcer),
          terms: caveat.terms,
        }));
        const authority =
          delegation.authority && delegation.authority !== "0x"
            ? delegation.authority
            : toolkit.ROOT_AUTHORITY;
        const saltSource = delegation.salt ?? "0x";
        const saltBigInt = saltSource === "0x" ? 0n : BigInt(saltSource);
        return {
          domain: {
            chainId,
            name: "DelegationManager",
            version: "1",
            verifyingContract,
          },
          types: {
            Caveat: [
              { name: "enforcer", type: "address" },
              { name: "terms", type: "bytes" },
            ],
            Delegation: [
              { name: "delegate", type: "address" },
              { name: "delegator", type: "address" },
              { name: "authority", type: "bytes32" },
              { name: "caveats", type: "Caveat[]" },
              { name: "salt", type: "uint256" },
            ],
          },
          primaryType: "Delegation",
          message: {
            delegate: viem.getAddress(delegation.delegate),
            delegator: viem.getAddress(delegation.delegator),
            authority,
            caveats,
            salt: saltBigInt.toString(),
          },
        };
      };

      const createClients = async (provider, chainId, rpcUrl) => {
        const { viem, toolkit } = await loadLibraries();
        const effectiveRpc = rpcUrl ?? defaultRpcUrl;
        const chain = createChainConfig(chainId, effectiveRpc);
        const publicClient = viem.createPublicClient({
          chain,
          transport: viem.http(effectiveRpc),
        });
        const baseWalletClient = viem.createWalletClient({
          chain,
          transport: viem.custom(provider),
        });
        const [ownerAddress] = await baseWalletClient.getAddresses();
        if (!ownerAddress) {
          throw new Error("No account returned");
        }
        const walletClient = viem.createWalletClient({
          chain,
          transport: viem.custom(provider),
          account: ownerAddress,
        });
        return { viem, toolkit, chain, publicClient, walletClient, ownerAddress };
      };

      const handleStatelessDelegatorUpgrade = async (provider, payload) => {
        const { viem, toolkit, publicClient, walletClient, ownerAddress } = await createClients(
          provider,
          payload.chainId,
          payload.rpcUrl,
        );
        const environment = toolkit.getDeleGatorEnvironment(payload.chainId);
        const smartAccount = await toolkit.toMetaMaskSmartAccount({
          client: publicClient,
          implementation: toolkit.Implementation.Stateless7702,
          address: ownerAddress,
          signer: { walletClient },
          environment,
        });
        const statelessDelegator = await smartAccount.getAddress();
        return {
          statelessDelegator,
        };
      };

      const handleStatelessDelegatorDelegation = async (provider, payload) => {
        console.log("[bridge] session scope payload", JSON.stringify(payload.scope));
        const { viem, toolkit, publicClient, walletClient, ownerAddress } = await createClients(
          provider,
          payload.chainId,
          payload.rpcUrl,
        );
        const environment = toolkit.getDeleGatorEnvironment(payload.chainId);
        const smartAccount = await toolkit.toMetaMaskSmartAccount({
          client: publicClient,
          implementation: toolkit.Implementation.Stateless7702,
          address: ownerAddress,
          signer: { walletClient },
          environment,
        });
        const sessionDelegation = toolkit.createDelegation({
          environment,
          scope: payload.scope,
          from: payload.statelessDelegator,
          to: payload.sessionDelegate,
          caveats: payload.caveats,
          parentDelegation: payload.parentDelegation,
          salt: ZERO_SALT,
        });
        const { signature: _unused, ...delegationForSigning } = sessionDelegation;
        const signature = await smartAccount.signDelegation({
          delegation: delegationForSigning,
          chainId: payload.chainId,
        });
        return {
          delegation: {
            ...sessionDelegation,
            signature,
          },
        };
      };

      const connectButton = document.getElementById("connect");
      connectButton.addEventListener("click", async () => {
        connectButton.disabled = true;
        setStatus("Connecting to MetaMask...");

        try {
          const modal = self.Modal;
          if (!modal || !modal.Web3Auth) {
            throw new Error("Web3Auth SDK not loaded");
          }

          const web3auth = new modal.Web3Auth({
            clientId,
            web3AuthNetwork,
            chainConfig: {
              chainNamespace: "eip155",
              chainId: "0xAA36A7",
              rpcTarget: defaultRpcUrl,
            },
          });

          await web3auth.init();
          const provider = await web3auth.connect();

          await ensureTargetChain(provider);

          const accounts = await provider.request({ method: "eth_accounts" });
          const address = accounts?.[0];
          if (!address) {
            throw new Error("No account returned");
          }

          await fetch("/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state, address }),
          });

          setStatus("Connected. Keep this window open to approve requests.");

          const poll = async () => {
            for (;;) {
              try {
                const res = await fetch(
                  "/tasks?state=" + encodeURIComponent(state),
                  { cache: "no-store" },
                );
                if (res.status === 204) {
                  await new Promise((resolve) => setTimeout(resolve, 500));
                  continue;
                }
                if (!res.ok) {
                  const message = await res.text();
                  throw new Error(message || "Failed to fetch task");
                }
                const job = await res.json();
                let result;
                let error;
                try {
                  if (job.type === "close") {
                    await fetch("/task-result", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ state, jobId: job.id, result: { acknowledged: true } }),
                    });
                    setTimeout(() => window.close(), 100);
                    return;
                  } else if (job.type === "provider") {
                    result = await provider.request(job.payload);
                  } else if (job.type === "statelessDelegatorUpgrade") {
                    setStatus("Authorizing 7702 upgrade...");
                    result = await handleStatelessDelegatorUpgrade(provider, job.payload);
                  } else if (job.type === "statelessDelegatorSignDelegation") {
                    setStatus("Signing delegation...");
                    result = await handleStatelessDelegatorDelegation(provider, job.payload);
                  } else if (job.type === "signDelegationTypedData") {
                    const { viem } = await loadLibraries();
                    const typedDataJson = job.payload?.typedDataJson;
                    const from = job.payload?.from;
                    if (typeof typedDataJson !== "string" || typeof from !== "string") {
                      throw new Error("Missing typed data payload");
                    }
                    const signature = await provider.request({
                      method: "eth_signTypedData_v4",
                      params: [from, typedDataJson],
                    });
                    const typedData = JSON.parse(typedDataJson);
                    const recoveredAddress = await viem.recoverTypedDataAddress({
                      ...typedData,
                      signature,
                    });
                    result = {
                      signature,
                      recoveredAddress,
                    };
                  } else {
                    throw new Error("Unknown job type: " + job.type);
                  }
                } catch (err) {
                  const message = err?.message ?? "Provider request failed";
                  const code = err?.code;
                  error = { message, code };
                  console.error("Provider request error", err);
                }
                await fetch("/task-result", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ state, jobId: job.id, result, error }),
                });
                if (error) {
                  setStatus("A signature request failed. Check the CLI window.", true);
                } else {
                  setStatus("Request completed. Awaiting next action...");
                }
              } catch (err) {
                console.error("Polling error", err);
                setStatus("Connection lost. Retrying...", true);
                await new Promise((resolve) => setTimeout(resolve, 1500));
              }
            }
          };

          poll();
        } catch (error) {
          console.error(error);
          connectButton.disabled = false;
          setStatus(error?.message ?? "Failed to connect", true);
        }
      });
    </script>
  </body>
</html>`;
};
