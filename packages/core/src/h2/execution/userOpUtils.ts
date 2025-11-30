/**
 * UserOp Utilities
 *
 * Reusable utilities for building, estimating, signing, and submitting UserOps.
 * Extracted from web app's hybridDelegator.ts and adapted for CLI execution context.
 */

import type { Address, Hex, PublicClient } from "viem";
import type { BundlerClient } from "viem/account-abstraction";
import { formatUserOperationRequest } from "viem/account-abstraction";

// ============================================================================
// Types
// ============================================================================

export interface UserOpGasEstimate {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
}

export interface UserOpGasPrice {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface BaseUserOp {
  sender: Address;
  nonce: bigint;
  factory?: Address;
  factoryData?: Hex;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymaster?: Address;
  paymasterData?: Hex;
  signature?: Hex;
}

// ============================================================================
// Constants
// ============================================================================

const FALLBACK_VERIFICATION_GAS_LIMIT = 2_500_000n;
const FALLBACK_PRE_VERIFICATION_GAS = 120_000n;
const FALLBACK_CALL_GAS_LIMIT = 100_000n;

// Minimum floor for verification gas limit
// Smart account signature verification requires substantial gas (~100-200k)
// Bundler estimates can be too low, especially for self-paid UserOps
const MIN_VERIFICATION_GAS_LIMIT = 200_000n;

// Minimum floor for preVerificationGas
// Bundler estimates can underestimate, especially for Monad mainnet
// Required ~153k observed in production, so 160k provides safety margin
const MIN_PRE_VERIFICATION_GAS = 160_000n;

// Buffer multiplier for gas estimates (150% = 1.5x)
// Provides safety margin for on-chain variability
const GAS_ESTIMATE_BUFFER_PERCENT = 150n;

// ============================================================================
// Gas Price Utilities
// ============================================================================

/**
 * Get gas price suggestions from Pimlico bundler
 */
export async function getUserOpGasPrice(
  bundlerClient: BundlerClient,
): Promise<UserOpGasPrice | null> {
  try {
    const extendedBundler = bundlerClient as BundlerClient & {
      request: <T = unknown>(
        args: { method: string; params: unknown[] },
        options?: { retryCount?: number },
      ) => Promise<T>;
    };

    const suggestion = (await extendedBundler.request(
      {
        method: "pimlico_getUserOperationGasPrice",
        params: [],
      },
      { retryCount: 0 },
    )) as
      | {
          fast?: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
          standard?: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
          slow?: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
        }
      | undefined;

    const recommended = suggestion?.fast ?? suggestion?.standard ?? suggestion?.slow;
    if (!recommended) {
      return null;
    }

    return {
      maxFeePerGas: BigInt(recommended.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(recommended.maxPriorityFeePerGas),
    };
  } catch {
    return null;
  }
}

/**
 * Get gas price from public client as fallback
 */
export async function getFallbackGasPrice(
  publicClient: PublicClient,
): Promise<UserOpGasPrice> {
  const feeEstimates = await publicClient.estimateFeesPerGas().catch(() => undefined);
  const gasPrice = await publicClient.getGasPrice();
  const maxPriorityFeePerGas = feeEstimates?.maxPriorityFeePerGas ?? gasPrice;
  const maxFeePerGas = feeEstimates?.maxFeePerGas ?? gasPrice + maxPriorityFeePerGas;

  return {
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
}

// ============================================================================
// Gas Estimation Utilities
// ============================================================================

/**
 * Helper to coerce gas estimate values
 */
function coerceEstimate(value?: string | null): bigint | undefined {
  if (!value) return undefined;
  try {
    const normalized = value.startsWith("0x") ? value : `0x${value}`;
    const parsed = BigInt(normalized);
    return parsed > 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Estimate UserOp gas via bundler
 */
export async function estimateUserOpGas(
  bundlerClient: BundlerClient,
  userOp: BaseUserOp,
  entryPoint: Address,
): Promise<Partial<UserOpGasEstimate> | null> {
  try {
    const extendedBundler = bundlerClient as BundlerClient & {
      request: <T = unknown>(
        args: { method: string; params: unknown[] },
        options?: { retryCount?: number },
      ) => Promise<T>;
    };

    const estimationRequest = formatUserOperationRequest({
      ...userOp,
      signature: "0x" as Hex,
    } as any);

    const estimation = (await extendedBundler.request(
      {
        method: "eth_estimateUserOperationGas",
        params: [estimationRequest, entryPoint],
      },
      { retryCount: 0 },
    )) as
      | {
          preVerificationGas?: string;
          verificationGas?: string;
          verificationGasLimit?: string;
          callGasLimit?: string;
        }
      | undefined;

    if (!estimation) {
      return null;
    }

    return {
      callGasLimit: coerceEstimate(estimation.callGasLimit),
      verificationGasLimit: coerceEstimate(
        estimation.verificationGasLimit ?? estimation.verificationGas,
      ),
      preVerificationGas: coerceEstimate(estimation.preVerificationGas),
    };
  } catch {
    return null;
  }
}

/**
 * Apply buffer to gas estimate
 */
function applyGasBuffer(estimate: bigint): bigint {
  return (estimate * GAS_ESTIMATE_BUFFER_PERCENT) / 100n;
}

/**
 * Apply gas estimates to UserOp with fallbacks
 *
 * Key changes for self-paid UserOps (no paymaster):
 * - Applies 1.5x buffer to all gas estimates
 * - Enforces minimum floor for verificationGasLimit (200k)
 *
 * Rationale: Bundler gas estimates are optimistic and can underestimate
 * especially for smart account signature verification. AA26 error occurs
 * when verificationGasLimit is too low during EntryPoint validation.
 */
export function applyGasEstimates(
  userOp: BaseUserOp,
  estimates: Partial<UserOpGasEstimate> | null,
): void {
  // Apply callGasLimit with buffer
  if (estimates?.callGasLimit && estimates.callGasLimit > 0n) {
    userOp.callGasLimit = applyGasBuffer(estimates.callGasLimit);
  } else if (!userOp.callGasLimit || userOp.callGasLimit === 0n) {
    userOp.callGasLimit = FALLBACK_CALL_GAS_LIMIT;
  }

  // Apply verificationGasLimit with buffer AND minimum floor
  // This is critical for self-paid UserOps where smart account validates signature
  if (estimates?.verificationGasLimit && estimates.verificationGasLimit > 0n) {
    const buffered = applyGasBuffer(estimates.verificationGasLimit);
    // Use the larger of: buffered estimate OR minimum floor
    userOp.verificationGasLimit = buffered > MIN_VERIFICATION_GAS_LIMIT
      ? buffered
      : MIN_VERIFICATION_GAS_LIMIT;
  } else if (!userOp.verificationGasLimit || userOp.verificationGasLimit === 0n) {
    userOp.verificationGasLimit = FALLBACK_VERIFICATION_GAS_LIMIT;
  }

  // Apply preVerificationGas with buffer AND minimum floor
  // Bundler estimates can underestimate for Monad mainnet
  if (estimates?.preVerificationGas && estimates.preVerificationGas > 0n) {
    const buffered = applyGasBuffer(estimates.preVerificationGas);
    // Use the larger of: buffered estimate OR minimum floor
    userOp.preVerificationGas = buffered > MIN_PRE_VERIFICATION_GAS
      ? buffered
      : MIN_PRE_VERIFICATION_GAS;
  } else if (!userOp.preVerificationGas || userOp.preVerificationGas === 0n) {
    userOp.preVerificationGas = FALLBACK_PRE_VERIFICATION_GAS;
  }
}

// ============================================================================
// UserOp Submission Utilities
// ============================================================================

/**
 * Submit UserOp to bundler and wait for receipt
 */
export async function submitUserOp(
  bundlerClient: BundlerClient,
  userOp: BaseUserOp,
  entryPoint: Address,
): Promise<{ userOpHash: Hex; transactionHash?: Hex }> {
  const extendedBundler = bundlerClient as BundlerClient & {
    request: <T = unknown>(
      args: { method: string; params: unknown[] },
      options?: { retryCount?: number },
    ) => Promise<T>;
  };

  const rpcUserOperation = formatUserOperationRequest(userOp as any);

  // Submit UserOp
  const userOpHash = (await extendedBundler.request(
    {
      method: "eth_sendUserOperation",
      params: [rpcUserOperation, entryPoint],
    },
    { retryCount: 0 },
  )) as Hex;

  // Wait for receipt with timeout (30 seconds)
  // Increased from 2s → 10s → 30s based on production experience
  // Pimlico docs recommend 10-30s timeout for reliable UserOp confirmation
  // Monad testnet can experience delays during congestion requiring longer timeouts
  const USER_OPERATION_WAIT_TIMEOUT_MS = 30000;

  const waitWithTimeout = <T>(promise: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting ${USER_OPERATION_WAIT_TIMEOUT_MS}ms for bundler receipt`));
      }, USER_OPERATION_WAIT_TIMEOUT_MS);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });

  try {
    const receipt = await waitWithTimeout(
      bundlerClient.waitForUserOperationReceipt({ hash: userOpHash }),
    );

    const txHash = (receipt as any)?.receipt?.transactionHash ?? (receipt as any)?.transactionHash;

    return {
      userOpHash,
      transactionHash: txHash ? (txHash as Hex) : undefined,
    };
  } catch (error) {
    // Timeout or error - try to fetch receipt manually
    try {
      const receipt = (await extendedBundler.request(
        {
          method: "eth_getUserOperationReceipt",
          params: [userOpHash],
        },
        { retryCount: 0 },
      )) as
        | {
            receipt?: { transactionHash?: string };
            transactionHash?: string;
          }
        | null;

      const txHash = receipt?.receipt?.transactionHash ?? receipt?.transactionHash;

      return {
        userOpHash,
        transactionHash: txHash ? (txHash as Hex) : undefined,
      };
    } catch (receiptError) {
      // Don't return success without transaction hash - bundler failure should throw
      // If receipt fetch fails after timeout, UserOp is either still pending or bundler is broken
      throw new Error(
        `Failed to fetch UserOp receipt after ${USER_OPERATION_WAIT_TIMEOUT_MS}ms timeout. ` +
        `UserOpHash: ${userOpHash}. Transaction may still be pending in bundler mempool. ` +
        `Bundler error: ${receiptError instanceof Error ? receiptError.message : String(receiptError)}`
      );
    }
  }
}
