/**
 * Wrap Delegation Builder
 *
 * Creates ephemeral delegations for wrapping native MON into WMON (ERC20).
 * Simplest delegation type - no parameter enforcement needed.
 *
 * Security Model:
 * - NO parameter enforcement (deposit() has no parameters)
 * - Single-use delegation (limitedCalls: 1)
 * - 5-minute expiry
 * - Nonce-based revocation support
 *
 * Why No Enforcement:
 * - deposit() function signature: `function deposit() external payable`
 * - No parameters → nothing to enforce
 * - Amount is sent via msg.value (not calldata parameter)
 * - Target enforcement (WMON contract) provides sufficient protection
 *
 * @example
 * ```typescript
 * // User wants to wrap 1 MON → 1 WMON
 * const wrapDelegation = createWrapDelegation({
 *   wmonAddress: WMON_ADDRESS,
 *   amount: parseEther("1.0"), // 1 MON to wrap
 *   delegator: userSmartAccountAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: currentNonce,
 *   chainId: MONAD_CHAIN_ID,
 *   delegationManager: DELEGATION_MANAGER_ADDRESS,
 * });
 *
 * // Sign with Web3Auth
 * const signature = await walletClient.signTypedData(wrapDelegation.typedData);
 * wrapDelegation.delegation.signature = signature;
 *
 * // Execute wrap via session key
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

/** WMON deposit function selector */
const WMON_DEPOSIT_SELECTOR = "0xd0e30db0" as Hex;

// ============================================================================
// Types
// ============================================================================

export interface WrapDelegationContext {
  /** WMON contract address */
  wmonAddress: Address;
  /** Amount to wrap (wei) - sent as msg.value, not calldata */
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

export interface WrapDelegationResult {
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
 * Build caveats for wrap delegation
 */
const buildWrapCaveats = (
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
      limit: 1, // Single-use: one wrap call
    },
  ] as unknown as Caveats;
};

// ============================================================================
// Main API
// ============================================================================

/**
 * Create ephemeral delegation for wrapping native MON into WMON
 *
 * This is the simplest delegation type:
 * - ONE delegation = ONE blockchain action (wrap)
 * - No parameters to enforce (deposit() takes no args)
 * - Target enforcement (WMON contract) is sufficient protection
 *
 * Operation:
 * 1. User has native MON balance
 * 2. Call WMON.deposit() with msg.value = amount
 * 3. Receive equal amount of WMON ERC20 tokens
 *
 * @param context - Delegation context
 * @returns Unsigned delegation ready for Web3Auth signature
 *
 * @example
 * ```typescript
 * const wrapDelegation = createWrapDelegation({
 *   wmonAddress: "0x3bd359c1119da7da1d913d1c4d2b7c461115433a", // mainnet
 *   amount: parseEther("0.5"), // Wrap 0.5 MON
 *   delegator: userAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: 10,
 *   chainId: 143, // mainnet
 *   delegationManager: DM_ADDRESS,
 * });
 * ```
 */
export const createWrapDelegation = (
  context: WrapDelegationContext
): WrapDelegationResult => {
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

  // Build scope WITHOUT parameter enforcement (deposit has no parameters)
  const scope = {
    type: "functionCall" as const,
    targets: [getAddress(wmonAddress)],
    selectors: [WMON_DEPOSIT_SELECTOR],
    // NO allowedCalldata - deposit() has no parameters to enforce
  };

  // Build caveats (timestamp, nonce, limitedCalls: 1)
  const caveats = buildWrapCaveats(nonce, expiresAt);

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
