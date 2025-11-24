/**
 * Authenticated Fetch Wrapper
 *
 * Automatically attaches Web3Auth JWT + wallet signature to API requests.
 * Use this instead of raw fetch() for all authenticated API calls.
 */

import { nanoid } from 'nanoid';
import { getIdentitySnapshot } from '../../hooks/useIdentity';
import { createSignatureMessage } from '../auth/verifyWalletSignature';
import { AUTH_HEADERS } from '../auth/authMiddleware';

/**
 * ID token storage (hybrid: in-memory + localStorage)
 *
 * - In-memory cache for fast access
 * - localStorage for persistence across page refreshes
 * - Cleared explicitly on logout for security
 *
 * Note: Web3Auth ID tokens are JWTs designed for client-side storage
 * and include built-in expiration. localStorage persistence prevents
 * race conditions on page load while maintaining security.
 */
let cachedIdToken: string | null = null;

const TOKEN_STORAGE_KEY = 'pragma_web3auth_id_token';

/**
 * Store the Web3Auth ID token after successful login
 * Persists to both memory and localStorage
 */
export function setIdToken(token: string): void {
  cachedIdToken = token;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch (error) {
      console.warn('[Auth] Failed to persist token to localStorage:', error);
    }
  }
}

/**
 * Get the cached ID token
 * Falls back to localStorage if not in memory
 */
export function getIdToken(): string | null {
  // Try memory cache first
  if (cachedIdToken) {
    return cachedIdToken;
  }

  // Fall back to localStorage (handles page refresh)
  if (typeof window !== 'undefined') {
    try {
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (storedToken) {
        cachedIdToken = storedToken; // Restore to memory cache
        return storedToken;
      }
    } catch (error) {
      console.warn('[Auth] Failed to retrieve token from localStorage:', error);
    }
  }

  return null;
}

/**
 * Clear the cached ID token (on logout)
 * Removes from both memory and localStorage
 */
export function clearIdToken(): void {
  cachedIdToken = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch (error) {
      console.warn('[Auth] Failed to clear token from localStorage:', error);
    }
  }
}

/**
 * Get the base URL for the current environment
 *
 * - Browser: Uses window.location.origin (e.g., http://localhost:3000 or https://yourdomain.com)
 * - SSR: Uses NEXT_PUBLIC_APP_URL environment variable
 *
 * This ensures the client signs with absolute URLs that match what the server receives in request.url
 */
function getBaseUrl(): string {
  // Browser environment - use actual origin (adapts automatically to localhost/production)
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  // Server-side rendering fallback
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

/**
 * Authenticated fetch options
 */
export interface AuthenticatedFetchOptions extends RequestInit {
  /**
   * Skip authentication (use regular fetch)
   * Default: false
   */
  skipAuth?: boolean;

  /**
   * Custom nonce (optional, auto-generated if not provided)
   */
  nonce?: string;
}

/**
 * Make an authenticated API request
 *
 * Automatically attaches:
 * - Web3Auth ID token (JWT)
 * - Wallet address
 * - Wallet signature (proves ownership)
 * - Timestamp (prevents replay attacks)
 * - Nonce (additional security)
 *
 * @param url - Request URL
 * @param options - Fetch options with optional auth config
 * @returns Response
 * @throws Error if wallet not connected or signing fails
 */
export async function authenticatedFetch(
  url: string,
  options: AuthenticatedFetchOptions = {}
): Promise<Response> {
  const { skipAuth, nonce, ...fetchOptions } = options;

  if (skipAuth) {
    return fetch(url, fetchOptions);
  }

  const { wallet } = getIdentitySnapshot();

  if (!wallet) {
    throw new Error('Wallet not connected. Please connect your wallet first.');
  }

  const idToken = getIdToken();

  if (!idToken) {
    throw new Error(
      'Authentication token not found. Please log in again.'
    );
  }

  // Generate timestamp and nonce
  const timestamp = Date.now().toString();
  const requestNonce = nonce || nanoid(16);

  // Construct absolute URL to match what server receives in request.url
  // This ensures client signs the same URL format that server will verify
  const absoluteUrl = url.startsWith('http')
    ? url  // Already absolute URL
    : `${getBaseUrl()}${url}`;  // Convert relative to absolute

  // Create message to sign using absolute URL
  const message = createSignatureMessage(absoluteUrl, timestamp, requestNonce);

  // Sign message with wallet
  let signature: string;
  try {
    signature = await wallet.walletClient.signMessage({
      account: wallet.address,
      message,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to sign request: ${errorMessage}`);
  }

  const headers = new Headers(fetchOptions.headers);
  headers.set(AUTH_HEADERS.TOKEN, idToken);
  headers.set(AUTH_HEADERS.WALLET, wallet.address);
  headers.set(AUTH_HEADERS.SIGNATURE, signature);
  headers.set(AUTH_HEADERS.TIMESTAMP, timestamp);
  headers.set(AUTH_HEADERS.NONCE, requestNonce);

  const finalFetchOptions = {
    ...fetchOptions,
    headers,
  };

  // Make authenticated request
  try {
    const response = await fetch(url, finalFetchOptions);

    // Handle auth errors
    if (response.status === 401) {
      // Token expired or invalid - clear cache
      clearIdToken();
      throw new Error('Authentication expired. Please log in again.');
    }

    if (response.status === 403) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || 'Access forbidden. Signature verification failed.'
      );
    }

    return response;
  } catch (error) {
    // Re-throw with more context
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network request failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Authenticated JSON fetch (convenience wrapper)
 */
export async function authenticatedFetchJSON<T = unknown>(
  url: string,
  options: AuthenticatedFetchOptions = {}
): Promise<T> {
  const response = await authenticatedFetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Request failed with status ${response.status}`
    );
  }

  return response.json();
}

/**
 * Authenticated streaming fetch (for SSE/streaming responses)
 */
export async function authenticatedStreamingFetch(
  url: string,
  options: AuthenticatedFetchOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  const response = await authenticatedFetch(url, options);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Stream request failed with status ${response.status}`
    );
  }

  if (!response.body) {
    throw new Error('Response body is null');
  }

  return response.body;
}
