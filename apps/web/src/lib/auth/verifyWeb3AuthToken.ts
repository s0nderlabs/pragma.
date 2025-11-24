/**
 * Web3Auth JWT Token Verification
 *
 * Verifies ID tokens issued by Web3Auth using their JWKS endpoint.
 * These tokens prove that a user successfully authenticated via Web3Auth.
 */

import { jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose';
import * as secp256k1 from '@noble/secp256k1';
import { keccak256 } from 'viem';
import { WEB3AUTH_CLIENT_ID, WEB3AUTH_NETWORK } from '../config';

/**
 * Web3Auth token payload structure
 */
export interface Web3AuthTokenPayload extends JWTPayload {
  wallets: Array<{
    type: string;
    address: string;
    public_key?: string;
  }>;
  aggregateVerifier?: string;
  verifier: string;
  verifierId: string;
  email?: string;
  name?: string;
  profileImage?: string;
}

/**
 * Result of token verification
 */
export interface TokenVerificationResult {
  valid: boolean;
  payload?: Web3AuthTokenPayload;
  walletAddress?: string;
  error?: string;
}

// JWKS endpoint for Web3Auth token verification
// Note: JWKS endpoint is shared across all Web3Auth networks
const getJWKSUrl = (): string => {
  return 'https://api-auth.web3auth.io/jwks';
};

/**
 * Derive Ethereum address from compressed secp256k1 public key
 * Used for Web3Auth social login tokens which contain public_key instead of address
 *
 * @param compressedPublicKey - Hex string of compressed secp256k1 public key (with or without 0x prefix)
 * @returns Ethereum address (lowercase, with 0x prefix)
 */
function deriveAddressFromPublicKey(compressedPublicKey: string): string {
  // Remove '0x' prefix if present
  const pubKeyHex = compressedPublicKey.replace(/^0x/, '');

  // Convert compressed public key to uncompressed format
  const uncompressedPubKey = secp256k1.Point.fromHex(pubKeyHex)
    .toBytes(false); // false = uncompressed format (65 bytes: 0x04 + x + y)

  // Remove '04' prefix (first byte) and hash the remaining 64 bytes (x + y coordinates)
  const pubKeyWithoutPrefix = uncompressedPubKey.slice(1);
  const hash = keccak256(`0x${Buffer.from(pubKeyWithoutPrefix).toString('hex')}`);

  // Take last 20 bytes (40 hex characters) as Ethereum address
  const address = '0x' + hash.slice(-40);

  return address.toLowerCase();
}

// Cache the JWKS to avoid fetching on every request
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Verify a Web3Auth ID token
 *
 * @param token - The ID token from Web3Auth (JWT)
 * @returns Verification result with payload and wallet address
 */
export async function verifyWeb3AuthToken(
  token: string
): Promise<TokenVerificationResult> {
  try {
    if (!WEB3AUTH_CLIENT_ID) {
      return {
        valid: false,
        error: 'Web3Auth client ID not configured',
      };
    }

    if (!WEB3AUTH_NETWORK) {
      return {
        valid: false,
        error: 'Web3Auth network not configured',
      };
    }

    // Initialize JWKS if not cached
    if (!jwksCache) {
      const jwksUrl = getJWKSUrl();
      jwksCache = createRemoteJWKSet(new URL(jwksUrl));
    }

    // Verify the JWT signature and claims
    const { payload } = await jwtVerify(token, jwksCache, {
      issuer: 'https://api-auth.web3auth.io', // Web3Auth issuer
      audience: WEB3AUTH_CLIENT_ID, // Our client ID
      clockTolerance: 60, // Allow 60s clock skew
    });

    const web3AuthPayload = payload as Web3AuthTokenPayload;

    // Extract wallet address from token
    let walletAddress: string | undefined;

    if (web3AuthPayload.wallets?.[0]?.address) {
      // External wallet - address directly available
      walletAddress = web3AuthPayload.wallets[0].address.toLowerCase();
    } else if (web3AuthPayload.wallets?.[0]?.public_key) {
      // Social login - derive address from public key
      try {
        walletAddress = deriveAddressFromPublicKey(web3AuthPayload.wallets[0].public_key);
      } catch (error) {
        console.error('[Auth] Failed to derive address from public key:', error);
        return {
          valid: false,
          payload: web3AuthPayload,
          error: `Failed to derive address from public key: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    if (!walletAddress) {
      return {
        valid: false,
        payload: web3AuthPayload,
        error: 'No wallet address or public key found in token',
      };
    }

    return {
      valid: true,
      payload: web3AuthPayload,
      walletAddress,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error('[Auth] Web3Auth token verification failed:', errorMessage);

    return {
      valid: false,
      error: `Token verification failed: ${errorMessage}`,
    };
  }
}

/**
 * Extract wallet address from token without full verification
 * Useful for logging/debugging (DO NOT use for authorization)
 */
export function extractWalletAddressUnsafe(token: string): string | null {
  try {
    // Decode JWT without verification (UNSAFE - for debugging only)
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    );
    return payload.wallets?.[0]?.address?.toLowerCase() || null;
  } catch {
    return null;
  }
}
