/**
 * Stake Delegation Builder (aPriori)
 *
 * Creates ephemeral delegations for staking MON into aprMON via aPriori protocol.
 *
 * Security Model:
 * - NO parameter enforcement (deposit() parameters handled at execution level)
 * - Single-use delegation (limitedCalls: 1)
 * - 5-minute expiry
 * - Nonce-based revocation support
 *
 * Why No Enforcement:
 * - deposit(uint256 assets, address receiver) has parameters BUT:
 *   - assets: Amount validation happens via msg.value enforcement
 *   - receiver: Always the delegator (user's smart account)
 * - Target enforcement (aPriori contract) provides sufficient protection
 * - Amount enforcement via execution value (msg.value)
 *
 * Fee Structure:
 * - Pragma: 0.5% fee on input amount (MON)
 * - Deducted from input before staking
 * - Example: User stakes 1.0 MON → 0.005 MON fee, 0.995 MON staked
 *
 * @example
 * ```typescript
 * // User wants to stake 1 MON → aprMON
 * const stakeDelegation = createStakeDelegation({
 *   aprioriAddress: APRIORI_ADDRESS,
 *   amount: parseEther("1.0"), // 1 MON to stake
 *   delegator: userSmartAccountAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: currentNonce,
 *   chainId: MONAD_CHAIN_ID,
 *   delegationManager: DELEGATION_MANAGER_ADDRESS,
 * });
 *
 * // Sign with Web3Auth
 * const signature = await walletClient.signTypedData(stakeDelegation.typedData);
 * stakeDelegation.delegation.signature = signature;
 *
 * // Execute stake via session key
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

/** aPriori deposit function selector: deposit(uint256,address) */
const APRIORI_DEPOSIT_SELECTOR = "0x6e553f65" as Hex;

// ============================================================================
// Types
// ============================================================================

export interface StakeDelegationContext {
  /** aPriori contract address */
  aprioriAddress: Address;
  /** Amount to stake (wei) - sent as msg.value */
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

export interface StakeDelegationResult {
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
 * Build caveats for stake delegation
 */
const buildStakeCaveats = (
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
      limit: 1, // Single-use: one stake call
    },
  ] as unknown as Caveats;
};

// ============================================================================
// Main API
// ============================================================================

/**
 * Create ephemeral delegation for staking MON into aprMON
 *
 * Operation:
 * 1. User has native MON balance
 * 2. Pragma deducts 0.5% fee
 * 3. Call aPriori.deposit(assets, receiver) with remaining amount as msg.value
 * 4. Receive aprMON liquid staking tokens
 *
 * @param context - Delegation context
 * @returns Unsigned delegation ready for Web3Auth signature
 *
 * @example
 * ```typescript
 * const stakeDelegation = createStakeDelegation({
 *   aprioriAddress: "0xb2f82D0f38dc453D596Ad40A37799446Cc89274A",
 *   amount: parseEther("0.5"), // Stake 0.5 MON
 *   delegator: userAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: 10,
 *   chainId: 10143,
 *   delegationManager: DM_ADDRESS,
 * });
 * ```
 */
export const createStakeDelegation = (
  context: StakeDelegationContext
): StakeDelegationResult => {
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
  // deposit(uint256 assets, address receiver) parameters:
  // - assets: Will match msg.value (enforced at execution level)
  // - receiver: Will be delegator address (enforced at execution level)
  const scope = {
    type: "functionCall" as const,
    targets: [getAddress(aprioriAddress)],
    selectors: [APRIORI_DEPOSIT_SELECTOR],
    // NO allowedCalldata - parameters validated at execution time
  };

  // Build caveats (timestamp, nonce, limitedCalls: 1)
  const caveats = buildStakeCaveats(nonce, expiresAt);

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
