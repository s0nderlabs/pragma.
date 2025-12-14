/**
 * H2 Session Key Manager
 *
 * Manages session key balance checking and funding.
 *
 * Session keys are ephemeral keys that hold small amounts of MON (0.5 MON)
 * to pay for gas when executing transactions with ephemeral delegations.
 *
 * Key Features:
 * - Auto-detect low balance (< 0.1 MON)
 * - Fund from smart account (transfer 0.5 MON)
 * - User permission required before funding
 */

import { type Address, type Hex, type PublicClient, type Transport, parseEther, formatEther, getAddress } from "viem";
import type {
  SessionKeyBalance,
  SessionKeyFundingConfig,
  SessionKeyFundingResult,
} from "./types.js";
import { SessionKeyFundingError } from "./types.js";
import { fundSessionKeyViaUserOp } from "./sessionKeyFundingUserOp.js";
import { fundSessionKeyViaDelegation } from "./sessionKeyFundingDelegation.js";
import { emitProgress } from "../progress/emitter.js";
import { createLogger } from "../../logger/index.js";

const logger = createLogger("[SessionKeyManager]");

// ============================================================================
// Constants
// ============================================================================

/**
 * Operation-specific gas costs (based on REAL activity-data.txt measurements)
 * Each value = actual_cost + ~10% safety buffer
 *
 * Actual costs at 102 Gwei gas price:
 * - Swap: ~900k gas = 0.092 MON
 * - Stake: 641k gas = 0.065 MON
 * - Unstake: 663k gas = 0.068 MON
 * - UnstakeClaim: 587k gas = 0.060 MON
 * - Transfer: 354k gas = 0.036 MON
 * - Wrap: 331k gas = 0.034 MON
 * - Unwrap: 332k gas = 0.034 MON
 */
export const GAS_PER_OPERATION = {
  swap: parseEther("0.14"),        // 0.092 swap + 0.04 approval = 0.132, +buffer
  transfer: parseEther("0.04"),    // Actual: 0.036 MON (354k gas × 102 gwei)
  wrap: parseEther("0.04"),        // Actual: 0.034 MON (331k gas × 102 gwei)
  unwrap: parseEther("0.04"),      // Actual: 0.034 MON (332k gas × 102 gwei)
  stake: parseEther("0.07"),       // Actual: 0.065 MON (641k gas × 102 gwei)
  unstake: parseEther("0.075"),    // Actual: 0.068 MON (663k gas × 102 gwei)
  unstakeClaim: parseEther("0.07"), // Actual: 0.060 MON (587k gas × 102 gwei)
} as const;

/** Operation type for type-safe gas lookups */
export type OperationType = keyof typeof GAS_PER_OPERATION;

/** Minimum balance threshold - fallback for unknown operations */
export const MIN_SESSION_KEY_BALANCE = parseEther("0.04"); // 0.04 MON (lowest operation cost)

/** Standard funding amount */
export const SESSION_KEY_FUNDING_AMOUNT = parseEther("0.5"); // 0.5 MON

/** Average gas cost per operation (kept for backward compatibility with batch estimation) */
export const AVG_GAS_PER_OPERATION = parseEther("0.08"); // ~0.08 MON avg across all ops

/** Safety buffer for batch operations (reduced - per-op thresholds already include buffer) */
export const BATCH_SAFETY_BUFFER = parseEther("0.02"); // Extra 0.02 MON buffer

/**
 * Minimum balance needed to pay gas for delegation-based refill
 *
 * This is LOWER than MIN_SESSION_KEY_BALANCE to create a range where
 * delegation can be used instead of UserOp:
 * - 0.00 - 0.02 MON: UserOp-based funding (can't afford delegation tx gas)
 * - 0.02 - 0.04 MON: Delegation-based funding (has gas, more efficient refill)
 * - 0.04+ MON: Check operation-specific threshold
 */
export const MIN_GAS_FOR_DELEGATION = parseEther("0.02"); // 0.02 MON

// ============================================================================
// Operation-Specific Gas Functions
// ============================================================================

/**
 * Get minimum balance required for a specific operation
 *
 * @param operation - The operation type (swap, transfer, etc.)
 * @returns Minimum balance needed (in wei)
 *
 * @example
 * ```typescript
 * const minBalance = getMinBalanceForOperation('transfer');
 * // Returns: 0.04 MON (in wei)
 * ```
 */
export function getMinBalanceForOperation(operation: OperationType): bigint {
  return GAS_PER_OPERATION[operation];
}

/**
 * Estimate gas for a batch of specific operations
 *
 * More accurate than estimateGasForBatch() because it considers
 * the actual cost of each operation type.
 *
 * @param operations - Array of operation types
 * @returns Total estimated gas needed (in wei)
 *
 * @example
 * ```typescript
 * const gas = estimateGasForOperations(['swap', 'transfer']);
 * // Returns: 0.10 + 0.04 + 0.02 buffer = 0.16 MON
 * ```
 */
export function estimateGasForOperations(operations: OperationType[]): bigint {
  if (operations.length === 0) return MIN_SESSION_KEY_BALANCE;

  let total = 0n;
  for (const op of operations) {
    total += GAS_PER_OPERATION[op];
  }
  return total + BATCH_SAFETY_BUFFER;
}

/**
 * Check if session key should be funded for specific operations
 *
 * More accurate than shouldFundForBatch() because it uses
 * operation-specific costs instead of averages.
 *
 * @param currentBalance - Current session key balance (in wei)
 * @param operations - Array of operation types planned
 * @returns Whether funding is needed
 *
 * @example
 * ```typescript
 * // User has 0.05 MON, wants to transfer (0.04 MON)
 * shouldFundForOperations(parseEther("0.05"), ['transfer']);
 * // Returns: false (0.05 >= 0.04 + 0.02 buffer = 0.06? NO, but single op)
 *
 * // For single operation, check against operation cost directly
 * ```
 */
export function shouldFundForOperations(
  currentBalance: bigint,
  operations: OperationType[]
): boolean {
  if (operations.length === 0) return currentBalance < MIN_SESSION_KEY_BALANCE;

  const required = estimateGasForOperations(operations);
  return currentBalance < required;
}

// ============================================================================
// Dynamic Funding Calculation
// ============================================================================

/**
 * Calculate optimal funding amount based on current balance and required balance
 *
 * Implements dynamic funding strategy that calculates exact amount needed
 * instead of using a fixed 1.0 MON amount. This prevents:
 * - Under-funding (fixed amount insufficient for large batches)
 * - Over-funding (wasting gas on unnecessary transfers)
 *
 * @param currentBalance - Current session key balance (in wei)
 * @param requiredBalance - Required balance for planned operations (in wei)
 * @returns Optimal funding amount with safety margin (in wei)
 *
 * @example
 * ```typescript
 * // Need 1.815 MON for 17 swaps, have 0.647 MON
 * const fundingAmount = calculateFundingAmount(
 *   parseEther("0.647"),
 *   parseEther("1.815")
 * );
 * // Returns: 1.268 MON (gap: 1.168 + buffer: 0.1)
 * ```
 */
export function calculateFundingAmount(
  currentBalance: bigint,
  requiredBalance: bigint
): bigint {
  // Calculate gap between required and current
  const gap = requiredBalance - currentBalance;

  // Add safety margin to prevent edge case failures
  const safetyMargin = parseEther("0.1");
  const fundingAmount = gap + safetyMargin;

  // Apply bounds to prevent dust funding and excessive single transfers
  const minFunding = parseEther("0.5"); // Minimum to make funding worthwhile
  const maxFunding = parseEther("3.0"); // Maximum for single funding operation

  // Return bounded amount
  if (fundingAmount < minFunding) return minFunding;
  if (fundingAmount > maxFunding) return maxFunding;
  return fundingAmount;
}

// ============================================================================
// Gas Estimation (for Pre-Flight Checks)
// ============================================================================

/**
 * Estimate gas required for batch operations
 *
 * Uses conservative estimates to prevent mid-batch failures due to
 * insufficient session key balance.
 *
 * @param operationCount - Number of operations planned (swaps, transfers, etc.)
 * @returns Estimated gas needed (in wei)
 *
 * @example
 * ```typescript
 * const estimatedGas = estimateGasForBatch(4); // 4 swaps
 * // Returns: (4 × 0.08 MON) + 0.15 MON buffer = 0.47 MON
 * ```
 */
export function estimateGasForBatch(operationCount: number): bigint {
  if (operationCount <= 0) return 0n;

  const totalGas = AVG_GAS_PER_OPERATION * BigInt(operationCount);
  return totalGas + BATCH_SAFETY_BUFFER;
}

/**
 * Check if session key should be funded for batch operations
 *
 * Performs pre-flight check to prevent mid-batch balance depletion.
 * Compares current balance against estimated gas requirement.
 *
 * @param currentBalance - Current session key balance (in wei)
 * @param estimatedOperations - Number of operations planned
 * @returns Whether funding is needed before batch execution
 *
 * @example
 * ```typescript
 * const shouldFund = shouldFundForBatch(parseEther("0.3"), 4);
 * // 0.3 MON < (4 × 0.08 + 0.15) = 0.47 MON → true
 * ```
 */
export function shouldFundForBatch(
  currentBalance: bigint,
  estimatedOperations: number
): boolean {
  if (estimatedOperations <= 0) return currentBalance < MIN_SESSION_KEY_BALANCE;

  const requiredBalance = estimateGasForBatch(estimatedOperations);
  return currentBalance < requiredBalance;
}

// ============================================================================
// Balance Checking
// ============================================================================

/**
 * Check session key balance and determine if funding is needed
 *
 * @param sessionKeyAddress - Session key public address
 * @param publicClient - Viem public client
 * @returns Balance information and funding recommendation
 *
 * @example
 * ```typescript
 * const { needsFunding, balance } = await checkSessionKeyBalance(
 *   sessionKeyAddress,
 *   publicClient
 * );
 *
 * if (needsFunding) {
 *   console.log(`Session key needs funding. Current: ${formatEther(balance)} MON`);
 * }
 * ```
 */
export async function checkSessionKeyBalance(
  sessionKeyAddress: Address,
  publicClient: PublicClient,
): Promise<SessionKeyBalance> {
  const balance = await publicClient.getBalance({ address: sessionKeyAddress });

  return {
    balance,
    needsFunding: balance < MIN_SESSION_KEY_BALANCE,
    recommendedFundingAmount: SESSION_KEY_FUNDING_AMOUNT,
  };
}

// ============================================================================
// Session Key Funding
// ============================================================================

/**
 * Fund session key from smart account
 *
 * This function transfers MON from the user's smart account (HybridDelegator)
 * to the session key address to cover gas costs for future transactions.
 *
 * **Two-Phase Approach:**
 * - Initial funding (0 MON): Uses UserOp via bundler (no gas needed from session key)
 * - Refill funding (< 0.1 MON): Uses ephemeral delegation (session key pays gas from remaining balance)
 *
 * **Dynamic Funding:**
 * - If estimatedOperations provided, calculates exact amount needed
 * - Otherwise uses fixed SESSION_KEY_FUNDING_AMOUNT (backward compatibility)
 *
 * @param config - Funding configuration
 * @param publicClient - Viem public client
 * @param web3authBridge - Bridge with signTypedData method (used for delegation signing)
 * @param estimatedOperations - Optional number of operations to fund for (enables dynamic funding)
 * @returns Funding result with transaction hash and new balance
 *
 * @throws {SessionKeyFundingError} If funding fails
 *
 * @example
 * ```typescript
 * // Dynamic funding for 17 swaps
 * const result = await fundSessionKey(
 *   {
 *     smartAccountAddress: "0x...",
 *     sessionKeyAddress: "0x...",
 *     sessionKeyPrivateKey: "0x...",
 *     ownerAddress: "0x...",
 *     chainId: 10207,
 *     delegationManager: "0x...",
 *     smartAccount: smartAccount,
 *     bundlerClient: bundlerClient,
 *   },
 *   publicClient,
 *   web3authBridge,
 *   transport,  // Authenticated transport (e.g., /api/rpc proxy)
 *   17  // Calculate funding for 17 operations
 * );
 * ```
 */
/**
 * Options for session key funding
 */
export interface FundSessionKeyOptions {
  /** Number of operations to fund for (uses average gas estimate) */
  estimatedOperations?: number;
  /** Specific operation type for accurate gas calculation */
  operationType?: OperationType;
}

export async function fundSessionKey(
  config: SessionKeyFundingConfig,
  publicClient: PublicClient,
  web3authBridge: any, // Web3AuthBridge or direct PK bridge (used for refills only)
  transport: Transport, // Authenticated transport for wallet client (e.g., /api/rpc proxy)
  options?: number | FundSessionKeyOptions, // number for backward compatibility
): Promise<SessionKeyFundingResult> {
  try {
    // Parse options (support both old number format and new options object)
    let estimatedOperations: number | undefined;
    let operationType: OperationType | undefined;

    if (typeof options === 'number') {
      estimatedOperations = options;
    } else if (options) {
      estimatedOperations = options.estimatedOperations;
      operationType = options.operationType;
    }

    // Validate inputs before attempting RPC calls
    if (!config.sessionKeyAddress) {
      throw new SessionKeyFundingError("sessionKeyAddress is undefined or empty");
    }

    if (!config.smartAccountAddress) {
      throw new SessionKeyFundingError("smartAccountAddress is undefined or empty");
    }

    if (!publicClient) {
      throw new SessionKeyFundingError("publicClient is undefined");
    }

    // Get current balance before funding
    emitProgress("Checking Session Key Balance...");
    const balanceBefore = await publicClient.getBalance({
      address: getAddress(config.sessionKeyAddress),
    });

    // Calculate required balance and funding amount
    let requiredBalance: bigint;
    let fundingAmount: bigint;

    if (operationType && estimatedOperations !== undefined && estimatedOperations > 0) {
      // BEST: Use operation-specific gas costs (e.g., swap = 0.14 MON, not 0.08 avg)
      const operations: OperationType[] = Array(estimatedOperations).fill(operationType);
      requiredBalance = estimateGasForOperations(operations);
      fundingAmount = calculateFundingAmount(balanceBefore, requiredBalance);
    } else if (estimatedOperations !== undefined && estimatedOperations > 0) {
      // Fallback: Calculate based on average operation count
      requiredBalance = estimateGasForBatch(estimatedOperations);
      fundingAmount = calculateFundingAmount(balanceBefore, requiredBalance);
    } else {
      // Fixed funding: Use traditional threshold check (backward compatibility)
      requiredBalance = MIN_SESSION_KEY_BALANCE;
      fundingAmount = SESSION_KEY_FUNDING_AMOUNT;
    }

    // Check if funding is actually needed
    if (balanceBefore >= requiredBalance) {
      return {
        txHash: "0x" as Hex, // No tx needed
        newBalance: balanceBefore,
        fundedAmount: 0n,
      };
    }

    // Check smart account balance
    const smartAccountBalance = await publicClient.getBalance({
      address: getAddress(config.smartAccountAddress),
    });

    if (smartAccountBalance < fundingAmount) {
      throw new SessionKeyFundingError(
        `Insufficient smart account balance. ` +
        `Need ${formatEther(fundingAmount)} MON for funding, ` +
        `have ${formatEther(smartAccountBalance)} MON`
      );
    }

    // Route based on session key balance:
    // - < 0.02 MON (initial or low balance) → Use UserOp (bundler pays gas)
    // - ≥ 0.02 MON (refill with sufficient gas) → Use delegation (session key pays gas)

    // Debug: Log which funding path will be used
    logger.debug(`Session key balance: ${formatEther(balanceBefore)} MON`);
    logger.debug(`MIN_GAS_FOR_DELEGATION: ${formatEther(MIN_GAS_FOR_DELEGATION)} MON`);
    logger.debug(`Using: ${balanceBefore < MIN_GAS_FOR_DELEGATION ? 'UserOp (bundler)' : 'Delegation (EIP-7966)'}`);

    if (balanceBefore < MIN_GAS_FOR_DELEGATION) {
      // INITIAL OR LOW-BALANCE FUNDING: Use UserOp approach (bundler pays gas)
      if (!config.smartAccount || !config.bundlerClient) {
        throw new SessionKeyFundingError(
          "Initial session key funding requires smartAccount and bundlerClient. " +
          "These are needed to create and submit UserOp for funding."
        );
      }

      emitProgress("Building Funding Transaction...");
      const result = await fundSessionKeyViaUserOp({
        smartAccountAddress: config.smartAccountAddress,
        sessionKeyAddress: config.sessionKeyAddress,
        smartAccount: config.smartAccount,
        bundlerClient: config.bundlerClient,
        publicClient,
        fundingAmount, // Pass dynamic funding amount
        // Note: sponsorUserOperationFn removed - session key funding is now self-paid
      });

      return {
        txHash: result.transactionHash || result.userOpHash,
        newBalance: result.newBalance,
        fundedAmount: result.fundedAmount,
      };
    }

    // REFILL FUNDING: Try delegation first, fall back to UserOp if it fails
    // Session key has ≥ 0.02 MON - attempt delegation pattern
    if (config.sessionKeyPrivateKey && config.ownerAddress) {
      try {
        logger.debug("Entering DELEGATION path (EIP-7966 enabled)");
        emitProgress("Building Funding Delegation...");
        const result = await fundSessionKeyViaDelegation({
          smartAccountAddress: config.smartAccountAddress,
          sessionKeyAddress: config.sessionKeyAddress,
          sessionKeyPrivateKey: config.sessionKeyPrivateKey,
          ownerAddress: config.ownerAddress,
          chainId: config.chainId,
          publicClient,
          web3authBridge,
          transport, // Pass authenticated transport from caller
          fundingAmount, // Pass dynamic funding amount
        });

        return {
          txHash: result.transactionHash,
          newBalance: result.newBalance,
          fundedAmount: result.fundedAmount,
        };
      } catch (delegationError) {
        // Delegation failed (likely insufficient gas) - fall back to UserOp
        logger.warn(
          `Delegation funding failed, falling back to UserOp: ${(delegationError as Error).message}`
        );

        // Check if we have UserOp requirements for fallback
        if (config.smartAccount && config.bundlerClient) {
          emitProgress("Delegation failed, using UserOp fallback...");
          const userOpResult = await fundSessionKeyViaUserOp({
            smartAccountAddress: config.smartAccountAddress,
            sessionKeyAddress: config.sessionKeyAddress,
            smartAccount: config.smartAccount,
            bundlerClient: config.bundlerClient,
            publicClient,
            fundingAmount,
          });

          return {
            txHash: userOpResult.transactionHash || userOpResult.userOpHash,
            newBalance: userOpResult.newBalance,
            fundedAmount: userOpResult.fundedAmount,
          };
        }

        // No fallback available, re-throw original error
        throw delegationError;
      }
    }

    // No delegation credentials - use UserOp directly
    if (!config.smartAccount || !config.bundlerClient) {
      throw new SessionKeyFundingError(
        "Session key funding requires either delegation credentials (sessionKeyPrivateKey, ownerAddress) " +
        "or UserOp credentials (smartAccount, bundlerClient)."
      );
    }

    emitProgress("Building Funding Transaction...");
    const userOpResult = await fundSessionKeyViaUserOp({
      smartAccountAddress: config.smartAccountAddress,
      sessionKeyAddress: config.sessionKeyAddress,
      smartAccount: config.smartAccount,
      bundlerClient: config.bundlerClient,
      publicClient,
      fundingAmount,
    });

    return {
      txHash: userOpResult.transactionHash || userOpResult.userOpHash,
      newBalance: userOpResult.newBalance,
      fundedAmount: userOpResult.fundedAmount,
    };
  } catch (error) {
    if (error instanceof SessionKeyFundingError) {
      throw error;
    }
    throw new SessionKeyFundingError(
      `Failed to fund session key: ${(error as Error).message}`
    );
  }
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format session key balance for display
 */
export function formatSessionKeyBalance(balance: bigint): string {
  return `${formatEther(balance)} MON`;
}

/**
 * Get conversational message about session key funding
 */
export function getSessionKeyFundingMessage(balance: bigint): string {
  return `Your session key balance is low (${formatSessionKeyBalance(balance)}). ` +
    `I'll transfer ${formatEther(SESSION_KEY_FUNDING_AMOUNT)} MON from your smart account to cover gas costs. ` +
    `Is that okay?`;
}

// Re-export types for external use
export type {
  SessionKeyBalance,
  SessionKeyFundingConfig,
  SessionKeyFundingResult,
} from "./types.js";
export { SessionKeyFundingError } from "./types.js";
