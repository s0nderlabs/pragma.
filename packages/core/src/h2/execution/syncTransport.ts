/**
 * EIP-7966 Sync Transport Wrapper
 *
 * Wraps a viem transport to use eth_sendRawTransactionSync when available.
 * This provides ~50% latency reduction by eliminating the polling loop.
 *
 * @see https://eips.ethereum.org/EIPS/eip-7966
 */

import { custom, type Transport } from "viem";

/**
 * Creates a transport wrapper that intercepts eth_sendRawTransaction calls
 * and attempts to use EIP-7966 eth_sendRawTransactionSync instead.
 *
 * Benefits:
 * - ~50% latency reduction (no polling loop)
 * - Simpler error handling (timeout, nonce issues returned directly)
 * - Works transparently with MetaMask Delegation Toolkit (DTK)
 *
 * @param baseTransport - The underlying transport to wrap (e.g., http())
 * @param options - Configuration options
 * @returns A wrapped transport that uses sync transactions when available
 */
export function createSyncTransport(
  baseTransport: Transport,
  options?: {
    /** Timeout in milliseconds for sync transaction (default: 2000ms per EIP-7966) */
    timeout?: number;
    /** Whether to log debug info (default: false, or true if DEBUG_EIP7966 env var is set) */
    debug?: boolean;
  }
): Transport {
  const timeout = options?.timeout ?? 2000;
  // Enable debug via option or environment variable
  const debug =
    options?.debug ??
    (typeof process !== "undefined" && process.env?.DEBUG_EIP7966 === "true");

  return custom({
    async request({ method, params }) {
      // Get the base transport instance
      const transport = baseTransport({ chain: undefined, retryCount: 0 });

      // Intercept eth_sendRawTransaction and try sync version
      if (method === "eth_sendRawTransaction") {
        const startTime = Date.now();

        try {
          // Try EIP-7966 sync method first
          const result = await transport.request({
            method: "eth_sendRawTransactionSync",
            params: [...(params as unknown[]), timeout],
          });

          const elapsed = Date.now() - startTime;

          // EIP-7966 returns the full receipt, but callers expect just the hash
          // Extract transactionHash if we got a receipt object
          if (
            typeof result === "object" &&
            result !== null &&
            "transactionHash" in result
          ) {
            if (debug) {
              console.log(
                `[syncTransport] ✅ EIP-7966 SUCCESS - got receipt in ${elapsed}ms (hash: ${(result as { transactionHash: string }).transactionHash.slice(0, 10)}...)`
              );
            }
            return (result as { transactionHash: string }).transactionHash;
          }

          if (debug) {
            console.log(
              `[syncTransport] ✅ EIP-7966 SUCCESS - got hash in ${elapsed}ms`
            );
          }
          return result;
        } catch (e: unknown) {
          // Fallback: method not supported or RPC doesn't implement EIP-7966
          const error = e as { code?: number; message?: string };

          // -32601 = Method not found (standard JSON-RPC error)
          // Also check for common error messages
          const isUnsupportedMethod =
            error?.code === -32601 ||
            error?.message?.includes("not found") ||
            error?.message?.includes("not supported") ||
            error?.message?.includes("unknown method");

          if (isUnsupportedMethod) {
            if (debug) {
              console.log(
                "[syncTransport] ⚠️ eth_sendRawTransactionSync not supported, falling back to standard method"
              );
            }
            // Fallback to standard eth_sendRawTransaction
            return transport.request({ method, params });
          }

          // For other errors (like timeout, nonce issues), propagate them
          if (debug) {
            console.log(
              `[syncTransport] ❌ EIP-7966 ERROR: ${error?.message || "unknown"}`
            );
          }
          throw e;
        }
      }

      // Pass through all other RPC methods unchanged
      return transport.request({ method, params });
    },
  });
}

/**
 * Check if the RPC endpoint supports EIP-7966
 *
 * @param transport - The transport to check
 * @returns Promise<boolean> - true if eth_sendRawTransactionSync is supported
 */
export async function checkSyncTransactionSupport(
  transport: Transport
): Promise<boolean> {
  try {
    const t = transport({ chain: undefined, retryCount: 0 });

    // Try calling with invalid params to check if method exists
    // This will fail with "invalid params" if supported, or "method not found" if not
    await t.request({
      method: "eth_sendRawTransactionSync",
      params: ["0x"], // Invalid but triggers method check
    });

    // If we get here without error, something unexpected happened
    return true;
  } catch (e: unknown) {
    const error = e as { code?: number; message?: string };

    // -32601 = Method not found
    if (error?.code === -32601 || error?.message?.includes("not found")) {
      return false;
    }

    // Any other error (like invalid params) means the method exists
    return true;
  }
}
