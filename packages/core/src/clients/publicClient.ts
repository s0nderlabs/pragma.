import {
  createPublicClient,
  fallback,
  http,
  type Chain,
  type HttpTransportConfig,
  type PublicClient,
} from "viem";

export interface ReadClientConfig {
  chain: Chain;
  /** Primary read-only endpoint. Should point to HyperRPC or similar deterministic RPC. */
  readUrl: string;
  /** Optional fallback for write-enabled RPC endpoint for resiliency. */
  fallbackUrl?: string;
  /** Optional custom transport tuning. */
  transportConfig?: HttpTransportConfig;
}

const buildTransport = (url: string, transportConfig?: HttpTransportConfig) =>
  http(url, {
    batch: true,
    retryCount: transportConfig?.retryCount ?? 3,
    retryDelay: transportConfig?.retryDelay ?? 300,
    timeout: transportConfig?.timeout ?? 120_000, // 120s for slow RPCs
  });

/**
 * Creates a read-only viem PublicClient backed by HyperRPC with optional fallback.
 * The resulting client MUST NOT be used for write operations.
 */
export const createReadOnlyPublicClient = (config: ReadClientConfig): PublicClient => {
  const { chain, readUrl, fallbackUrl, transportConfig } = config;

  const transports = [buildTransport(readUrl, transportConfig)];
  if (fallbackUrl && fallbackUrl !== readUrl) {
    transports.push(buildTransport(fallbackUrl, transportConfig));
  }

  const transport = transports.length === 1 ? transports[0] : fallback(transports, {
    retryCount: transportConfig?.retryCount ?? 2,
    retryDelay: transportConfig?.retryDelay ?? 150,
  });

  return createPublicClient({
    chain,
    transport,
    batch: {
      multicall: true,
    },
  });
};

export interface ReadClientHealthCheckConfig extends ReadClientConfig {
  /** Account address to use for optional balance probes. */
  healthCheckAddress?: `0x${string}`;
}

export interface ReadClientHealthReport {
  ok: boolean;
  readUrl: string;
  fallbackUrl?: string;
  latencyMs?: number;
  error?: string;
}

/**
 * Performs a lightweight health probe against the read-only client.
 */
export const probeReadClient = async (
  config: ReadClientHealthCheckConfig,
): Promise<ReadClientHealthReport> => {
  const startedAt = Date.now();
  try {
    const client = createReadOnlyPublicClient(config);
    await client.getBlockNumber();
    const finishedAt = Date.now();
    return {
      ok: true,
      readUrl: config.readUrl,
      fallbackUrl: config.fallbackUrl,
      latencyMs: finishedAt - startedAt,
    };
  } catch (err) {
    const finishedAt = Date.now();
    return {
      ok: false,
      readUrl: config.readUrl,
      fallbackUrl: config.fallbackUrl,
      latencyMs: finishedAt - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};
