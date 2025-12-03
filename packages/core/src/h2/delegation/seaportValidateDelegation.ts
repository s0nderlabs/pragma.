/**
 * Seaport Validate Delegation Builder
 *
 * Creates ephemeral delegations for Seaport.validate() operations.
 * Used to validate NFT listing orders on-chain from smart accounts.
 *
 * Key Insight: When the offerer (smart account) calls validate(), no signature
 * is required for the order. This bypasses OpenSea API's offline signature
 * validation which doesn't support EIP-1271 smart account signatures.
 *
 * Security Model:
 * - Target: Seaport contract only
 * - Selector: validate only (0x88147732)
 * - Single-use delegation (limitedCalls: 1)
 * - 5-minute expiry
 * - Nonce-based revocation support
 *
 * @example
 * ```typescript
 * const validateDelegation = createSeaportValidateDelegation({
 *   delegator: userSmartAccountAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: currentNonce,
 *   chainId: MONAD_CHAIN_ID,
 *   delegationManager: DELEGATION_MANAGER_ADDRESS,
 * });
 *
 * // Sign with Web3Auth
 * const signature = await web3authBridge.signTypedData(validateDelegation.typedData);
 * validateDelegation.delegation.signature = signature;
 *
 * // Execute via session key - calls Seaport.validate([order])
 * await redeemDelegations(...);
 * ```
 */

import { Address, Hex, toHex } from "viem";
import {
  createDelegation,
  type Delegation,
  type Caveats,
} from "@metamask/delegation-toolkit";

import { buildDelegationTypedData } from "../../delegations/typedData.js";
import { ZERO_SALT } from "../../delegations/hybrid.js";
import { getDTKEnvironment } from "../config.js";
import {
  SEAPORT_ADDRESS,
  SEAPORT_VALIDATE_SELECTOR,
} from "../../opensea/seaportOrder.js";

// ============================================================================
// Constants
// ============================================================================

/** Ephemeral delegation expiry (5 minutes from now) */
const EPHEMERAL_EXPIRY_SECONDS = 5 * 60;

// ============================================================================
// Types
// ============================================================================

export interface SeaportValidateDelegationContext {
  /** HybridDelegator address (delegator/offerer) */
  delegator: Address;
  /** Session key address (delegate) */
  sessionKey: Address;
  /** Current nonce from DelegationManager */
  nonce: bigint;
  /** Chain ID (e.g., 143 for Monad mainnet) */
  chainId: number;
  /** DelegationManager contract address */
  delegationManager: Address;
}

export interface SeaportValidateDelegationResult {
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
 * Build caveats for Seaport validate delegation
 */
const buildSeaportValidateCaveats = (
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
      limit: 1, // Single-use: one validate call per listing
    },
  ] as unknown as Caveats;
};

// ============================================================================
// Main API
// ============================================================================

/**
 * Create ephemeral delegation for Seaport.validate() operation
 *
 * This delegation allows the session key to call validate() on the Seaport
 * contract. Since the smart account (offerer) is calling through delegation,
 * no order signature is required.
 *
 * The delegation enforces:
 * - Target: Seaport contract only
 * - Selector: validate only (0x88147732)
 * - No parameter enforcement (validation only benefits the offerer)
 *
 * @param context - Delegation context
 * @returns Unsigned delegation ready for Web3Auth signature
 */
export const createSeaportValidateDelegation = (
  context: SeaportValidateDelegationContext
): SeaportValidateDelegationResult => {
  const {
    delegator,
    sessionKey,
    nonce,
    chainId,
    delegationManager,
  } = context;

  // Expiry: 5 minutes from now
  const expiresAt = Math.floor(Date.now() / 1000) + EPHEMERAL_EXPIRY_SECONDS;

  // Build scope - only allow validate() on Seaport
  // Note: We don't enforce parameters because:
  // 1. validate() can only be called by offerer without signature
  // 2. Validation only benefits the offerer (makes their order fillable)
  // 3. The order parameters are verified by Seaport itself
  const scope = {
    type: "functionCall" as const,
    targets: [SEAPORT_ADDRESS],
    selectors: [SEAPORT_VALIDATE_SELECTOR],
  };

  // Build caveats (timestamp, nonce, limitedCalls: 1)
  const caveats = buildSeaportValidateCaveats(nonce, expiresAt);

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
