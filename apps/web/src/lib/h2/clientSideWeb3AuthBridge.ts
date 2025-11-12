/**
 * Client-Side Web3Auth Bridge
 *
 * Bridge adapter that requests signatures from browser client instead of signing directly.
 * Solves the architectural mismatch: server-side tools need signatures from client-side owner wallet.
 *
 * Architecture:
 * - This bridge runs SERVER-SIDE (in API route)
 * - When signTypedData() is called, it emits a request to the CLIENT via SSE
 * - Client signs with owner wallet (Web3Auth)
 * - Client POSTs signature back to server
 * - Bridge promise resolves with signature
 *
 * This matches the pattern used by CLI's web3authBridge (browser-based signing).
 */

import type { Hex, Address } from 'viem';
import { requestSignature, type SignatureRequest } from './signatureCoordinator';

export interface ClientSideWeb3AuthBridge {
  /**
   * Sign EIP-712 typed data
   * Requests signature from client's owner wallet via SSE callback
   */
  signTypedData(params: {
    typedDataJson: string;
    from: string;
  }): Promise<{ signature: Hex }>;

  /**
   * Send transaction
   * Not supported - transactions should use session key wallet directly
   */
  sendTransaction(params: {
    from: Address;
    to: Address;
    value: string | bigint;
    data?: Hex;
  }): Promise<Hex>;
}

/**
 * Create web3authBridge that requests signatures from browser client
 *
 * This bridge runs server-side but delegates signing to client-side owner wallet.
 * When tools need signatures, this emits SSE events for client to handle.
 *
 * @param onSignatureRequest - Callback to emit SSE signature_request event to client
 * @returns Bridge interface that H2 tools expect
 *
 * @example
 * ```typescript
 * // In API route:
 * const web3authBridge = createClientSideWeb3AuthBridge((signatureRequest) => {
 *   controller.enqueue(encodeSSE({
 *     type: "signature_request",
 *     signatureRequest,
 *   }));
 * });
 *
 * // Pass to agent:
 * configurable: { web3authBridge, ... }
 *
 * // Tool calls signTypedData:
 * const { signature } = await web3authBridge.signTypedData({
 *   typedDataJson: JSON.stringify(typedData),
 *   from: ownerAddress,
 * });
 * // → Emits SSE event
 * // → Client signs with Web3Auth
 * // → Client POSTs signature
 * // → Promise resolves with signature
 * ```
 */
export function createClientSideWeb3AuthBridge(
  onSignatureRequest: (request: SignatureRequest) => void
): ClientSideWeb3AuthBridge {
  return {
    /**
     * Request typed data signature from client
     *
     * Flow:
     * 1. Emit SSE signature_request event via callback
     * 2. Wait for client to sign with owner wallet
     * 3. Client POSTs to /api/h2/sign-response
     * 4. EventEmitter resolves this promise
     * 5. Return signature to tool
     */
    async signTypedData({ typedDataJson, from }) {
      console.log('[ClientSideWeb3AuthBridge] Requesting signature from client...');

      // Request signature from client (waits for response)
      const signature = await requestSignature(
        { typedDataJson, from },
        onSignatureRequest,
        60000 // 60s timeout
      );

      console.log('[ClientSideWeb3AuthBridge] Signature received from client');

      return { signature };
    },

    /**
     * Send transaction
     *
     * Not supported via client bridge - transactions should use session key wallet.
     * If needed in the future, can implement same signature request pattern.
     */
    async sendTransaction({ from, to, value, data }) {
      throw new Error(
        'sendTransaction not supported via client bridge - use session key wallet for transactions'
      );
    },
  };
}
