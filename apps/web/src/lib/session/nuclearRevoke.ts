"use client";

/**
 * Nuclear Revoke - On-Chain Delegation Invalidation
 *
 * Invalidates ALL active delegations by incrementing the NonceEnforcer nonce.
 * This is the "nuclear option" - use when session key is suspected compromised.
 *
 * Flow:
 * 1. Build UserOp with NonceEnforcer.incrementNonce()
 * 2. Sign with Web3Auth (owner signature required)
 * 3. Submit via bundler
 * 4. Wait for confirmation
 * 5. All delegations signed with old nonce become invalid
 *
 * After this, caller should rotate session key via executeQuickRotation().
 */

import {
  encodeFunctionData,
  getAddress,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { getDeleGatorEnvironment } from "@metamask/delegation-toolkit";

// Use testnet chain ID (10143) to get DTK environment since:
// 1. DTK doesn't have mainnet (143) in its registry yet
// 2. All DTK contracts are deployed at same CREATE2 addresses on both networks
const DTK_CHAIN_ID_FOR_ADDRESSES = 10143;

// ============================================================================
// ABI
// ============================================================================

const NONCE_ENFORCER_ABI = [
  {
    type: "function",
    name: "incrementNonce",
    stateMutability: "nonpayable",
    inputs: [{ name: "delegationManager", type: "address" }],
    outputs: [],
  },
] as const;

// ============================================================================
// Types
// ============================================================================

export interface NuclearRevokeConfig {
  /** Web3Auth wallet client for signing */
  walletClient: WalletClient;
  /** Owner address (Web3Auth EOA) */
  ownerAddress: Address;
  /** Delegator (smart account) address */
  delegator: Address;
  /** Smart account instance from onboarding */
  smartAccount: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Bundler client from onboarding */
  bundlerClient: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface NuclearRevokeResult {
  success: boolean;
  userOpHash?: Hex;
  transactionHash?: Hex;
  error?: string;
}

// ============================================================================
// Mock Detection
// ============================================================================

const isMockIdentity = process.env.NEXT_PUBLIC_PRAGMA_IDENTITY_PROVIDER === "mock";

// ============================================================================
// Main Function
// ============================================================================

/**
 * Execute nuclear revoke via NonceEnforcer.incrementNonce()
 *
 * This invalidates ALL delegations that were signed with the current nonce.
 * After this call, any in-flight delegations will fail with "NonceEnforcer:invalid-nonce".
 */
export async function executeNuclearRevoke(
  config: NuclearRevokeConfig
): Promise<NuclearRevokeResult> {
  try {
    const { smartAccount, bundlerClient } = config;

    // Get DTK environment for contract addresses
    // Uses testnet chain ID since DTK doesn't have mainnet (143) registered yet
    const environment = getDeleGatorEnvironment(DTK_CHAIN_ID_FOR_ADDRESSES);

    // Validate environment has required addresses
    const nonceEnforcerAddress = environment.caveatEnforcers?.NonceEnforcer;
    if (!nonceEnforcerAddress) {
      return {
        success: false,
        error: "NonceEnforcer address missing from environment. Cannot revoke delegations.",
      };
    }

    if (!environment.DelegationManager) {
      return {
        success: false,
        error: "DelegationManager address missing from environment. Cannot revoke delegations.",
      };
    }

    if (!environment.EntryPoint) {
      return {
        success: false,
        error: "EntryPoint address missing from environment. Cannot submit UserOp.",
      };
    }

    // Build the incrementNonce call
    const incrementData = encodeFunctionData({
      abi: NONCE_ENFORCER_ABI,
      functionName: "incrementNonce",
      args: [getAddress(environment.DelegationManager as Address)],
    });

    const calls: { to: Address; data: Hex; value?: bigint }[] = [
      { to: getAddress(nonceEnforcerAddress as Address), data: incrementData },
    ];

    // Handle mock identity provider (for testing)
    if (isMockIdentity) {
      console.log("[NuclearRevoke] Mock mode - simulating revoke");
      return {
        success: true,
        userOpHash: "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
        transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
      };
    }

    // Submit UserOp via bundler
    // The bundler will:
    // 1. Build UserOp with the calls
    // 2. Get signature from smartAccount (which uses Web3Auth wallet)
    // 3. Submit to EntryPoint
    const userOpHash = await bundlerClient.sendUserOperation({
      account: smartAccount,
      entryPointAddress: environment.EntryPoint as Address,
      calls,
    });

    // Wait for transaction confirmation
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: userOpHash,
      timeout: 60_000, // 60 second timeout
    });

    const transactionHash = receipt.receipt?.transactionHash as Hex | undefined;

    if (!transactionHash) {
      return {
        success: false,
        userOpHash,
        error: "UserOp completed but no transaction hash returned.",
      };
    }

    // Dispatch event for UI refresh (following H1 pattern)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("pragma:delegation:updated"));
    }

    return {
      success: true,
      userOpHash,
      transactionHash,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Parse common errors into user-friendly messages
    if (message.includes("insufficient funds")) {
      return {
        success: false,
        error: "Insufficient funds in smart account to pay for gas.",
      };
    }

    if (message.includes("rate limit") || message.includes("429")) {
      return {
        success: false,
        error: "Network is temporarily rate limited. Please try again in a moment.",
      };
    }

    return {
      success: false,
      error: `Revocation failed: ${message}`,
    };
  }
}
