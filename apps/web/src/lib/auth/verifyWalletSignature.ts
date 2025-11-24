/**
 * Wallet Signature Verification
 *
 * Verifies ECDSA signatures to prove wallet ownership.
 * Used alongside JWT verification for two-factor authentication.
 */

import { verifyMessage, type Address, type Hex, isAddress } from 'viem';

/**
 * Signature verification request
 */
export interface SignatureVerificationRequest {
  walletAddress: string;
  message: string;
  signature: string;
  timestamp: string;
}

/**
 * Result of signature verification
 */
export interface SignatureVerificationResult {
  valid: boolean;
  address?: Address;
  error?: string;
}

/**
 * Maximum age of a signed message (prevents replay attacks)
 * Default: 60 seconds
 */
const MAX_MESSAGE_AGE_MS = 60 * 1000;

/**
 * Verify a wallet signature
 *
 * @param request - Signature verification request
 * @returns Verification result
 */
export async function verifyWalletSignature(
  request: SignatureVerificationRequest
): Promise<SignatureVerificationResult> {
  const { walletAddress, message, signature, timestamp } = request;

  // Validate inputs
  if (!walletAddress || !message || !signature || !timestamp) {
    return {
      valid: false,
      error: 'Missing required fields',
    };
  }

  // Validate wallet address format
  if (!isAddress(walletAddress)) {
    return {
      valid: false,
      error: 'Invalid wallet address format',
    };
  }

  // Validate signature format (0x + 130 hex chars = 65 bytes)
  if (!signature.startsWith('0x') || signature.length !== 132) {
    return {
      valid: false,
      error: 'Invalid signature format',
    };
  }

  // Check timestamp (prevent replay attacks)
  const timestampMs = parseInt(timestamp, 10);
  if (isNaN(timestampMs)) {
    return {
      valid: false,
      error: 'Invalid timestamp format',
    };
  }

  const now = Date.now();
  const age = now - timestampMs;

  if (age < 0) {
    return {
      valid: false,
      error: 'Timestamp is in the future',
    };
  }

  if (age > MAX_MESSAGE_AGE_MS) {
    return {
      valid: false,
      error: `Message expired (max age: ${MAX_MESSAGE_AGE_MS / 1000}s)`,
    };
  }

  try {
    // Verify the signature cryptographically
    const isValid = await verifyMessage({
      address: walletAddress as Address,
      message,
      signature: signature as Hex,
    });

    if (!isValid) {
      return {
        valid: false,
        error: 'Signature verification failed',
      };
    }

    return {
      valid: true,
      address: walletAddress as Address,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error('[Auth] Signature verification error:', errorMessage);

    return {
      valid: false,
      error: `Verification error: ${errorMessage}`,
    };
  }
}

/**
 * Create a message to be signed by the wallet
 *
 * @param url - Request URL
 * @param timestamp - Request timestamp
 * @param nonce - Optional nonce for additional security
 * @returns Message to sign
 */
export function createSignatureMessage(
  url: string,
  timestamp: string,
  nonce?: string
): string {
  const parts = [
    'Pragma API Request',
    `URL: ${url}`,
    `Timestamp: ${timestamp}`,
  ];

  if (nonce) {
    parts.push(`Nonce: ${nonce}`);
  }

  return parts.join('\n');
}
