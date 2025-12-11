/**
 * EIP-7966 Sync Receipt Utilities
 *
 * Helper functions for waiting on transaction receipts with EIP-7966 support.
 * These complement the syncTransport wrapper for explicit receipt handling.
 *
 * @see https://eips.ethereum.org/EIPS/eip-7966
 */

import type { Hex, PublicClient, TransactionReceipt } from "viem";

/**
 * Waits for a transaction receipt with configurable timeout.
 *
 * Note: The primary EIP-7966 optimization happens at the transport layer
 * (via createSyncTransport). This helper provides a consistent interface
 * for receipt waiting with proper timeout handling.
 *
 * @param client - The viem PublicClient
 * @param hash - Transaction hash to wait for
 * @param options - Configuration options
 * @returns The transaction receipt
 */
export async function waitForReceiptSync(
  client: PublicClient,
  hash: Hex,
  options?: {
    /** Timeout in milliseconds (default: 60000ms) */
    timeout?: number;
  }
): Promise<TransactionReceipt> {
  const timeout = options?.timeout ?? 60_000;

  return await client.waitForTransactionReceipt({
    hash,
    timeout,
  });
}

/**
 * Sends a raw transaction and waits for receipt synchronously.
 * Uses EIP-7966 eth_sendRawTransactionSync if supported by the RPC.
 *
 * This is useful for direct transaction sending (not via DTK's redeemDelegations).
 *
 * @param client - The viem PublicClient
 * @param serializedTransaction - The signed, serialized transaction
 * @param options - Configuration options
 * @returns Object containing both the transaction hash and receipt
 */
export async function sendAndWaitSync(
  client: PublicClient,
  serializedTransaction: Hex,
  options?: {
    /** Timeout in milliseconds for EIP-7966 sync call (default: 2000ms) */
    syncTimeout?: number;
    /** Timeout in milliseconds for receipt polling fallback (default: 60000ms) */
    receiptTimeout?: number;
  }
): Promise<{ hash: Hex; receipt: TransactionReceipt }> {
  const syncTimeout = options?.syncTimeout ?? 2000;
  const receiptTimeout = options?.receiptTimeout ?? 60_000;

  try {
    // Try EIP-7966: send + wait in one call
    const receipt = (await client.request({
      method: "eth_sendRawTransactionSync" as "eth_sendRawTransaction",
      params: [serializedTransaction, syncTimeout] as unknown as [Hex],
    })) as unknown as TransactionReceipt;

    // Validate we got a proper receipt
    if (receipt && typeof receipt === "object" && "transactionHash" in receipt) {
      return {
        hash: receipt.transactionHash as Hex,
        receipt,
      };
    }

    // If response is just a hash string, we need to wait for receipt
    if (typeof receipt === "string") {
      const fullReceipt = await client.waitForTransactionReceipt({
        hash: receipt as Hex,
        timeout: receiptTimeout,
      });
      return { hash: receipt as Hex, receipt: fullReceipt };
    }

    throw new Error("Unexpected response format from eth_sendRawTransactionSync");
  } catch (e: unknown) {
    const error = e as { code?: number; message?: string };

    // Check if EIP-7966 is not supported
    const isUnsupportedMethod =
      error?.code === -32601 ||
      error?.message?.includes("not found") ||
      error?.message?.includes("not supported") ||
      error?.message?.includes("unknown method");

    if (isUnsupportedMethod) {
      // Fallback: standard send + wait
      const hash = await client.sendRawTransaction({
        serializedTransaction,
      });

      const receipt = await client.waitForTransactionReceipt({
        hash,
        timeout: receiptTimeout,
      });

      return { hash, receipt };
    }

    // For other errors (timeout, nonce, etc.), propagate
    throw e;
  }
}

/**
 * Type guard to check if a value is a transaction receipt
 */
export function isTransactionReceipt(
  value: unknown
): value is TransactionReceipt {
  return (
    typeof value === "object" &&
    value !== null &&
    "transactionHash" in value &&
    "blockNumber" in value &&
    "status" in value
  );
}
