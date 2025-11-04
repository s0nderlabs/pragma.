/**
 * Calldata Enforcement Utilities
 *
 * Helper functions to build AllowedCalldata configurations for ephemeral delegations.
 * These enforce specific parameters in function calls to prevent parameter manipulation attacks.
 *
 * Security Model:
 * - Swap delegations: Enforce destination address only (offset 132)
 * - Approve delegations: Enforce spender (offset 4) + amount (offset 36)
 * - ERC20 transfers: Enforce recipient (offset 4) + amount (offset 36)
 * - Native transfers: Enforce recipient (offset 0) using nativeTokenTransferAmount scope
 *
 * References:
 * - Byte offsets: packages/core/src/h2/delegation/offsets.ts
 * - AllowedCalldataEnforcer: DTK v1.3.0 enforcer contract
 * - Architecture: internal-docs/02_System/3_Policy_&_Safety/ephemeral-delegations-architecture.md
 */

import { type Address, type Hex, encodePacked, pad, toHex } from "viem";
import {
  MONORAIL_AGGREGATE_OFFSETS,
  ERC20_TRANSFER_OFFSETS,
  ERC20_APPROVE_OFFSETS,
  NATIVE_TRANSFER_OFFSETS,
} from "./offsets.js";
import { ALLOWED_CALLDATA_ENFORCER_ADDRESS } from "../config.js";

// ============================================================================
// Types
// ============================================================================

/**
 * AllowedCalldata builder configuration for DTK
 *
 * DTK's simplified builder format that gets converted internally to caveat format.
 * Each entry specifies a byte position and expected value.
 *
 * DTK handles:
 * - Converting to AllowedCalldataEnforcer caveat format
 * - ABI encoding the terms
 * - Adding enforcer address
 */
export interface AllowedCalldataBuilderConfig {
  /** Starting byte index in calldata */
  startIndex: number;
  /** Expected value at that position (32 bytes, left-padded) */
  value: Hex;
}

// Note: DTK handles the conversion from builder config to caveat format internally
// We just need to provide simple { startIndex, value } pairs

// ============================================================================
// Operation-Specific Builders
// ============================================================================

/**
 * Build AllowedCalldata config for Monorail swap delegation
 *
 * Enforces ONLY the destination parameter (offset 132).
 * Other parameters (tokenIn, tokenOut, amountIn, minAmountOut) are NOT enforced because:
 * - tokenIn/tokenOut: Already protected by target whitelisting
 * - amountIn: Balance validation prevents over-spending, slippage protects under-spending
 * - minAmountOut: We patch this value for slippage adjustment (cannot enforce)
 *
 * @param destination - User's address (recipient of swap output)
 * @returns AllowedCalldata builder configuration array for DTK
 *
 * @example
 * ```typescript
 * const configs = buildSwapEnforcement("0x742d35Cc6634C0532925a3b844Bc9e7595f0bE60");
 * // Returns: [{ startIndex: 132, value: "0x000...address" }]
 * ```
 */
export function buildSwapEnforcement(destination: Address): AllowedCalldataBuilderConfig[] {
  return [
    {
      startIndex: MONORAIL_AGGREGATE_OFFSETS.DESTINATION,
      value: pad(destination, { size: 32 }), // Left-pad address to 32 bytes
    },
  ];
}

/**
 * Build AllowedCalldata config for ERC20 approve delegation
 *
 * Enforces BOTH spender and amount parameters.
 * This prevents two critical attack vectors:
 * 1. Spender substitution: Attacker changes spender to themselves
 * 2. Amount manipulation: Attacker increases approval beyond what's needed
 *
 * Example attack without spender enforcement:
 * - User confirms: "approve Monorail router for 100 USDC"
 * - Attacker modifies: "approve AttackerContract for 100 USDC"
 * - Attacker drains user's tokens via malicious spender
 *
 * Example attack without amount enforcement:
 * - User confirms: "approve for 100 USDC swap"
 * - Attacker modifies: "approve for 1,000,000 USDC"
 * - Attacker can drain much more than intended
 *
 * @param spender - Spender address (typically Monorail aggregator from quote)
 * @param amount - Approval amount (as wei/raw units)
 * @returns AllowedCalldata builder configuration array for DTK
 *
 * @example
 * ```typescript
 * const configs = buildApproveEnforcement(
 *   "0xMonorailAggregator...",
 *   parseUnits("100", 6) // 100 USDC
 * );
 * // Returns: [
 * //   { startIndex: 4, value: "0x000...spender" },
 * //   { startIndex: 36, value: "0x000...amount" }
 * // ]
 * ```
 */
export function buildApproveEnforcement(
  spender: Address,
  amount: bigint
): AllowedCalldataBuilderConfig[] {
  return [
    {
      startIndex: ERC20_APPROVE_OFFSETS.SPENDER,
      value: pad(spender, { size: 32 }), // Left-pad address to 32 bytes
    },
    {
      startIndex: ERC20_APPROVE_OFFSETS.AMOUNT,
      value: pad(toHex(amount), { size: 32 }), // Left-pad amount to 32 bytes
    },
  ];
}

/**
 * Build AllowedCalldata config for ERC20 transfer delegation
 *
 * Enforces BOTH recipient and amount parameters.
 * Unlike swaps, transfer amount MUST be enforced because:
 * - Swaps: Over-spending benefits user (gets more output to themselves)
 * - Transfers: Over-spending harms user (gives more to third party)
 *
 * Example attack without amount enforcement:
 * - User confirms: "send 100 USDC to Bob"
 * - Attacker modifies: "send 1,000,000 USDC to Bob"
 * - Bob gets windfall, user loses funds
 *
 * @param recipient - Recipient address
 * @param amount - Transfer amount (as wei/raw units)
 * @returns AllowedCalldata builder configuration array for DTK
 *
 * @example
 * ```typescript
 * const configs = buildERC20TransferEnforcement(
 *   "0xBob...",
 *   parseUnits("100", 6) // 100 USDC
 * );
 * // Returns: [
 * //   { startIndex: 4, value: "0x000...bob" },
 * //   { startIndex: 36, value: "0x000...amount" }
 * // ]
 * ```
 */
export function buildERC20TransferEnforcement(
  recipient: Address,
  amount: bigint
): AllowedCalldataBuilderConfig[] {
  return [
    {
      startIndex: ERC20_TRANSFER_OFFSETS.RECIPIENT,
      value: pad(recipient, { size: 32 }), // Left-pad address
    },
    {
      startIndex: ERC20_TRANSFER_OFFSETS.AMOUNT,
      value: pad(toHex(amount), { size: 32 }), // Left-pad uint256
    },
  ];
}

/**
 * Build AllowedCalldata config for native MON transfer delegation
 *
 * @deprecated This function is deprecated and should NOT be used.
 *
 * ⚠️ BUG: This approach does not work for native transfers!
 *
 * AllowedCalldataEnforcer validates the `callData` field of the Execution struct.
 * For native transfers, callData is ALWAYS empty ("0x"), so attempting to enforce
 * offset 0 causes "invalid-calldata-length" error.
 *
 * The enforcer does NOT validate the `target` or `value` fields - only `callData`.
 *
 * Correct Approach:
 * Use `ExactExecutionEnforcer` instead, which validates all three fields:
 * - target (recipient address)
 * - value (amount)
 * - callData (must be "0x")
 *
 * See: createNativeTransferDelegation() in transferDelegation.ts for correct implementation
 *
 * @param recipient - Recipient address (UNUSED - this function doesn't work)
 * @returns AllowedCalldata config that will FAIL at runtime
 */
export function buildNativeTransferEnforcement(recipient: Address): AllowedCalldataBuilderConfig[] {
  console.warn(
    "[DEPRECATED] buildNativeTransferEnforcement() is deprecated. " +
    "Use ExactExecutionEnforcer for native transfers instead. " +
    "This function will cause 'invalid-calldata-length' errors."
  );
  return [
    {
      startIndex: NATIVE_TRANSFER_OFFSETS.TARGET,
      value: pad(recipient, { size: 32 }),
    },
  ];
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate that an address is properly formatted for enforcement
 *
 * Checks:
 * - Address is valid hex string
 * - Address is 20 bytes (40 hex chars + 0x)
 *
 * @param address - Address to validate
 * @throws Error if address is invalid
 */
export function validateAddress(address: string): asserts address is Address {
  if (!address.startsWith("0x")) {
    throw new Error(`Invalid address format: ${address} (missing 0x prefix)`);
  }
  if (address.length !== 42) {
    throw new Error(`Invalid address length: ${address} (expected 42 chars, got ${address.length})`);
  }
}

/**
 * Validate that an amount is within safe bounds
 *
 * Checks:
 * - Amount is non-negative
 * - Amount is not zero (meaningless transfer)
 * - Amount fits in uint256 (max safe integer)
 *
 * @param amount - Amount to validate
 * @param context - Context for error message (e.g., "ERC20 transfer")
 * @throws Error if amount is invalid
 */
export function validateAmount(amount: bigint, context: string): void {
  if (amount < 0n) {
    throw new Error(`${context}: amount cannot be negative (got ${amount})`);
  }
  if (amount === 0n) {
    throw new Error(`${context}: amount cannot be zero`);
  }
  // uint256 max: 2^256 - 1
  const MAX_UINT256 = BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935");
  if (amount > MAX_UINT256) {
    throw new Error(`${context}: amount exceeds uint256 max (got ${amount})`);
  }
}

/**
 * Validate an AllowedCalldata builder configuration
 *
 * Checks:
 * - startIndex is non-negative
 * - value is valid 32-byte hex string
 *
 * @param config - Builder config to validate
 * @throws Error if config is invalid
 */
export function validateBuilderConfig(config: AllowedCalldataBuilderConfig): void {
  if (config.startIndex < 0) {
    throw new Error(`Invalid startIndex: ${config.startIndex} (must be non-negative)`);
  }
  if (!config.value.startsWith("0x")) {
    throw new Error(`Invalid value format: ${config.value} (missing 0x prefix)`);
  }
  if (config.value.length !== 66) {
    throw new Error(
      `Invalid value length: ${config.value} (expected 66 chars for 32 bytes, got ${config.value.length})`
    );
  }
}
