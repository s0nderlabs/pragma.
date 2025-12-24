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
 * Normalize URL to ensure consistent encoding between client and server
 *
 * This prevents signature mismatches due to URL encoding differences:
 * - %20 vs + for spaces (browsers/servers handle these differently)
 * - Different percent-encoding of special characters
 * - Case differences in percent-encoded sequences
 *
 * The key issue: Client sends %20, but server's request.url shows + for spaces.
 * We normalize by decoding all params and re-encoding with encodeURIComponent.
 *
 * @param url - URL to normalize
 * @returns Normalized URL string
 */
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // Re-encode query params consistently
    // URLSearchParams decodes + and %20 to space, then we re-encode with %20
    const params = new URLSearchParams(urlObj.search);
    const normalizedParams = new URLSearchParams();

    for (const [key, value] of params) {
      // params.entries() already decodes values
      // Setting them re-encodes consistently
      normalizedParams.set(key, value);
    }

    // Rebuild URL with normalized params
    urlObj.search = normalizedParams.toString();
    return urlObj.href;
  } catch {
    // If URL parsing fails (shouldn't happen with absolute URLs), use as-is
    return url;
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
  // Normalize URL for consistent signing/verification
  const normalizedUrl = normalizeUrl(url);

  const parts = [
    'Pragma API Request',
    `URL: ${normalizedUrl}`,
    `Timestamp: ${timestamp}`,
  ];

  if (nonce) {
    parts.push(`Nonce: ${nonce}`);
  }

  return parts.join('\n');
}
