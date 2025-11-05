/**
 * Unstake Claim Delegation Builder (aPriori)
 *
 * Creates ephemeral delegations for claiming MON from completed withdrawal requests.
 * This is step 2 of the two-step unstaking process.
 *
 * Security Model:
 * - NO parameter enforcement (requestIds validated at execution level)
 * - Single-use delegation (limitedCalls: 1)
 * - 5-minute expiry
 * - Nonce-based revocation support
 * - Supports BOTH single and batch claiming (gas optimization)
 *
 * Why No Enforcement:
 * - redeem(uint256 requestId) - single claim
 * - redeem(uint256[] requestIds) - batch claim (more gas efficient)
 * - requestIds: User-controlled array of completed requests
 * - Target enforcement (aPriori contract) provides sufficient protection
 * - Only claimable requests can be claimed (protocol-level validation)
 *
 * Batch Support:
 * - User can claim multiple completed requests in one transaction
 * - Saves gas compared to multiple individual claims
 * - Same delegation pattern, just different function selector
 *
 * @example
 * ```typescript
 * // Single claim
 * const claimDelegation = createUnstakeClaimDelegation({
 *   aprioriAddress: APRIORI_ADDRESS,
 *   batchClaim: false,
 *   delegator: userSmartAccountAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: currentNonce,
 *   chainId: MONAD_CHAIN_ID,
 *   delegationManager: DELEGATION_MANAGER_ADDRESS,
 * });
 *
 * // Batch claim
 * const batchClaimDelegation = createUnstakeClaimDelegation({
 *   aprioriAddress: APRIORI_ADDRESS,
 *   batchClaim: true,
 *   delegator: userSmartAccountAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: currentNonce,
 *   chainId: MONAD_CHAIN_ID,
 *   delegationManager: DELEGATION_MANAGER_ADDRESS,
 * });
 * ```
 */

import { Address, Hex, getAddress, toHex } from "viem";
import {
  createDelegation,
  getDeleGatorEnvironment,
  type Delegation,
  type Caveats,
} from "@metamask/delegation-toolkit";

import { buildDelegationTypedData } from "../../delegations/typedData.js";
import { ZERO_SALT } from "../../delegations/hybrid.js";

// ============================================================================
// Constants
// ============================================================================

/** Ephemeral delegation expiry (5 minutes from now) */
const EPHEMERAL_EXPIRY_SECONDS = 5 * 60;

/** aPriori redeem (single) function selector: redeem(uint256,address) */
const APRIORI_REDEEM_SINGLE_SELECTOR = "0x7bde82f2" as Hex;

/** aPriori redeem (batch) function selector: redeem(uint256[],address) */
const APRIORI_REDEEM_BATCH_SELECTOR = "0x492e47d2" as Hex;

// ============================================================================
// Types
// ============================================================================

export interface UnstakeClaimDelegationContext {
  /** aPriori contract address */
  aprioriAddress: Address;
  /** Whether this is a batch claim (multiple requestIds) or single claim */
  batchClaim: boolean;
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

export interface UnstakeClaimDelegationResult {
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
 * Build caveats for unstake claim delegation
 */
const buildUnstakeClaimCaveats = (
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
      limit: 1, // Single-use: one claim call (single or batch)
    },
  ] as unknown as Caveats;
};

// ============================================================================
// Main API
// ============================================================================

/**
 * Create ephemeral delegation for claiming MON from completed withdrawal requests
 *
 * Supports both single and batch claiming:
 * - Single: redeem(uint256 requestId)
 * - Batch: redeem(uint256[] requestIds) - more gas efficient
 *
 * Operation:
 * 1. User has completed withdrawal request(s) (claimable = true)
 * 2. Call aPriori.redeem(requestId) or aPriori.redeem(requestIds[])
 * 3. Receive MON back from staking protocol
 * 4. Pay 0.1% aPriori protocol fee on claimed amount
 *
 * @param context - Delegation context
 * @returns Unsigned delegation ready for Web3Auth signature
 *
 * @example
 * ```typescript
 * // Single claim
 * const claimDelegation = createUnstakeClaimDelegation({
 *   aprioriAddress: "0xb2f82D0f38dc453D596Ad40A37799446Cc89274A",
 *   batchClaim: false,
 *   delegator: userAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: 10,
 *   chainId: 10143,
 *   delegationManager: DM_ADDRESS,
 * });
 *
 * // Batch claim
 * const batchClaimDelegation = createUnstakeClaimDelegation({
 *   aprioriAddress: "0xb2f82D0f38dc453D596Ad40A37799446Cc89274A",
 *   batchClaim: true,
 *   delegator: userAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: 11,
 *   chainId: 10143,
 *   delegationManager: DM_ADDRESS,
 * });
 * ```
 */
export const createUnstakeClaimDelegation = (
  context: UnstakeClaimDelegationContext
): UnstakeClaimDelegationResult => {
  const {
    aprioriAddress,
    batchClaim,
    delegator,
    sessionKey,
    nonce,
    chainId,
    delegationManager,
  } = context;

  // Expiry: 5 minutes from now
  const expiresAt = Math.floor(Date.now() / 1000) + EPHEMERAL_EXPIRY_SECONDS;

  // Build scope - supports both single and batch claim selectors
  // Single: redeem(uint256 requestId)
  // Batch: redeem(uint256[] requestIds)
  const selector = batchClaim ? APRIORI_REDEEM_BATCH_SELECTOR : APRIORI_REDEEM_SINGLE_SELECTOR;

  const scope = {
    type: "functionCall" as const,
    targets: [getAddress(aprioriAddress)],
    selectors: [selector],
    // NO allowedCalldata - requestIds validated at execution time
  };

  // Build caveats (timestamp, nonce, limitedCalls: 1)
  const caveats = buildUnstakeClaimCaveats(nonce, expiresAt);

  // Get DTK environment
  const environment = getDeleGatorEnvironment(chainId);

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
