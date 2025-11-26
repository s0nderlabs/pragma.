/**
 * Authentication Middleware
 *
 * Two-factor authentication for API routes:
 * 1. JWT verification (proves Web3Auth login)
 * 2. Wallet signature verification (proves wallet ownership)
 *
 * Usage in API routes:
 * ```typescript
 * export async function POST(request: Request) {
 *   const authError = await authMiddleware(request);
 *   if (authError) return authError;
 *   // ... protected logic
 * }
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyWeb3AuthToken } from './verifyWeb3AuthToken';
import {
  verifyWalletSignature,
  createSignatureMessage,
} from './verifyWalletSignature';

/**
 * Required headers for authenticated requests
 */
export const AUTH_HEADERS = {
  TOKEN: 'x-auth-token', // Web3Auth ID token (JWT)
  WALLET: 'x-wallet-address', // Wallet address
  SIGNATURE: 'x-wallet-signature', // ECDSA signature
  TIMESTAMP: 'x-request-timestamp', // Request timestamp (ms)
  NONCE: 'x-request-nonce', // Optional nonce for extra security
} as const;

/**
 * Authentication result with user context
 */
export interface AuthContext {
  walletAddress: string;
  verifier: string;
  verifierId: string;
  email?: string;
}

/**
 * Authenticate an incoming request
 *
 * @param request - Next.js request object
 * @returns Error response if auth fails, null if success
 */
export async function authMiddleware(
  request: NextRequest | Request
): Promise<NextResponse | null> {
  // Extract authentication headers
  const token = request.headers.get(AUTH_HEADERS.TOKEN);
  const walletAddress = request.headers.get(AUTH_HEADERS.WALLET);
  const signature = request.headers.get(AUTH_HEADERS.SIGNATURE);
  const timestamp = request.headers.get(AUTH_HEADERS.TIMESTAMP);
  const nonce = request.headers.get(AUTH_HEADERS.NONCE);

  // Check for missing headers
  if (!token) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Missing authentication token',
        code: 'MISSING_TOKEN',
      },
      { status: 401 }
    );
  }

  if (!walletAddress || !signature || !timestamp) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Missing wallet signature credentials',
        code: 'MISSING_SIGNATURE',
      },
      { status: 401 }
    );
  }

  // ============================================================================
  // STEP 1: Verify Web3Auth JWT
  // ============================================================================

  const tokenResult = await verifyWeb3AuthToken(token);

  if (!tokenResult.valid) {
    console.warn('[Auth] JWT verification failed:', tokenResult.error);
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Invalid or expired authentication token',
        code: 'INVALID_TOKEN',
        details: tokenResult.error,
      },
      { status: 401 }
    );
  }

  const jwtWalletAddress = tokenResult.walletAddress!;

  // ============================================================================
  // STEP 2: Verify Wallet Signature
  // ============================================================================

  // Reconstruct the message that should have been signed
  const url = request.url || 'unknown';
  const expectedMessage = createSignatureMessage(url, timestamp, nonce || undefined);

  const signatureResult = await verifyWalletSignature({
    walletAddress,
    message: expectedMessage,
    signature,
    timestamp,
  });

  if (!signatureResult.valid) {
    console.warn('[Auth] Signature verification failed:', signatureResult.error);
    return NextResponse.json(
      {
        error: 'Forbidden',
        message: 'Invalid wallet signature',
        code: 'INVALID_SIGNATURE',
        details: signatureResult.error,
      },
      { status: 403 }
    );
  }

  // ============================================================================
  // STEP 3: Cross-Verify Wallet Addresses
  // ============================================================================

  // Ensure the wallet in the JWT matches the wallet that signed the request
  if (jwtWalletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    console.warn(
      `[Auth] Wallet mismatch: JWT=${jwtWalletAddress}, Signature=${walletAddress}`
    );
    return NextResponse.json(
      {
        error: 'Forbidden',
        message: 'Wallet address mismatch',
        code: 'WALLET_MISMATCH',
        details: 'The wallet in your token does not match the signing wallet',
      },
      { status: 403 }
    );
  }

  // ============================================================================
  // SUCCESS: Authentication passed
  // ============================================================================

  // Attach auth context to request headers for use in route handler
  // (Next.js doesn't allow mutating request objects, so we use headers)
  const authContext: AuthContext = {
    walletAddress: jwtWalletAddress,
    verifier: tokenResult.payload!.verifier,
    verifierId: tokenResult.payload!.verifierId,
    email: tokenResult.payload!.email,
  };

  // Store context in headers (accessible in route handler via request.headers)
  const response = request as NextRequest;
  if (response.headers && typeof response.headers.set === 'function') {
    response.headers.set('x-auth-context', JSON.stringify(authContext));
  }

  return null; // No error, proceed to route handler
}

/**
 * Extract auth context from authenticated request
 * (Call this AFTER authMiddleware has passed)
 */
export function getAuthContext(request: NextRequest | Request): AuthContext | null {
  const contextHeader = request.headers.get('x-auth-context');
  if (!contextHeader) return null;

  try {
    return JSON.parse(contextHeader) as AuthContext;
  } catch {
    return null;
  }
}

/**
 * Helper to create authenticated error responses
 */
export function createAuthError(
  message: string,
  code: string,
  status: number = 401
): NextResponse {
  return NextResponse.json(
    {
      error: status === 401 ? 'Unauthorized' : 'Forbidden',
      message,
      code,
    },
    { status }
  );
}
