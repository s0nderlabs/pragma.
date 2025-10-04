import http from "node:http";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSync } from "esbuild";
import type { Address } from "viem";
import { sepolia } from "viem/chains";

import { PRIVY_APP_ID } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidateBundleEntries = [
  path.resolve(__dirname, "../../src/services/privyBridgeClient.tsx"),
  path.resolve(__dirname, "privyBridgeClient.tsx"),
];

const BUNDLE_PATH = (() => {
  for (const candidate of candidateBundleEntries) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    "Could not locate privyBridgeClient.tsx. Ensure the CLI is built from source; expected at src/services/privyBridgeClient.tsx.",
  );
})();

const buildPrivyBundle = () => {
  const { outputFiles } = buildSync({
    entryPoints: [BUNDLE_PATH],
    bundle: true,
    write: false,
    format: "iife",
    target: ["es2020"],
    platform: "browser",
    jsx: "automatic",
    sourcemap: false,
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    loader: {
      ".ts": "ts",
      ".tsx": "tsx",
    },
  });

  if (!outputFiles?.length) {
    throw new Error("Privy bridge bundle build produced no output");
  }

  return outputFiles[0]!.text;
};

const BUNDLE_CODE = buildPrivyBundle();

type ProviderRequest = {
  method: string;
  params?: unknown[];
};

type ProviderBridgeJob = {
  id: string;
  type: "provider";
  payload: ProviderRequest;
};

type SignDelegationTypedDataPayload = {
  typedDataJson: string;
  from: Address;
};

type SignDelegationBridgeJob = {
  id: string;
  type: "signDelegationTypedData";
  payload: SignDelegationTypedDataPayload;
};

type BridgeJob = ProviderBridgeJob | SignDelegationBridgeJob;

type PendingJob = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

type PrivyBridgeOptions = {
  onReady: (url: string, state: string) => void | Promise<void>;
};

export type PrivyBridge = {
  waitForWallet: () => Promise<{ address: Address }>;
  request: <T = unknown>(request: ProviderRequest) => Promise<T>;
  signTypedData: (payload: SignDelegationTypedDataPayload) => Promise<{ signature: string; recoveredAddress?: Address }>;
  shutdown: () => Promise<void>;
};

const renderAuthPage = ({ state, appId }: { state: string; appId: string }) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Pragma Privy Bridge</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
    <style>
      body {
        margin: 0;
        padding: 0;
        background: #f9fafb;
        min-height: 100vh;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script>
      window.__PRIVY_BRIDGE_CONFIG__ = {
        state: ${JSON.stringify(state)},
        appId: ${JSON.stringify(appId)},
        apiBaseUrl: window.location.origin,
        chainId: ${JSON.stringify(sepolia.id)},
      };
    </script>
    <script>${BUNDLE_CODE}</script>
  </body>
</html>`;

export const startPrivyBridge = ({ onReady }: PrivyBridgeOptions): PrivyBridge => {
  if (!PRIVY_APP_ID) {
    throw new Error("PRIVY_ID environment variable is required to use the Privy bridge");
  }

  const appId = PRIVY_APP_ID;

  const state = randomBytes(16).toString("hex");
  const jobQueue: BridgeJob[] = [];
  const pendingJobs = new Map<string, PendingJob>();

  let server: http.Server | undefined;
  let shuttingDown = false;
  let walletResolve: ((value: { address: Address }) => void) | undefined;
  let walletReject: ((reason?: unknown) => void) | undefined;
  let walletAddress: Address | undefined;

  const walletPromise = new Promise<{ address: Address }>((resolve, reject) => {
    walletResolve = resolve;
    walletReject = reject;
  });

  const failAllJobs = (error: unknown) => {
    pendingJobs.forEach(({ reject }) => reject(error));
    pendingJobs.clear();
  };

  const handleError = (error: unknown) => {
    if (shuttingDown) return;
    shuttingDown = true;
    failAllJobs(error);
    walletReject?.(error);
    if (server) {
      server.close();
    }
  };

  const enqueueJob = <T,>(job: Omit<BridgeJob, "id">): Promise<T> => {
    const jobId = randomBytes(16).toString("hex");
    return new Promise<T>((resolve, reject) => {
      pendingJobs.set(jobId, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      jobQueue.push({ id: jobId, ...job } as BridgeJob);
    });
  };

  const requestListener: http.RequestListener = async (req, res) => {
    try {
      const urlObj = new URL(req.url ?? "", "http://localhost");

      if (req.method === "GET" && urlObj.pathname === "/auth") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(renderAuthPage({ state, appId }));
        return;
      }

      if (req.method === "POST" && urlObj.pathname === "/register") {
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

      if (req.method === "GET" && urlObj.pathname === "/tasks") {
        if (urlObj.searchParams.get("state") !== state) {
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

      if (req.method === "POST" && urlObj.pathname === "/task-result") {
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
              pending?.reject(Object.assign(new Error(error?.message ?? "Bridge job failed"), error));
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

  server.once("error", handleError);
  server.listen(0, async () => {
    const addressInfo = server?.address();
    if (addressInfo && typeof addressInfo === "object") {
      const url = `http://localhost:${addressInfo.port}/auth`;
      try {
        await onReady(url, state);
      } catch (error) {
        handleError(error);
      }
    }
  });

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    failAllJobs(new Error("Privy bridge shut down"));
    if (!walletAddress) {
      walletReject?.(new Error("Privy bridge shut down"));
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
    request: (request) => enqueueJob({ type: "provider", payload: request }),
    signTypedData: (payload) => enqueueJob({ type: "signDelegationTypedData", payload }),
    shutdown,
  };
};
