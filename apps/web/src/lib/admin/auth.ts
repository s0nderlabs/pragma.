/**
 * Admin Authentication Utilities
 *
 * Supports dual auth:
 * - Wallet signature verification (requires ADMIN_ADDRESSES to be set)
 * - Password authentication
 *
 * Security:
 * - Nonces are stored server-side with 5-minute TTL to prevent replay attacks
 * - Wallet auth is disabled if ADMIN_ADDRESSES is not configured
 */

import { SignJWT, jwtVerify } from "jose";
import { verifyMessage } from "viem";

// Environment variables
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const ADMIN_ADDRESSES = process.env.ADMIN_ADDRESSES;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// JWT expiration: 24 hours
const JWT_EXPIRATION = "24h";

// Nonce expiration: 5 minutes
const NONCE_TTL_MS = 5 * 60 * 1000;

// ============================================================================
// Nonce Store (prevents replay attacks)
// ============================================================================

interface NonceEntry {
  nonce: string;
  createdAt: number;
}

// In-memory nonce store with TTL
// Note: For multi-instance deployments, use Redis or Vercel KV
const nonceStore = new Map<string, NonceEntry>();

// Cleanup expired nonces periodically
function cleanupExpiredNonces(): void {
  const now = Date.now();
  for (const [key, entry] of nonceStore.entries()) {
    if (now - entry.createdAt > NONCE_TTL_MS) {
      nonceStore.delete(key);
    }
  }
}

// Run cleanup every minute
if (typeof setInterval !== "undefined") {
  setInterval(cleanupExpiredNonces, 60 * 1000);
}

/**
 * Store a nonce for later validation
 */
export function storeNonce(nonce: string): void {
  cleanupExpiredNonces(); // Clean up on each store
  nonceStore.set(nonce, { nonce, createdAt: Date.now() });
}

/**
 * Validate and consume a nonce (one-time use)
 * Returns true if nonce is valid and not expired
 */
export function validateAndConsumeNonce(nonce: string): boolean {
  const entry = nonceStore.get(nonce);
  if (!entry) {
    return false; // Nonce not found (never issued or already used)
  }

  const now = Date.now();
  if (now - entry.createdAt > NONCE_TTL_MS) {
    nonceStore.delete(nonce);
    return false; // Nonce expired
  }

  // Consume the nonce (one-time use)
  nonceStore.delete(nonce);
  return true;
}

// ============================================================================
// Types
// ============================================================================

export interface AdminToken {
  authType: "wallet" | "password";
  address?: string;
  iat: number;
  exp: number;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  error?: string;
}

// ============================================================================
// Environment Validation
// ============================================================================

function getJwtSecret(): Uint8Array {
  if (!ADMIN_JWT_SECRET) {
    throw new Error("Missing ADMIN_JWT_SECRET environment variable");
  }
  return new TextEncoder().encode(ADMIN_JWT_SECRET);
}

function getAdminAddresses(): string[] {
  if (!ADMIN_ADDRESSES) {
    return [];
  }
  return ADMIN_ADDRESSES.split(",")
    .map((addr) => addr.trim().toLowerCase())
    .filter(Boolean);
}

// ============================================================================
// Wallet Authentication
// ============================================================================

/**
 * Generate a nonce for wallet signature
 */
export function generateNonce(): string {
  return Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
}

/**
 * Create the message to be signed
 */
export function createSignMessage(nonce: string): string {
  return `Sign in to Pragma Admin\nNonce: ${nonce}`;
}

/**
 * Extract nonce from signed message
 */
function extractNonceFromMessage(message: string): string | null {
  const match = message.match(/Nonce: ([a-z0-9]+)/);
  return match ? match[1] : null;
}

/**
 * Check if wallet auth is properly configured
 */
export function isWalletAuthEnabled(): boolean {
  const addresses = getAdminAddresses();
  return addresses.length > 0;
}

/**
 * Verify wallet signature and check if address is in allowlist
 *
 * Security measures:
 * 1. Wallet auth is disabled if ADMIN_ADDRESSES is not set
 * 2. Nonce is validated and consumed (one-time use)
 * 3. Address must be in the allowlist
 */
export async function verifyWalletAuth(
  address: string,
  signature: `0x${string}`,
  message: string
): Promise<AuthResult> {
  try {
    // Security: Wallet auth requires ADMIN_ADDRESSES to be configured
    const allowedAddresses = getAdminAddresses();
    if (allowedAddresses.length === 0) {
      return { success: false, error: "Wallet auth not configured. Set ADMIN_ADDRESSES." };
    }

    // Security: Validate and consume nonce to prevent replay attacks
    const nonce = extractNonceFromMessage(message);
    if (!nonce) {
      return { success: false, error: "Invalid message format" };
    }

    if (!validateAndConsumeNonce(nonce)) {
      return { success: false, error: "Invalid or expired nonce" };
    }

    // Verify signature
    const isValid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature,
    });

    if (!isValid) {
      return { success: false, error: "Invalid signature" };
    }

    // Check if address is in allowlist
    const normalizedAddress = address.toLowerCase();
    if (!allowedAddresses.includes(normalizedAddress)) {
      return { success: false, error: "Address not authorized" };
    }

    // Generate JWT
    const token = await generateToken({ authType: "wallet", address: normalizedAddress });
    return { success: true, token };
  } catch (error) {
    console.error("[Admin Auth] Wallet verification error:", error);
    return { success: false, error: "Verification failed" };
  }
}

// ============================================================================
// Password Authentication
// ============================================================================

/**
 * Verify password and generate JWT
 */
export async function verifyPasswordAuth(password: string): Promise<AuthResult> {
  if (!ADMIN_PASSWORD) {
    return { success: false, error: "Password auth not configured" };
  }

  if (password !== ADMIN_PASSWORD) {
    return { success: false, error: "Invalid password" };
  }

  // Generate JWT
  const token = await generateToken({ authType: "password" });
  return { success: true, token };
}

// ============================================================================
// JWT Handling
// ============================================================================

/**
 * Generate a JWT token
 */
async function generateToken(payload: { authType: "wallet" | "password"; address?: string }): Promise<string> {
  const secret = getJwtSecret();

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(secret);
}

/**
 * Verify a JWT token
 */
export async function verifyToken(token: string): Promise<AdminToken | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);

    return {
      authType: payload.authType as "wallet" | "password",
      address: payload.address as string | undefined,
      iat: payload.iat as number,
      exp: payload.exp as number,
    };
  } catch (error) {
    console.error("[Admin Auth] Token verification error:", error);
    return null;
  }
}

/**
 * Check if a token is valid
 */
export async function isValidToken(token: string): Promise<boolean> {
  const payload = await verifyToken(token);
  return payload !== null;
}

// ============================================================================
// Cookie Helpers
// ============================================================================

export const ADMIN_TOKEN_COOKIE = "admin_token";

/**
 * Create cookie options for admin token
 */
export function getTokenCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  };
}
