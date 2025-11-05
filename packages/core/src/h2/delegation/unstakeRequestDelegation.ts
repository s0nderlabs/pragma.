/**
 * Unstake Request Delegation Builder (aPriori)
 *
 * Creates ephemeral delegations for requesting aprMON → MON redemption via aPriori.
 * This is step 1 of the two-step unstaking process.
 *
 * Security Model:
 * - NO parameter enforcement (parameters validated at execution level)
 * - Single-use delegation (limitedCalls: 1)
 * - 5-minute expiry
 * - Nonce-based revocation support
 *
 * Why No Enforcement:
 * - requestRedeem(uint256 shares, address controller, address owner) parameters:
 *   - shares: Amount of aprMON to unstake (user-controlled, validated via balance check)
 *   - controller: Address that can claim (always delegator)
 *   - owner: Address that owns the shares (always delegator)
 * - Target enforcement (aPriori contract) provides sufficient protection
 *
 * Two-Step Unstaking Flow:
 * 1. requestRedeem() - Creates withdrawal request, returns requestId
 * 2. Wait for epoch to pass (12-18 hours)
 * 3. redeem(requestId) - Claims MON (separate tool)
 *
 * @example
 * ```typescript
 * // User wants to unstake 1 aprMON
 * const unstakeRequestDelegation = createUnstakeRequestDelegation({
 *   aprioriAddress: APRIORI_ADDRESS,
 *   shares: parseEther("1.0"), // 1 aprMON to unstake
 *   delegator: userSmartAccountAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: currentNonce,
 *   chainId: MONAD_CHAIN_ID,
 *   delegationManager: DELEGATION_MANAGER_ADDRESS,
 * });
 *
 * // Sign with Web3Auth
 * const signature = await walletClient.signTypedData(unstakeRequestDelegation.typedData);
 * unstakeRequestDelegation.delegation.signature = signature;
 *
 * // Execute request via session key
 * await redeemDelegations(...);
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

/** aPriori requestRedeem function selector: requestRedeem(uint256,address,address) */
const APRIORI_REQUEST_REDEEM_SELECTOR = "0x7d41c86e" as Hex;

// ============================================================================
// Types
// ============================================================================

export interface UnstakeRequestDelegationContext {
  /** aPriori contract address */
  aprioriAddress: Address;
  /** Amount of aprMON shares to unstake (wei) */
  shares: bigint;
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

export interface UnstakeRequestDelegationResult {
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
 * Build caveats for unstake request delegation
 */
const buildUnstakeRequestCaveats = (
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
      limit: 1, // Single-use: one unstake request call
    },
  ] as unknown as Caveats;
};

// ============================================================================
// Main API
// ============================================================================

/**
 * Create ephemeral delegation for requesting aprMON unstaking
 *
 * Operation:
 * 1. User has aprMON balance
 * 2. Call aPriori.requestRedeem(shares, controller, owner)
 * 3. Receive requestId for later claiming
 * 4. Wait for epoch to pass (12-18 hours)
 * 5. Use unstakeClaimTool to get MON back
 *
 * @param context - Delegation context
 * @returns Unsigned delegation ready for Web3Auth signature
 *
 * @example
 * ```typescript
 * const unstakeRequestDelegation = createUnstakeRequestDelegation({
 *   aprioriAddress: "0xb2f82D0f38dc453D596Ad40A37799446Cc89274A",
 *   shares: parseEther("0.5"), // Unstake 0.5 aprMON
 *   delegator: userAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: 10,
 *   chainId: 10143,
 *   delegationManager: DM_ADDRESS,
 * });
 * ```
 */
export const createUnstakeRequestDelegation = (
  context: UnstakeRequestDelegationContext
): UnstakeRequestDelegationResult => {
  const {
    aprioriAddress,
    delegator,
    sessionKey,
    nonce,
    chainId,
    delegationManager,
  } = context;

  // Expiry: 5 minutes from now
  const expiresAt = Math.floor(Date.now() / 1000) + EPHEMERAL_EXPIRY_SECONDS;

  // Build scope WITHOUT parameter enforcement
  // requestRedeem(uint256 shares, address controller, address owner) parameters:
  // - shares: Amount to unstake (validated via balance check)
  // - controller: Who can claim (will be delegator)
  // - owner: Who owns shares (will be delegator)
  const scope = {
    type: "functionCall" as const,
    targets: [getAddress(aprioriAddress)],
    selectors: [APRIORI_REQUEST_REDEEM_SELECTOR],
    // NO allowedCalldata - parameters validated at execution time
  };

  // Build caveats (timestamp, nonce, limitedCalls: 1)
  const caveats = buildUnstakeRequestCaveats(nonce, expiresAt);

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
