/**
 * Web3Auth Bridge for H2 Web
 *
 * Adapts browser walletClient to match CLI's web3authBridge interface.
 * H2 tools expect web3authBridge, but web already has walletClient from useIdentity.
 * This adapter bridges the gap - same pattern H1 uses for delegation signing.
 *
 * Architecture:
 * - CLI: Uses h2Bridge.ts to open browser window for signing
 * - Web: Uses walletClient directly (wallet already in browser)
 * - This file: Adapts walletClient to match bridge interface
 */

import type { WalletClient, Address, Hex } from "viem";

/**
 * Web3AuthBridge interface
 * Matches packages/core/src/h2/tools expectations
 */
export interface Web3AuthBridge {
  signTypedData(params: { typedDataJson: string; from: string }): Promise<{ signature: Hex }>;
  sendTransaction(params: {
    from: Address;
    to: Address;
    value: string | bigint;
    data?: Hex;
  }): Promise<Hex>;
}

/**
 * Create web3authBridge from browser walletClient
 *
 * Allows H2 tools to work in web context without modification.
 * H2 tools call bridge.signTypedData(), this wraps walletClient.signTypedData().
 *
 * @param walletClient - Viem WalletClient (from sessionWallet or useIdentity)
 * @returns Web3AuthBridge interface that H2 tools expect
 */
export function createWeb3AuthBridge(walletClient: WalletClient): Web3AuthBridge {
  return {
    /**
     * Sign EIP-712 typed data (delegations)
     *
     * Opens Web3Auth modal for user signature (if using owner wallet).
     * If using sessionWallet, signs automatically with session key.
     */
    async signTypedData({ typedDataJson, from }) {
      const typedData = JSON.parse(typedDataJson);

      // Call walletClient.signTypedData
      // This may open Web3Auth modal for owner wallet
      // Or sign automatically with session key
      const signature = await walletClient.signTypedData({
        account: from as Address,
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });

      return { signature };
    },

    /**
     * Send transaction
     *
     * Used by tools that need to send raw transactions.
     */
    async sendTransaction({ from, to, value, data }) {
      const hash = await walletClient.sendTransaction({
        account: from as Address,
        to,
        value: typeof value === "string" ? BigInt(value) : value,
        data: data || "0x",
      });

      return hash;
    },
  };
}
