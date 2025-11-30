/**
 * Transfer Delegation Builders
 *
 * Creates ephemeral delegations for token transfers (ERC20 and native).
 * These are separate from swap delegations because they have different
 * enforcement requirements.
 *
 * Security Model:
 * - ERC20 transfers: Enforce recipient (offset 4) + amount (offset 36) via AllowedCalldataEnforcer
 * - Native transfers: Enforce amount ONLY via nativeTokenTransferAmount scope (recipient NOT enforced)
 *
 * NOTE: Native transfers use amount-only enforcement. While recipient could theoretically be
 * substituted by an attacker with delegation access, the amount cap (maxAmount) provides the
 * critical protection against unlimited fund drain. This is a pragmatic trade-off accepted
 * to avoid complexity of full Execution struct validation.
 */

import { Address, Hex, getAddress, toHex } from "viem";
import {
  createDelegation,
  type Delegation,
  type Caveats,
} from "@metamask/delegation-toolkit";

import { buildDelegationTypedData } from "../../delegations/typedData.js";
import { ZERO_SALT } from "../../delegations/hybrid.js";
import {
  buildERC20TransferEnforcement,
} from "./calldataEnforcement.js";
import { getDTKEnvironment } from "../config.js";

// ============================================================================
// Constants
// ============================================================================

/** Ephemeral delegation expiry (5 minutes from now) */
const EPHEMERAL_EXPIRY_SECONDS = 5 * 60;

// ============================================================================
// Types
// ============================================================================

export interface ERC20TransferDelegationContext {
  /** Token contract address */
  tokenAddress: Address;
  /** Recipient address */
  recipient: Address;
  /** Transfer amount (wei/raw units) */
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
  /** Encoded transfer calldata */
  calldata: Hex;
}

export interface NativeTransferDelegationContext {
  /** Recipient address */
  recipient: Address;
  /** Transfer amount (wei) */
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

export interface TransferDelegationResult {
  /** DTK delegation object (unsigned) */
  delegation: Delegation;
  /** EIP-712 typed data for signing */
  typedData: ReturnType<typeof buildDelegationTypedData>;
  /** Number of calls allowed (always 1 for transfers) */
  callLimit: number;
  /** Expiry timestamp */
  expiresAt: number;
}

// ============================================================================
// Caveats Builder
// ============================================================================

/**
 * Build caveats for transfer delegation
 * Identical to swap caveats but extracted for clarity
 */
const buildTransferCaveats = (
  nonce: bigint,
  expiresAt: number,
  callLimit: number = 1
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
      limit: callLimit,
    },
  ] as unknown as Caveats;
};

// ============================================================================
// ERC20 Transfer Delegation
// ============================================================================

/**
 * Create ephemeral delegation for ERC20 transfer
 *
 * Enforces BOTH recipient and amount to prevent parameter manipulation attacks.
 *
 * Attack scenario without enforcement:
 * - User confirms: "send 100 USDC to Bob"
 * - Attacker modifies delegation: "send 1,000,000 USDC to Bob"
 * - Bob gets windfall, user loses funds
 *
 * @param context - Delegation context
 * @returns Unsigned delegation ready for Web3Auth signature
 *
 * @example
 * ```typescript
 * const result = createERC20TransferDelegation({
 *   tokenAddress: usdcAddress,
 *   recipient: bobAddress,
 *   amount: parseUnits("100", 6), // 100 USDC
 *   delegator: hybridDelegatorAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: currentNonce,
 *   chainId: MONAD_CHAIN_ID,
 *   delegationManager: DELEGATION_MANAGER_ADDRESS,
 *   calldata: encodeFunctionData(...),
 * });
 *
 * // Sign with Web3Auth
 * const signature = await walletClient.signTypedData(result.typedData);
 *
 * // Execute transaction with signed delegation
 * await executeWithDelegation({ ...result.delegation, signature });
 * ```
 */
export const createERC20TransferDelegation = (
  context: ERC20TransferDelegationContext
): TransferDelegationResult => {
  const {
    tokenAddress,
    recipient,
    amount,
    delegator,
    sessionKey,
    nonce,
    chainId,
    delegationManager,
    calldata,
  } = context;

  // Expiry: 5 minutes from now
  const expiresAt = Math.floor(Date.now() / 1000) + EPHEMERAL_EXPIRY_SECONDS;

  // Build enforcement for recipient + amount
  const allowedCalldata = buildERC20TransferEnforcement(recipient, amount);

  // Build scope with parameter enforcement
  const scope = {
    type: "functionCall" as const,
    targets: [getAddress(tokenAddress)],
    selectors: ["0xa9059cbb" as Hex], // ERC20.transfer(address,uint256)
    allowedCalldata, // Enforce recipient + amount (array of { startIndex, value })
  };

  // Build caveats (timestamp, nonce, limitedCalls)
  const caveats = buildTransferCaveats(nonce, expiresAt, 1);

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
    callLimit: 1,
    expiresAt,
  };
};

// ============================================================================
// Native Transfer Delegation
// ============================================================================

/**
 * Create ephemeral delegation for native MON transfer
 *
 * Uses `nativeTokenTransferAmount` scope with AMOUNT-ONLY enforcement.
 *
 * Security model:
 * - Amount: ✅ Enforced via maxAmount in nativeTokenTransferAmount scope
 * - Recipient: ❌ NOT enforced (pragmatic trade-off)
 *
 * SECURITY TRADE-OFF:
 * While recipient substitution is theoretically possible by an attacker with delegation access,
 * the amount cap provides critical protection against unlimited fund drain. This simplified
 * approach avoids complexity of full Execution struct validation (ExactExecutionEnforcer)
 * while maintaining the most important security constraint.
 *
 * @param context - Delegation context
 * @returns Unsigned delegation ready for Web3Auth signature
 *
 * @example
 * ```typescript
 * const result = createNativeTransferDelegation({
 *   recipient: aliceAddress,
 *   amount: parseEther("0.5"), // 0.5 MON (amount enforced)
 *   delegator: hybridDelegatorAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: currentNonce,
 *   chainId: MONAD_CHAIN_ID,
 *   delegationManager: DELEGATION_MANAGER_ADDRESS,
 * });
 *
 * // Sign with Web3Auth
 * const signature = await walletClient.signTypedData(result.typedData);
 *
 * // Execute transaction with signed delegation
 * await executeWithDelegation({ ...result.delegation, signature });
 * ```
 */
export const createNativeTransferDelegation = (
  context: NativeTransferDelegationContext
): TransferDelegationResult => {
  const {
    recipient,
    amount,
    delegator,
    sessionKey,
    nonce,
    chainId,
    delegationManager,
  } = context;

  // Expiry: 5 minutes from now
  const expiresAt = Math.floor(Date.now() / 1000) + EPHEMERAL_EXPIRY_SECONDS;

  // Build scope with amount enforcement only
  // NOTE: Recipient is NOT enforced - amount cap is the critical protection
  const scope = {
    type: "nativeTokenTransferAmount" as const,
    maxAmount: amount, // Enforces transfer amount
  };

  // Build caveats (timestamp, nonce, limitedCalls)
  const caveats = buildTransferCaveats(nonce, expiresAt, 1);

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
    callLimit: 1,
    expiresAt,
  };
};
