/**
 * Approve Delegation Builder
 *
 * Creates ephemeral delegations for ERC20 approve operations.
 * Used exclusively for swap operations that require token approval.
 *
 * Security Model:
 * - Enforces BOTH spender and amount parameters (offsets 4 + 36)
 * - Single-use delegation (limitedCalls: 1)
 * - 5-minute expiry
 * - Nonce-based revocation support
 *
 * Attack Prevention:
 * 1. Spender substitution: Enforces exact spender address from quote
 * 2. Amount manipulation: Enforces exact approval amount needed for swap
 *
 * @example
 * ```typescript
 * // User wants to swap USDC → MON, needs approve first
 * const approveDelegation = createApproveDelegation({
 *   tokenAddress: usdcAddress,
 *   spender: monorailAggregatorAddress, // From quote
 *   amount: parseUnits("100", 6), // Exact amount for swap
 *   delegator: userSmartAccountAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: currentNonce,
 *   chainId: MONAD_CHAIN_ID,
 *   delegationManager: DELEGATION_MANAGER_ADDRESS,
 * });
 *
 * // Sign with Web3Auth
 * const signature = await walletClient.signTypedData(approveDelegation.typedData);
 * approveDelegation.delegation.signature = signature;
 *
 * // Execute approve via session key
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
import { buildApproveEnforcement } from "./calldataEnforcement.js";
import { getDTKEnvironment } from "../config.js";

// ============================================================================
// Constants
// ============================================================================

/** Ephemeral delegation expiry (5 minutes from now) */
const EPHEMERAL_EXPIRY_SECONDS = 5 * 60;

/** ERC20 approve function selector */
const ERC20_APPROVE_SELECTOR = "0x095ea7b3" as Hex;

// ============================================================================
// Types
// ============================================================================

export interface ApproveDelegationContext {
  /** ERC20 token address to approve */
  tokenAddress: Address;
  /** Spender address (typically Monorail aggregator from quote) */
  spender: Address;
  /** Approval amount (wei/raw units) - exact amount needed for operation */
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

export interface ApproveDelegationResult {
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
 * Build caveats for approve delegation
 */
const buildApproveCaveats = (
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
      limit: 1, // Single-use: one approve call
    },
  ] as unknown as Caveats;
};

// ============================================================================
// Main API
// ============================================================================

/**
 * Create ephemeral delegation for ERC20 approve operation
 *
 * This is part of the multi-delegation swap architecture:
 * - ONE delegation = ONE blockchain action
 * - Approve is a separate action from swap
 * - Each delegation has its own enforcement rules
 *
 * Smart Approve Logic (handled by caller):
 * - Zero allowance → 1 approve delegation (set amount)
 * - Sufficient allowance → 0 approve delegations (skip)
 * - Insufficient allowance → 2 approve delegations (reset to 0, then set amount)
 *
 * @param context - Delegation context
 * @returns Unsigned delegation ready for Web3Auth signature
 *
 * @example
 * ```typescript
 * // Case 1: Zero allowance - single approve
 * const approveDelegation = createApproveDelegation({
 *   tokenAddress: usdcAddress,
 *   spender: aggregatorAddress,
 *   amount: parseUnits("100", 6),
 *   delegator: userAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: 10,
 *   chainId: 10143,
 *   delegationManager: DM_ADDRESS,
 * });
 *
 * // Case 2: Reset approve (for USDC/USDT safety)
 * const resetDelegation = createApproveDelegation({
 *   ...context,
 *   amount: 0n, // Reset to zero
 * });
 * ```
 */
export const createApproveDelegation = (
  context: ApproveDelegationContext
): ApproveDelegationResult => {
  const {
    tokenAddress,
    spender,
    amount,
    delegator,
    sessionKey,
    nonce,
    chainId,
    delegationManager,
  } = context;

  // Expiry: 5 minutes from now
  const expiresAt = Math.floor(Date.now() / 1000) + EPHEMERAL_EXPIRY_SECONDS;

  // Build enforcement for spender + amount
  const allowedCalldata = buildApproveEnforcement(spender, amount);

  // Build scope with parameter enforcement
  const scope = {
    type: "functionCall" as const,
    targets: [getAddress(tokenAddress)],
    selectors: [ERC20_APPROVE_SELECTOR],
    allowedCalldata, // Enforces spender (offset 4) + amount (offset 36)
  };

  // Build caveats (timestamp, nonce, limitedCalls: 1)
  const caveats = buildApproveCaveats(nonce, expiresAt);

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
