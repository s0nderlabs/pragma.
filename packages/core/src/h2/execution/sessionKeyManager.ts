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

import { type Address, type Hex, type PublicClient, parseEther, formatEther, getAddress } from "viem";
import type {
  SessionKeyBalance,
  SessionKeyFundingConfig,
  SessionKeyFundingResult,
} from "./types.js";
import { SessionKeyFundingError } from "./types.js";
import { fundSessionKeyViaUserOp } from "./sessionKeyFundingUserOp.js";
import { fundSessionKeyViaDelegation } from "./sessionKeyFundingDelegation.js";

// ============================================================================
// Constants
// ============================================================================

/** Minimum balance threshold (if below this, funding is needed) */
export const MIN_SESSION_KEY_BALANCE = parseEther("0.1"); // 0.1 MON

/** Standard funding amount (increased for batch operation support) */
export const SESSION_KEY_FUNDING_AMOUNT = parseEther("1.0"); // 1.0 MON

/** Average gas cost per operation (updated from real-world data with overhead) */
export const AVG_GAS_PER_OPERATION = parseEther("0.11"); // ~0.11 MON per swap/transfer (includes funding overhead)

/** Safety buffer for batch operations */
export const BATCH_SAFETY_BUFFER = parseEther("0.20"); // Extra 0.20 MON buffer (increased for reliability)

/**
 * Minimum balance needed to pay gas for delegation-based refill
 *
 * This is LOWER than MIN_SESSION_KEY_BALANCE to create a range where
 * delegation can be used instead of UserOp:
 * - 0.00 - 0.05 MON: UserOp-based funding (can't afford delegation tx gas ~0.01 MON)
 * - 0.05 - 0.10 MON: Delegation-based funding (has gas, more efficient refill)
 * - 0.10+ MON: No funding needed
 */
export const MIN_GAS_FOR_DELEGATION = parseEther("0.05"); // 0.05 MON

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
 *     rpcUrl: "https://testnet.monad.xyz/",
 *     delegationManager: "0x...",
 *     smartAccount: smartAccount,
 *     bundlerClient: bundlerClient,
 *   },
 *   publicClient,
 *   web3authBridge,
 *   17  // Calculate funding for 17 operations
 * );
 * ```
 */
export async function fundSessionKey(
  config: SessionKeyFundingConfig,
  publicClient: PublicClient,
  web3authBridge: any, // Web3AuthBridge or direct PK bridge (used for refills only)
  estimatedOperations?: number,
): Promise<SessionKeyFundingResult> {
  try {
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
    const balanceBefore = await publicClient.getBalance({
      address: getAddress(config.sessionKeyAddress),
    });

    // Calculate required balance and funding amount
    let requiredBalance: bigint;
    let fundingAmount: bigint;

    if (estimatedOperations !== undefined && estimatedOperations > 0) {
      // Dynamic funding: Calculate based on operation count
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
    // - < 0.1 MON (initial or low balance) → Use UserOp (bundler pays gas)
    // - ≥ 0.1 MON (refill with sufficient gas) → Use delegation (session key pays gas)

    if (balanceBefore < MIN_GAS_FOR_DELEGATION) {
      // INITIAL OR LOW-BALANCE FUNDING: Use UserOp approach (bundler pays gas)
      if (!config.smartAccount || !config.bundlerClient) {
        throw new SessionKeyFundingError(
          "Initial session key funding requires smartAccount and bundlerClient. " +
          "These are needed to create and submit UserOp for funding."
        );
      }

      const result = await fundSessionKeyViaUserOp({
        smartAccountAddress: config.smartAccountAddress,
        sessionKeyAddress: config.sessionKeyAddress,
        smartAccount: config.smartAccount,
        bundlerClient: config.bundlerClient,
        publicClient,
        fundingAmount, // Pass dynamic funding amount
      });

      return {
        txHash: result.transactionHash || result.userOpHash,
        newBalance: result.newBalance,
        fundedAmount: result.fundedAmount,
      };
    }

    // REFILL FUNDING: Use delegation approach (session key has enough to pay gas)
    // Session key has ≥ 0.1 MON - use delegation pattern
    if (!config.sessionKeyPrivateKey || !config.ownerAddress) {
      throw new SessionKeyFundingError(
        "Refill funding requires sessionKeyPrivateKey and ownerAddress. " +
        "These are needed to create and sign ephemeral delegation."
      );
    }

    const result = await fundSessionKeyViaDelegation({
      smartAccountAddress: config.smartAccountAddress,
      sessionKeyAddress: config.sessionKeyAddress,
      sessionKeyPrivateKey: config.sessionKeyPrivateKey,
      ownerAddress: config.ownerAddress,
      chainId: config.chainId,
      publicClient,
      web3authBridge,
      fundingAmount, // Pass dynamic funding amount
    });

    return {
      txHash: result.transactionHash,
      newBalance: result.newBalance,
      fundedAmount: result.fundedAmount,
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
