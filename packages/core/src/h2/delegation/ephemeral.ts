/**
 * Ephemeral Delegation Service (H2)
 *
 * Creates one-time use delegations AFTER quote confirmation.
 * Key differences from H1 persistent delegations:
 * - Created just-in-time (after user confirms quote)
 * - Exact calldata enforcement (byte-for-byte match)
 * - Short-lived (5min expiry)
 * - Single-use (1-2 calls depending on ERC20 approve)
 * - Not stored in localStorage (ephemeral)
 */

import { Address, Hex, getAddress, toHex, parseEther } from "viem";
import { createDelegation, type Delegation, type Caveats } from "@metamask/delegation-toolkit";

import type { MonorailQuote } from "../../monorail/pathfinder.js";
import { buildDelegationTypedData } from "../../delegations/typedData.js";
import { ZERO_SALT } from "../../delegations/hybrid.js";
import { buildSwapEnforcement } from "./calldataEnforcement.js";
import { getDTKEnvironment } from "../config.js";

// ============================================================================
// Types
// ============================================================================

export interface EphemeralDelegationContext {
  /** Monorail quote with transaction data */
  quote: MonorailQuote;
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
  /** Source token address (for ERC20 approve detection) */
  fromToken: Address;
  /** Destination token address */
  toToken: Address;
  /** Native token address (e.g., MON on Monad) */
  nativeTokenAddress: Address;
  /** Current allowance (for smart approve) */
  currentAllowance: bigint;
  /** Required amount for swap */
  requiredAmount: bigint;
  /** Skip parameter enforcement (for operations without destination parameter like wrap/unwrap) */
  skipParameterEnforcement?: boolean;
}

export interface EphemeralDelegationResult {
  /** DTK delegation object (unsigned) */
  delegation: Delegation;
  /** EIP-712 typed data for signing */
  typedData: ReturnType<typeof buildDelegationTypedData>;
  /** Number of calls allowed (1 or 2) */
  callLimit: number;
  /** Expiry timestamp */
  expiresAt: number;
  /** Whether ERC20 approve is needed */
  requiresApprove: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Ephemeral delegation expiry (5 minutes from now) */
const EPHEMERAL_EXPIRY_SECONDS = 5 * 60;

/** Native token sentinel address (0xEEE...) */
const NATIVE_TOKEN_SENTINEL = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if token is native token
 */
const isNativeToken = (token: Address, nativeTokenAddress: Address): boolean => {
  const normalized = getAddress(token);
  return (
    normalized === getAddress(nativeTokenAddress) ||
    normalized === getAddress(NATIVE_TOKEN_SENTINEL)
  );
};

/**
 * Detect if ERC20 approve is needed
 * Native swaps (MON → X or X → MON where X is also native) don't need approve
 */
const detectApproveRequired = (
  fromToken: Address,
  toToken: Address,
  nativeTokenAddress: Address,
): boolean => {
  // If swapping FROM native token, no approve needed
  if (isNativeToken(fromToken, nativeTokenAddress)) {
    return false;
  }

  // If swapping FROM ERC20 token, approve needed
  return true;
};

/**
 * Build scope with function selector enforcement + parameter enforcement
 *
 * Extracts function selector from calldata and enforces it in delegation.
 * This ensures session key can ONLY call the specific function needed.
 *
 * For swaps, also enforces the destination parameter (offset 132) to prevent
 * output theft attacks. The destination is always the user's smart account.
 */
const buildEphemeralScope = (context: EphemeralDelegationContext) => {
  const { quote, fromToken, toToken, nativeTokenAddress, delegator } = context;

  // Build target list
  const targets = new Set<Address>();
  const selectors = new Set<Hex>();

  // Always include aggregator
  targets.add(getAddress(quote.aggregator));

  // Extract function selector from transaction data (first 4 bytes = 8 hex chars after 0x)
  if (quote.transactionData && quote.transactionData !== "0x" && quote.transactionData.length >= 10) {
    const functionSelector = quote.transactionData.slice(0, 10) as Hex; // e.g., "0xd0e30db0" for deposit()
    selectors.add(functionSelector);
  } else if (quote.transactionData === "0x" || !quote.transactionData) {
    // Native transfer (no calldata) - add fallback receive function selector
    // This allows the delegation to send native ETH/MON to the target address
    // Fallback function has empty selector, so we use a sentinel value
    selectors.add("0x00000000" as Hex);
  }

  // Include fromToken if ERC20 (for approve)
  if (!isNativeToken(fromToken, nativeTokenAddress)) {
    targets.add(getAddress(fromToken));
    // Add ERC20 approve selector: 0x095ea7b3
    selectors.add("0x095ea7b3" as Hex);
  }

  // Include toToken (for output) - no specific selector needed for receiving
  if (!isNativeToken(toToken, nativeTokenAddress)) {
    targets.add(getAddress(toToken));
  }

  // Build destination enforcement for swap
  // Enforces that swap output goes to user's smart account (delegator)
  // This prevents attackers from redirecting swap output to their own address
  //
  // IMPORTANT: Only enforce for operations with a destination parameter (swaps).
  // Wrap/unwrap operations don't have a destination parameter, so enforcement
  // would fail with "invalid-calldata-length" error.
  // Use empty array [] for wrap/unwrap to skip enforcement, use buildSwapEnforcement for swaps.
  return {
    type: "functionCall" as const,
    targets: Array.from(targets),
    selectors: Array.from(selectors), // Enforced function selectors
    allowedCalldata: context.skipParameterEnforcement ? [] : buildSwapEnforcement(delegator),
  };
};

/**
 * Build caveats for ephemeral delegation
 */
const buildEphemeralCaveats = (
  nonce: bigint,
  expiresAt: number,
  callLimit: number,
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
// Main API
// ============================================================================

/**
 * Create ephemeral delegation from Monorail quote
 *
 * This is the core H2 innovation: delegations created AFTER user confirms quote,
 * with exact calldata enforcement for maximum security.
 *
 * @param context - Delegation context (quote, addresses, nonce, etc.)
 * @returns Unsigned delegation ready for Web3Auth signature
 *
 * @example
 * ```typescript
 * // User confirmed quote
 * const result = createEphemeralDelegation({
 *   quote,
 *   delegator: hybridDelegatorAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: currentNonce,
 *   chainId: MONAD_CHAIN_ID,
 *   delegationManager: DELEGATION_MANAGER_ADDRESS,
 *   fromToken: monAddress,
 *   toToken: usdcAddress,
 *   nativeTokenAddress: MON_ADDRESS,
 * });
 *
 * // Sign with Web3Auth
 * const signature = await walletClient.signTypedData(result.typedData);
 *
 * // Execute transaction with signed delegation
 * await executeWithDelegation({ ...result.delegation, signature });
 * ```
 */
export const createEphemeralDelegation = (
  context: EphemeralDelegationContext,
): EphemeralDelegationResult => {
  const { quote, delegator, sessionKey, nonce, chainId, delegationManager, fromToken, toToken, nativeTokenAddress, currentAllowance, requiredAmount } =
    context;

  // Detect if ERC20 approve is needed
  const requiresApprove = detectApproveRequired(fromToken, toToken, nativeTokenAddress);

  // Calculate smart callLimit based on current allowance
  let callLimit = 1; // Default: swap only (native swaps or sufficient allowance)

  if (requiresApprove) {
    if (currentAllowance >= requiredAmount) {
      // Case 1: Sufficient allowance exists - skip approve (gas optimization)
      callLimit = 1; // swap only
    } else if (currentAllowance > 0n && currentAllowance < requiredAmount) {
      // Case 2: Insufficient allowance - must reset to 0 first (USDC/USDT safety)
      callLimit = 3; // approve(0) + approve(amount) + swap
    } else {
      // Case 3: No existing allowance - direct approve
      callLimit = 2; // approve + swap
    }
  }

  // Expiry: 5 minutes from now
  const expiresAt = Math.floor(Date.now() / 1000) + EPHEMERAL_EXPIRY_SECONDS;

  // Build scope with exact calldata enforcement
  const scope = buildEphemeralScope(context);

  // Build caveats
  const caveats = buildEphemeralCaveats(nonce, expiresAt, callLimit);

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
    callLimit,
    expiresAt,
    requiresApprove,
  };
};

/**
 * Estimate if session key has sufficient balance for gas
 *
 * @param sessionKeyBalance - Current session key balance (wei)
 * @param estimatedGas - Estimated gas for transaction (wei)
 * @returns Whether session key needs funding
 */
export const needsSessionKeyFunding = (sessionKeyBalance: bigint, estimatedGas: bigint): boolean => {
  // Minimum balance threshold: 0.1 MON
  const MIN_BALANCE = parseEther("0.1");

  // Check if balance is below minimum OR insufficient for this transaction
  return sessionKeyBalance < MIN_BALANCE || sessionKeyBalance < estimatedGas * 2n; // 2x safety margin
};
