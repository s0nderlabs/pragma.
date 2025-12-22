/**
 * Admin Authentication API
 *
 * Endpoints:
 * - POST /api/admin/auth - Login (wallet signature or password)
 * - DELETE /api/admin/auth - Logout
 * - GET /api/admin/auth - Get nonce for wallet auth
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  generateNonce,
  createSignMessage,
  storeNonce,
  isWalletAuthEnabled,
  verifyWalletAuth,
  verifyPasswordAuth,
  verifyToken,
  ADMIN_TOKEN_COOKIE,
  getTokenCookieOptions,
} from "@/lib/admin/auth";

// ============================================================================
// GET - Generate nonce for wallet authentication
// ============================================================================

export async function GET() {
  // Check if wallet auth is enabled
  if (!isWalletAuthEnabled()) {
    return NextResponse.json(
      { error: "Wallet auth not configured. Use password login or set ADMIN_ADDRESSES." },
      { status: 400 }
    );
  }

  const nonce = generateNonce();
  const message = createSignMessage(nonce);

  // Store nonce server-side for validation (prevents replay attacks)
  storeNonce(nonce);

  return NextResponse.json({
    nonce,
    message,
  });
}

// ============================================================================
// POST - Login (wallet or password)
// ============================================================================

interface WalletLoginRequest {
  type: "wallet";
  address: string;
  signature: `0x${string}`;
  message: string;
}

interface PasswordLoginRequest {
  type: "password";
  password: string;
}

type LoginRequest = WalletLoginRequest | PasswordLoginRequest;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginRequest;

    let result;

    if (body.type === "wallet") {
      // Wallet signature verification
      if (!body.address || !body.signature || !body.message) {
        return NextResponse.json(
          { error: "Missing address, signature, or message" },
          { status: 400 }
        );
      }

      result = await verifyWalletAuth(body.address, body.signature, body.message);
    } else if (body.type === "password") {
      // Password verification
      if (!body.password) {
        return NextResponse.json(
          { error: "Missing password" },
          { status: 400 }
        );
      }

      result = await verifyPasswordAuth(body.password);
    } else {
      return NextResponse.json(
        { error: "Invalid auth type. Use 'wallet' or 'password'" },
        { status: 400 }
      );
    }

    if (!result.success || !result.token) {
      return NextResponse.json(
        { error: result.error || "Authentication failed" },
        { status: 401 }
      );
    }

    // Set HTTP-only cookie
    const cookieStore = await cookies();
    cookieStore.set(ADMIN_TOKEN_COOKIE, result.token, getTokenCookieOptions());

    return NextResponse.json({
      success: true,
      message: "Logged in successfully",
    });
  } catch (error) {
    console.error("[Admin Auth] Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Logout
// ============================================================================

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(ADMIN_TOKEN_COOKIE);

    return NextResponse.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("[Admin Auth] Logout error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
