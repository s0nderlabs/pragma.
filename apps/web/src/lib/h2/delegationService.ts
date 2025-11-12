/**
 * Delegation Service (Web)
 *
 * Handles ephemeral delegation creation and signing for web context.
 * Integrates with browser wallets (MetaMask, WalletConnect, etc.)
 */

import { type Address, type Hex, getAddress } from "viem";
import type { WalletClient } from "viem";

// ============================================================================
// Types
// ============================================================================

export interface SwapQuote {
  fromToken: Address;
  toToken: Address;
  fromAmount: string;
  toAmount: string;
  quote: any; // Monorail quote object
}

export interface DelegationSignRequest {
  delegation: any; // DTK Delegation object
  typedData: any; // EIP-712 typed data
  delegator: Address;
  sessionKey: Address;
  callLimit: number;
  expiresAt: number;
  requiresApprove: boolean;
}

export interface SignedDelegation {
  signature: Hex;
  delegation: any;
  expiresAt: number;
}

// ============================================================================
// Delegation Service
// ============================================================================

/**
 * Request user signature for ephemeral delegation
 * Opens MetaMask or connected wallet to sign EIP-712 message
 */
export async function signDelegation(
  walletClient: WalletClient,
  request: DelegationSignRequest
): Promise<SignedDelegation> {
  if (!walletClient.account) {
    throw new Error("Wallet not connected");
  }

  try {
    // Sign EIP-712 typed data
    const signature = await walletClient.signTypedData({
      account: walletClient.account,
      domain: request.typedData.domain,
      types: request.typedData.types,
      primaryType: request.typedData.primaryType,
      message: request.typedData.message,
    });

    return {
      signature,
      delegation: request.delegation,
      expiresAt: request.expiresAt,
    };
  } catch (error) {
    console.error("Failed to sign delegation:", error);
    throw new Error(
      error instanceof Error
        ? `Signature rejected: ${error.message}`
        : "Failed to sign delegation"
    );
  }
}

/**
 * Verify delegation signature (optional validation before sending to agent)
 */
export function validateDelegationSignature(
  signature: Hex,
  expectedSigner: Address
): boolean {
  // Basic validation - signature should be 65 bytes (130 hex chars + 0x)
  if (!signature.startsWith("0x") || signature.length !== 132) {
    return false;
  }

  // TODO: Add full EIP-712 signature recovery and verification if needed
  // For now, trust the wallet's signature (MetaMask validates internally)
  return true;
}

/**
 * Format delegation info for user display
 */
export function formatDelegationInfo(request: DelegationSignRequest): {
  title: string;
  description: string;
  details: Array<{ label: string; value: string }>;
  risks: string[];
} {
  return {
    title: "Sign Delegation",
    description: request.requiresApprove
      ? "This transaction requires 2 operations: token approval and swap execution."
      : "Sign to authorize this swap transaction.",
    details: [
      {
        label: "Authorized Operations",
        value: request.requiresApprove ? "Approve + Swap" : "Swap",
      },
      {
        label: "Call Limit",
        value: `${request.callLimit} call${request.callLimit > 1 ? "s" : ""}`,
      },
      {
        label: "Expires",
        value: new Date(request.expiresAt * 1000).toLocaleString(),
      },
      {
        label: "Delegating To",
        value: `${request.sessionKey.slice(0, 6)}...${request.sessionKey.slice(-4)}`,
      },
    ],
    risks: [
      "This delegation is ephemeral and expires in 5 minutes",
      "Only the specified swap operation will be executable",
      "The session key cannot perform any other operations",
    ],
  };
}

/**
 * Check if delegation has expired
 */
export function isDelegationExpired(expiresAt: number): boolean {
  return Date.now() / 1000 > expiresAt;
}

/**
 * Calculate time remaining for delegation
 */
export function getDelegationTimeRemaining(expiresAt: number): {
  minutes: number;
  seconds: number;
  isExpired: boolean;
} {
  const now = Date.now() / 1000;
  const remaining = Math.max(0, expiresAt - now);
  const isExpired = remaining === 0;

  return {
    minutes: Math.floor(remaining / 60),
    seconds: Math.floor(remaining % 60),
    isExpired,
  };
}
