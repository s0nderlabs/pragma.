/**
 * Byte Offset Constants for AllowedCalldataEnforcer
 *
 * These constants define byte positions for parameters in function calldata and execution structs.
 * Used by AllowedCalldataEnforcer to validate specific parameters in ephemeral delegations.
 *
 * Security Note: Incorrect offsets will cause delegation validation to fail or miss attacks.
 * Always verify offsets against actual function signatures and ABI encoding rules.
 */

/**
 * Monorail Aggregate Function Offsets
 *
 * Function signature:
 * ```solidity
 * function aggregate(
 *   address tokenIn,        // offset 4
 *   address tokenOut,       // offset 36
 *   uint256 amountIn,       // offset 68
 *   uint256 minAmountOut,   // offset 100
 *   address destination,    // offset 132  ← ENFORCE THIS
 *   uint256 deadline,       // offset 164
 *   uint64 referrer,        // offset 196
 *   uint64 quote,           // offset 204
 *   Trade[] trades          // offset 212+ (dynamic array)
 * ) external payable returns (uint256 amountOut);
 * ```
 *
 * Reference: packages/core/src/monorail/calldataPatcher.ts:8-39
 */
export const MONORAIL_AGGREGATE_OFFSETS = {
  /**
   * Function selector (first 4 bytes)
   * Not used for enforcement, but included for completeness
   */
  SELECTOR: 0,

  /**
   * Input token address (bytes 4-36)
   * Already protected by target whitelisting in ephemeral scope
   */
  TOKEN_IN: 4,

  /**
   * Output token address (bytes 36-68)
   * Already protected by target whitelisting in ephemeral scope
   */
  TOKEN_OUT: 36,

  /**
   * Input amount (bytes 68-100)
   * NOT enforced - protected by balance validation + slippage protection
   */
  AMOUNT_IN: 68,

  /**
   * Minimum output amount (bytes 100-132)
   * NOT enforced - we patch this value for slippage adjustment
   * See: packages/core/src/h2/execution/executeSwap.ts:469-483
   */
  MIN_AMOUNT_OUT: 100,

  /**
   * Destination address (bytes 132-164)
   * ⚠️ CRITICAL: MUST ENFORCE THIS to prevent output theft
   * This is the recipient of the swap output tokens
   */
  DESTINATION: 132,

  /**
   * Deadline timestamp (bytes 164-196)
   * NOT enforced - already handled by delegation timestamp caveat
   */
  DEADLINE: 164,

  /**
   * Referrer ID (bytes 196-204)
   * NOT enforced - not security-critical
   */
  REFERRER: 196,

  /**
   * Quote ID (bytes 204-212)
   * NOT enforced - not security-critical
   */
  QUOTE: 204,

  /**
   * Trades array (bytes 212+)
   * NOT enforced - dynamic array, complex structure
   */
  TRADES: 212,
} as const;

/**
 * ERC20 Transfer Function Offsets
 *
 * Function signature:
 * ```solidity
 * function transfer(
 *   address recipient,  // offset 4   ← ENFORCE THIS
 *   uint256 amount      // offset 36  ← ENFORCE THIS
 * ) external returns (bool);
 * ```
 *
 * ABI encoding: selector (4 bytes) + recipient (32 bytes) + amount (32 bytes)
 */
export const ERC20_TRANSFER_OFFSETS = {
  /**
   * Function selector: 0xa9059cbb
   * Not used for enforcement, included for reference
   */
  SELECTOR: 0,

  /**
   * Recipient address (bytes 4-36)
   * ⚠️ CRITICAL: MUST ENFORCE THIS to prevent fund theft
   */
  RECIPIENT: 4,

  /**
   * Transfer amount (bytes 36-68)
   * ⚠️ CRITICAL: MUST ENFORCE THIS to prevent over-spending
   *
   * Note: Unlike swap amountIn, transfer amount MUST be enforced because:
   * - In swaps: over-spending benefits user (gets more output)
   * - In transfers: over-spending harms user (gives away more than intended)
   */
  AMOUNT: 36,
} as const;

/**
 * ERC20 Approve Function Offsets
 *
 * Function signature:
 * ```solidity
 * function approve(
 *   address spender,  // offset 4   ← ENFORCE THIS
 *   uint256 amount    // offset 36  ← ENFORCE THIS
 * ) external returns (bool);
 * ```
 *
 * ABI encoding: selector (4 bytes) + spender (32 bytes) + amount (32 bytes)
 *
 * Security Note:
 * Both spender and amount MUST be enforced to prevent:
 * - Spender substitution (attacker sets themselves as spender)
 * - Amount manipulation (attacker approves more than intended)
 */
export const ERC20_APPROVE_OFFSETS = {
  /**
   * Function selector: 0x095ea7b3
   * Not used for enforcement, included for reference
   */
  SELECTOR: 0,

  /**
   * Spender address (bytes 4-36)
   * ⚠️ CRITICAL: MUST ENFORCE THIS to prevent spender substitution
   *
   * The spender is the address authorized to spend tokens on behalf of the owner.
   * This must match the Monorail aggregator address from the quote.
   */
  SPENDER: 4,

  /**
   * Approval amount (bytes 36-68)
   * ⚠️ CRITICAL: MUST ENFORCE THIS to prevent over-approval
   *
   * The amount parameter sets the allowance. Enforcing this prevents attackers
   * from increasing the approval amount beyond what's needed for the swap.
   */
  AMOUNT: 36,
} as const;

/**
 * Native Transfer Execution Struct Offsets
 *
 * @deprecated These offsets are NOT used for native transfer enforcement.
 *
 * ⚠️ IMPORTANT: AllowedCalldataEnforcer CANNOT enforce native transfer recipients!
 *
 * The Execution struct for native transfers:
 * ```solidity
 * struct Execution {
 *   address target;   // offset 0   ← Recipient address (CANNOT enforce with AllowedCalldataEnforcer)
 *   uint256 value;    // offset 32  ← Amount (enforced by maxAmount + ExactExecutionEnforcer)
 *   bytes callData;   // offset 64  ← Empty "0x" (AllowedCalldataEnforcer validates THIS field only)
 * }
 * ```
 *
 * Why AllowedCalldataEnforcer fails:
 * - It extracts and validates the `callData` field ONLY
 * - For native transfers, callData is empty ("0x")
 * - Attempting to enforce offset 0 in empty data causes "invalid-calldata-length" error
 *
 * Correct Approach:
 * Use `ExactExecutionEnforcer` which validates ALL THREE fields (target, value, callData).
 * See: createNativeTransferDelegation() in transferDelegation.ts
 */
export const NATIVE_TRANSFER_OFFSETS = {
  /**
   * Target address (bytes 0-32)
   * ⚠️ NOT ENFORCEABLE via AllowedCalldataEnforcer
   *
   * Use ExactExecutionEnforcer instead to validate the recipient address.
   */
  TARGET: 0,

  /**
   * Value amount (bytes 32-64)
   * Enforced via:
   * 1. maxAmount in nativeTokenTransferAmount scope
   * 2. ExactExecutionEnforcer (validates exact amount)
   */
  VALUE: 32,

  /**
   * Calldata offset pointer (bytes 64-96)
   * Always empty "0x" for native transfers
   * Validated by ExactExecutionEnforcer
   */
  CALLDATA: 64,
} as const;

/**
 * Type exports for type-safe offset access
 */
export type MonorailAggregateOffset = keyof typeof MONORAIL_AGGREGATE_OFFSETS;
export type ERC20TransferOffset = keyof typeof ERC20_TRANSFER_OFFSETS;
export type ERC20ApproveOffset = keyof typeof ERC20_APPROVE_OFFSETS;
export type NativeTransferOffset = keyof typeof NATIVE_TRANSFER_OFFSETS;

/**
 * Validation helpers
 */

/**
 * Validates that an offset is within calldata bounds
 * @param offset - Byte offset to validate
 * @param calldataLength - Total length of calldata
 * @param parameterSize - Size of parameter in bytes (default 32)
 */
export function validateOffset(
  offset: number,
  calldataLength: number,
  parameterSize: number = 32
): void {
  if (offset < 0) {
    throw new Error(`Invalid offset: ${offset} (must be non-negative)`);
  }
  if (offset + parameterSize > calldataLength) {
    throw new Error(
      `Offset ${offset} + parameter size ${parameterSize} exceeds calldata length ${calldataLength}`
    );
  }
}

/**
 * Helper to get offset value with type safety
 */
export function getMonorailOffset(key: MonorailAggregateOffset): number {
  return MONORAIL_AGGREGATE_OFFSETS[key];
}

export function getERC20Offset(key: ERC20TransferOffset): number {
  return ERC20_TRANSFER_OFFSETS[key];
}

export function getERC20ApproveOffset(key: ERC20ApproveOffset): number {
  return ERC20_APPROVE_OFFSETS[key];
}

export function getNativeOffset(key: NativeTransferOffset): number {
  return NATIVE_TRANSFER_OFFSETS[key];
}
