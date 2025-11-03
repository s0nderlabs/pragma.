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
 * Apply gas estimates to UserOp with fallbacks
 */
export function applyGasEstimates(
  userOp: BaseUserOp,
  estimates: Partial<UserOpGasEstimate> | null,
): void {
  // Apply callGasLimit
  if (estimates?.callGasLimit && estimates.callGasLimit > 0n) {
    userOp.callGasLimit = estimates.callGasLimit;
  } else if (!userOp.callGasLimit || userOp.callGasLimit === 0n) {
    userOp.callGasLimit = FALLBACK_CALL_GAS_LIMIT;
  }

  // Apply verificationGasLimit
  if (estimates?.verificationGasLimit && estimates.verificationGasLimit > 0n) {
    userOp.verificationGasLimit = estimates.verificationGasLimit;
  } else if (!userOp.verificationGasLimit || userOp.verificationGasLimit === 0n) {
    userOp.verificationGasLimit = FALLBACK_VERIFICATION_GAS_LIMIT;
  }

  // Apply preVerificationGas
  if (estimates?.preVerificationGas && estimates.preVerificationGas > 0n) {
    userOp.preVerificationGas = estimates.preVerificationGas;
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

  // Wait for receipt with timeout (2 seconds)
  const USER_OPERATION_WAIT_TIMEOUT_MS = 2000;

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
    } catch {
      // Return just the userOpHash if receipt fetch fails
      return { userOpHash };
    }
  }
}
