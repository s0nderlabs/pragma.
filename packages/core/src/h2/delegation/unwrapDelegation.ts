/**
 * Unwrap Delegation Builder
 *
 * Creates ephemeral delegations for unwrapping WMON (ERC20) back to native MON.
 * Minimal enforcement needed - only validates target.
 *
 * Security Model:
 * - NO parameter enforcement (withdraw() parameter is at offset 4, not 132)
 * - Single-use delegation (limitedCalls: 1)
 * - 5-minute expiry
 * - Nonce-based revocation support
 *
 * Why No Enforcement:
 * - withdraw(uint256) function signature: `function withdraw(uint256 wad) external`
 * - Only 1 parameter (amount at offset 4)
 * - Our enforcement system enforces offset 132 (doesn't exist in withdraw calldata)
 * - Target enforcement (WMON contract) + balance check provides sufficient protection
 *
 * Security Trade-off:
 * - Amount parameter is NOT enforced (would need enforcement at offset 4)
 * - Balance validation prevents over-unwrapping (can't unwrap more than owned)
 * - User confirms quote with exact amount before delegation is created
 *
 * @example
 * ```typescript
 * // User wants to unwrap 1 WMON → 1 MON
 * const unwrapDelegation = createUnwrapDelegation({
 *   wmonAddress: WMON_ADDRESS,
 *   amount: parseEther("1.0"), // 1 WMON to unwrap
 *   delegator: userSmartAccountAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: currentNonce,
 *   chainId: MONAD_CHAIN_ID,
 *   delegationManager: DELEGATION_MANAGER_ADDRESS,
 * });
 *
 * // Sign with Web3Auth
 * const signature = await walletClient.signTypedData(unwrapDelegation.typedData);
 * unwrapDelegation.delegation.signature = signature;
 *
 * // Execute unwrap via session key
 * await redeemDelegations(...);
 * ```
 */

import { Address, Hex, getAddress, toHex } from "viem";
import {
  createDelegation,
  type Delegation,
  type Caveats,
} from "@metamask/delegation-toolkit";

import { buildDelegationTypedData } from "../../delegations/typedData.js";
import { ZERO_SALT } from "../../delegations/hybrid.js";
import { getDTKEnvironment } from "../config.js";

// ============================================================================
// Constants
// ============================================================================

/** Ephemeral delegation expiry (5 minutes from now) */
const EPHEMERAL_EXPIRY_SECONDS = 5 * 60;

/** WMON withdraw function selector */
const WMON_WITHDRAW_SELECTOR = "0x2e1a7d4d" as Hex;

// ============================================================================
// Types
// ============================================================================

export interface UnwrapDelegationContext {
  /** WMON contract address */
  wmonAddress: Address;
  /** Amount to unwrap (wei) - sent as calldata parameter at offset 4 */
  amount: bigint;
  /** HybridDelegator address (delegator) */
  delegator: Address;
  /** Session key address (delegate) */
  sessionKey: Address;
  /** Current nonce from DelegationManager */
  nonce: bigint;
  /** Chain ID (e.g., Monad testnet) */
  chainId: number;
  /** DelegationManager contract address */
  delegationManager: Address;
}

export interface UnwrapDelegationResult {
  /** DTK delegation object (unsigned) */
  delegation: Delegation;
  /** EIP-712 typed data for signing */
  typedData: ReturnType<typeof buildDelegationTypedData>;
  /** Expiry timestamp */
  expiresAt: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build caveats for unwrap delegation
 */
const buildUnwrapCaveats = (
  nonce: bigint,
  expiresAt: number
): Caveats => {
  return [
    {
      type: "timestamp" as const,
      afterThreshold: 0,
      beforeThreshold: expiresAt,
    },
    {
      type: "nonce" as const,
      nonce: toHex(nonce),
    },
    {
      type: "limitedCalls" as const,
      limit: 1, // Single-use: one unwrap call
    },
  ] as unknown as Caveats;
};

// ============================================================================
// Main API
// ============================================================================

/**
 * Create ephemeral delegation for unwrapping WMON back to native MON
 *
 * This is a simple delegation type:
 * - ONE delegation = ONE blockchain action (unwrap)
 * - No parameter enforcement (amount at offset 4, not enforceable with our system)
 * - Target enforcement (WMON contract) + balance validation provides protection
 *
 * Operation:
 * 1. User has WMON ERC20 balance
 * 2. Call WMON.withdraw(amount)
 * 3. Receive equal amount of native MON
 *
 * @param context - Delegation context
 * @returns Unsigned delegation ready for Web3Auth signature
 *
 * @example
 * ```typescript
 * const unwrapDelegation = createUnwrapDelegation({
 *   wmonAddress: "0x3bd359c1119da7da1d913d1c4d2b7c461115433a", // mainnet
 *   amount: parseEther("0.5"), // Unwrap 0.5 WMON
 *   delegator: userAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: 10,
 *   chainId: 143, // mainnet
 *   delegationManager: DM_ADDRESS,
 * });
 * ```
 */
export const createUnwrapDelegation = (
  context: UnwrapDelegationContext
): UnwrapDelegationResult => {
  const {
    wmonAddress,
    delegator,
    sessionKey,
    nonce,
    chainId,
    delegationManager,
  } = context;

  // Expiry: 5 minutes from now
  const expiresAt = Math.floor(Date.now() / 1000) + EPHEMERAL_EXPIRY_SECONDS;

  // Build scope WITHOUT parameter enforcement
  // withdraw(uint256) has amount at offset 4, not 132
  // Our enforcement system is designed for offset 132 (swap destination)
  const scope = {
    type: "functionCall" as const,
    targets: [getAddress(wmonAddress)],
    selectors: [WMON_WITHDRAW_SELECTOR],
    // NO allowedCalldata - amount parameter is at wrong offset for our system
  };

  // Build caveats (timestamp, nonce, limitedCalls: 1)
  const caveats = buildUnwrapCaveats(nonce, expiresAt);

  // Get DTK environment (uses workaround chain ID - see config.ts)
  const environment = getDTKEnvironment();

  // Create unsigned delegation
  const delegation = createDelegation({
    environment,
    scope,
    from: delegator as Hex,
    to: sessionKey as Hex,
    caveats,
    salt: ZERO_SALT,
  });

  // Build EIP-712 typed data for signing
  const typedData = buildDelegationTypedData(delegation, chainId, delegationManager);

  return {
    delegation,
    typedData,
    expiresAt,
  };
};
