/**
 * Signature Coordinator
 *
 * Event-driven coordination for cross-endpoint signature requests.
 * Enables server-side tools to request signatures from client-side owner wallet.
 *
 * Flow:
 * 1. Tool needs signature → requestSignature()
 * 2. Emit SSE event to client
 * 3. Client signs with owner wallet
 * 4. Client POST to /api/h2/sign-response
 * 5. respondToSignature() emits via EventEmitter
 * 6. requestSignature() promise resolves
 */

import { EventEmitter } from 'events';
import type { Hex } from 'viem';

/**
 * Global event emitter for cross-endpoint signature coordination
 * Tools emit signature_request events, client responds via sign-response endpoint
 */
export const signatureEmitter = new EventEmitter();

// Increase listener limit for batch operations (multiple parallel signature requests)
signatureEmitter.setMaxListeners(50);

export interface SignatureRequest {
  requestId: string;
  typedDataJson: string;
  from: string;
  timestamp: number;
}

export interface SignatureResponse {
  requestId: string;
  signature: Hex;
}

/**
 * Request a signature from the client
 *
 * @param request - Signature request details (typedData + signer address)
 * @param onEmit - Callback to emit SSE event to client
 * @param timeoutMs - Timeout in milliseconds (default: 60s)
 * @returns Promise that resolves with signature when client responds
 *
 * @example
 * ```typescript
 * const signature = await requestSignature(
 *   { typedDataJson: JSON.stringify(typedData), from: ownerAddress },
 *   (request) => controller.enqueue(encodeSSE({ type: 'signature_request', signatureRequest: request }))
 * );
 * ```
 */
export async function requestSignature(
  request: Omit<SignatureRequest, 'requestId' | 'timestamp'>,
  onEmit: (request: SignatureRequest) => void,
  timeoutMs = 60000
): Promise<Hex> {
  const requestId = Math.random().toString(36).substring(2, 15);
  const fullRequest: SignatureRequest = {
    ...request,
    requestId,
    timestamp: Date.now(),
  };

  // Emit SSE event to client
  onEmit(fullRequest);

  console.log(`[SignatureCoordinator] Request ${requestId} sent to client`);

  // Wait for response via event emitter
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signatureEmitter.off(`signature:${requestId}`, handler);
      console.error(`[SignatureCoordinator] Request ${requestId} timeout`);
      reject(new Error('Signature request timeout - user did not sign within 60 seconds'));
    }, timeoutMs);

    const handler = (signature: Hex) => {
      clearTimeout(timeout);
      console.log(`[SignatureCoordinator] Request ${requestId} received signature`);
      resolve(signature);
    };

    signatureEmitter.once(`signature:${requestId}`, handler);
  });
}

/**
 * Respond to a signature request
 *
 * Called from /api/h2/sign-response when client POSTs signature.
 * Emits event to resolve the waiting requestSignature() promise.
 *
 * @param requestId - Request ID from original signature request
 * @param signature - Signature from client's owner wallet
 *
 * @example
 * ```typescript
 * // In /api/h2/sign-response:
 * respondToSignature(requestId, signature);
 * ```
 */
export function respondToSignature(requestId: string, signature: Hex): void {
  console.log(`[SignatureCoordinator] Responding to request ${requestId}`);
  signatureEmitter.emit(`signature:${requestId}`, signature);
}
