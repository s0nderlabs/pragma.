/**
 * Swap Delegation Builder
 *
 * Creates ephemeral delegations for DEX swap operations via Monorail aggregator.
 * Used for all swap types: native→ERC20, ERC20→native, ERC20→ERC20.
 *
 * Security Model:
 * - Enforces ONLY destination parameter (offset 132)
 * - Single-use delegation (limitedCalls: 1)
 * - 5-minute expiry
 * - Nonce-based revocation support
 *
 * Why Only Destination is Enforced:
 * - tokenIn/tokenOut: Already protected by target whitelisting in scope
 * - amountIn: Balance validation prevents over-spending
 * - minAmountOut: We patch this for slippage adjustment (cannot enforce)
 * - destination: CRITICAL - prevents output theft attack
 *
 * Attack Prevention:
 * - Output theft: Enforces swap output goes to user's smart account
 *
 * @example
 * ```typescript
 * // User wants to swap USDC → MON
 * const swapDelegation = createSwapDelegation({
 *   aggregator: monorailAggregatorAddress,
 *   transactionData: quote.transactionData, // Monorail calldata
 *   transactionValue: 0n, // No native value for ERC20→native
 *   destination: userSmartAccountAddress, // Where swap output goes
 *   delegator: userSmartAccountAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: currentNonce,
 *   chainId: MONAD_CHAIN_ID,
 *   delegationManager: DELEGATION_MANAGER_ADDRESS,
 * });
 *
 * // Sign with Web3Auth
 * const signature = await walletClient.signTypedData(swapDelegation.typedData);
 * swapDelegation.delegation.signature = signature;
 *
 * // Execute swap via session key
 * await redeemDelegations(...);
 * ```
 */

import { Address, Hex, getAddress, toHex, keccak256, concat, numberToHex } from "viem";
import {
  createDelegation,
  type Delegation,
  type Caveats,
} from "@metamask/delegation-toolkit";

import { buildDelegationTypedData } from "../../delegations/typedData.js";
import { ZERO_SALT } from "../../delegations/hybrid.js";
import { buildSwapEnforcement } from "./calldataEnforcement.js";
import { getDTKEnvironment } from "../config.js";

// ============================================================================
// Constants
// ============================================================================

/** Ephemeral delegation expiry (5 minutes from now) */
const EPHEMERAL_EXPIRY_SECONDS = 5 * 60;

// ============================================================================
// Types
// ============================================================================

export interface SwapDelegationContext {
  /** Monorail aggregator address (from quote) */
  aggregator: Address;
  /** Transaction calldata from Monorail quote */
  transactionData: Hex;
  /** Transaction value (wei) - for native token swaps */
  transactionValue: bigint;
  /** Destination address for swap output (user's smart account) */
  destination: Address;
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

export interface SwapDelegationResult {
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
 * Extract function selector from calldata
 */
const extractSelector = (calldata: Hex): Hex => {
  if (!calldata || calldata === "0x" || calldata.length < 10) {
    throw new Error(`Invalid calldata for selector extraction: ${calldata}`);
  }
  return calldata.slice(0, 10) as Hex;
};

/**
 * Build caveats for swap delegation
 */
const buildSwapCaveats = (
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
      limit: 1, // Single-use: one swap call
    },
  ] as unknown as Caveats;
};

// ============================================================================
// Main API
// ============================================================================

/**
 * Create ephemeral delegation for DEX swap operation
 *
 * This is part of the multi-delegation swap architecture:
 * - ONE delegation = ONE blockchain action
 * - Swap is a separate action from approve
 * - Each delegation has its own enforcement rules
 *
 * Swap Types Supported:
 * - Native → ERC20: MON → USDC (no approve needed)
 * - ERC20 → Native: USDC → MON (approve delegation needed first)
 * - ERC20 → ERC20: USDC → DAK (approve delegation needed first)
 *
 * @param context - Delegation context
 * @returns Unsigned delegation ready for Web3Auth signature
 *
 * @example
 * ```typescript
 * // Native → ERC20 (no approve needed)
 * const swapDelegation = createSwapDelegation({
 *   aggregator: quote.aggregator,
 *   transactionData: quote.transactionData,
 *   transactionValue: parseEther("1.0"), // 1 MON
 *   destination: userAddress,
 *   delegator: userAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: 10,
 *   chainId: 10143,
 *   delegationManager: DM_ADDRESS,
 * });
 *
 * // ERC20 → Native (approve delegation executed first)
 * const swapDelegation = createSwapDelegation({
 *   aggregator: quote.aggregator,
 *   transactionData: quote.transactionData,
 *   transactionValue: 0n, // No native value
 *   destination: userAddress,
 *   delegator: userAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: 10, // Same nonce as approve delegation!
 *   chainId: 10143,
 *   delegationManager: DM_ADDRESS,
 * });
 * ```
 */
export const createSwapDelegation = (
  context: SwapDelegationContext
): SwapDelegationResult => {
  const {
    aggregator,
    transactionData,
    destination,
    delegator,
    sessionKey,
    nonce,
    chainId,
    delegationManager,
  } = context;

  // Expiry: 5 minutes from now
  const expiresAt = Math.floor(Date.now() / 1000) + EPHEMERAL_EXPIRY_SECONDS;

  // Extract function selector from Monorail calldata
  const selector = extractSelector(transactionData);

  // Build enforcement for destination only
  const allowedCalldata = buildSwapEnforcement(destination);

  // Build scope with destination enforcement
  const scope = {
    type: "functionCall" as const,
    targets: [getAddress(aggregator)],
    selectors: [selector],
    allowedCalldata, // Enforces destination (offset 132)
  };

  // Build caveats (timestamp, nonce, limitedCalls: 1)
  const caveats = buildSwapCaveats(nonce, expiresAt);

  // Get DTK environment (uses workaround chain ID - see config.ts)
  const environment = getDTKEnvironment();

  // Generate unique salt for this delegation
  // CRITICAL: Each delegation must have unique salt to prevent hash collisions
  // when executing parallel operations with the same nonce
  // Hash includes: timestamp + random + nonce for guaranteed uniqueness
  const uniqueSalt = keccak256(
    concat([
      numberToHex(Date.now(), { size: 32 }),      // Timestamp (millisecond precision)
      numberToHex(Math.floor(Math.random() * 1e18), { size: 32 }), // Random value
      toHex(nonce),                                // Current nonce
    ])
  );

  // Create unsigned delegation
  const delegation = createDelegation({
    environment,
    scope,
    from: delegator as Hex,
    to: sessionKey as Hex,
    caveats,
    salt: uniqueSalt,  // Unique salt prevents delegation hash collisions
  });

  // Build EIP-712 typed data for signing
  const typedData = buildDelegationTypedData(delegation, chainId, delegationManager);

  return {
    delegation,
    typedData,
    expiresAt,
  };
};
