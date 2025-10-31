/**
 * H2 Bridge - Direct PK Signing for Testing
 *
 * This module provides a mock Web3Auth bridge that uses direct private key signing
 * for testing purposes. It implements the same interface as the real Web3Auth bridge
 * but bypasses the browser-based authentication flow.
 *
 * **IMPORTANT:** This should ONLY be used for testing/dev mode.
 */

import { type Hex, type Address, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadChain } from "./web3authClients.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Bridge interface that matches Web3AuthBridge
 */
export interface H2Bridge {
  /**
   * Sign EIP-712 typed data
   * @param params - Signing parameters
   * @returns Signature
   */
  signTypedData(params: {
    typedDataJson: string;
    from: string;
  }): Promise<{ signature: Hex }>;

  /**
   * Send transaction (for session key funding)
   * @param params - Transaction parameters
   * @returns Transaction hash
   */
  sendTransaction(params: {
    from: Address;
    to: Address;
    value: string | bigint;
    data?: Hex;
  }): Promise<Hex>;
}

// ============================================================================
// Direct PK Bridge Implementation
// ============================================================================

/**
 * Create a bridge that uses direct private key signing
 *
 * This bypasses Web3Auth and signs directly with the provided private key.
 * Used for testing when browser-based authentication is not available.
 *
 * @param privateKey - Private key to use for signing
 * @returns Bridge compatible with H2 execution layer
 *
 * @example
 * ```typescript
 * const bridge = createDirectPKBridge(PRAGMA_ADMIN_TEST_PK);
 * const { signature } = await bridge.signTypedData({
 *   typedDataJson: JSON.stringify(typedData),
 *   from: ownerAddress,
 * });
 * ```
 */
export function createDirectPKBridge(privateKey: Hex): H2Bridge {
  const account = privateKeyToAccount(privateKey);
  const rpcUrl = process.env.MONAD_EXECUTION_RPC_URL || "https://rpc.ankr.com/monad_testnet";

  // Create wallet client for sending transactions
  const walletClient = createWalletClient({
    chain: monadChain,
    transport: http(rpcUrl),
    account,
  });

  return {
    async signTypedData({ typedDataJson, from }) {
      // Parse typed data
      const typedData = JSON.parse(typedDataJson);

      // Verify 'from' matches account
      if (from.toLowerCase() !== account.address.toLowerCase()) {
        throw new Error(
          `Signer mismatch: expected ${from}, got ${account.address}`
        );
      }

      // Sign typed data with viem account
      const signature = await account.signTypedData(typedData);

      return { signature };
    },

    async sendTransaction({ from, to, value, data }) {
      // Verify 'from' matches account
      if (from.toLowerCase() !== account.address.toLowerCase()) {
        throw new Error(
          `Signer mismatch: expected ${from}, got ${account.address}`
        );
      }

      // Parse value if it's a string
      const valueBI = typeof value === "string"
        ? BigInt(value)
        : value;

      // Send transaction
      const hash = await walletClient.sendTransaction({
        to,
        value: valueBI,
        data: data || "0x",
        chain: null, // Chain is already configured in wallet client
      });

      return hash;
    },
  };
}

/**
 * Check if a bridge is a direct PK bridge
 * @param bridge - Bridge to check
 * @returns True if direct PK bridge
 */
export function isDirectPKBridge(bridge: any): boolean {
  return bridge && typeof bridge.signTypedData === "function";
}
