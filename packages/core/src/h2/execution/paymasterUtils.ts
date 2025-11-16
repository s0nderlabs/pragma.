/**
 * Paymaster Sponsorship Utilities
 *
 * Shared helpers for working with Pimlico paymaster sponsorship.
 * Used by:
 * - Smart account deployment (hybridDelegator.ts in web package)
 * - Session key funding (sessionKeyFundingUserOp.ts)
 *
 * Why paymaster utilities?
 * Pimlico's pm_sponsorUserOperation endpoint has specific requirements:
 * 1. UserOp must have paymaster fields cleared (undefined/null)
 * 2. Signature should be "0x" for sponsorship request
 * 3. Response includes both paymaster fields AND updated gas limits
 *
 * These utilities standardize the request/response flow.
 */

import { type Hex } from "viem";
import { formatUserOperationRequest, type UserOperationRequest } from "viem/account-abstraction";
import type { PimlicoSponsorship } from "./pimlico.js";

/**
 * UserOperation type compatible with smartAccount.signUserOperation()
 *
 * This is the "signable" format that:
 * - Has all required ERC-4337 fields
 * - Supports optional paymaster fields (for sponsored ops)
 * - Can be passed to smartAccount.signUserOperation()
 */
export type SignableUserOperation = {
  // Core ERC-4337 fields
  sender: Hex;
  nonce: bigint;
  callData: Hex;
  signature: Hex;

  // Gas limits
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;

  // Gas prices
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;

  // Optional: account factory (for deployment)
  factory?: Hex;
  factoryData?: Hex;

  // Optional: paymaster fields (for sponsored ops)
  paymaster?: Hex;
  paymasterData?: Hex;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
};

/**
 * Build sponsorship request for Pimlico paymaster
 *
 * Formats UserOp for pm_sponsorUserOperation endpoint by:
 * 1. Clearing paymaster fields (will be filled by sponsor response)
 * 2. Setting signature to "0x" (not needed for gas estimation)
 * 3. Converting to RpcUserOperation format (viem's wire format)
 *
 * @param op - UserOp to prepare for sponsorship request
 * @returns RPC-formatted UserOp ready for pm_sponsorUserOperation
 *
 * @example
 * ```typescript
 * const sponsorshipRequest = buildSponsorRequest(userOp);
 * const sponsorship = await sponsorUserOperation({
 *   userOperation: sponsorshipRequest,
 *   entryPoint: "0x...",
 * });
 * ```
 */
export const buildSponsorRequest = (op: SignableUserOperation) =>
  formatUserOperationRequest({
    ...op,
    paymaster: undefined,
    paymasterData: undefined,
    signature: "0x" as Hex,
  } as unknown as UserOperationRequest);

/**
 * Apply Pimlico sponsorship response to UserOp
 *
 * Updates UserOp with paymaster fields and gas limits from sponsorship response.
 * Handles both modern (separate paymaster/paymasterData) and legacy
 * (paymasterAndData) response formats.
 *
 * Updates applied:
 * 1. Gas limits (if provided and > 0): callGasLimit, verificationGasLimit, preVerificationGas
 * 2. Paymaster gas limits: paymasterPostOpGasLimit, paymasterVerificationGasLimit
 * 3. Paymaster fields: paymaster address and paymasterData
 *
 * @param target - UserOp to update (mutated in place)
 * @param update - Sponsorship response from pm_sponsorUserOperation
 *
 * @example
 * ```typescript
 * const sponsorship = await sponsorUserOperation({...});
 * applySponsorshipToUserOp(userOp, sponsorship); // userOp now has paymaster fields
 * const signature = await smartAccount.signUserOperation(userOp);
 * ```
 */
export const applySponsorshipToUserOp = (
  target: SignableUserOperation,
  update: PimlicoSponsorship
) => {
  // Update gas limits if provided by paymaster
  // Paymaster may suggest different gas limits based on sponsorship policy
  if (update.callGasLimit && update.callGasLimit > 0n) {
    target.callGasLimit = update.callGasLimit;
  }
  if (update.verificationGasLimit && update.verificationGasLimit > 0n) {
    target.verificationGasLimit = update.verificationGasLimit;
  }
  if (update.preVerificationGas && update.preVerificationGas > 0n) {
    target.preVerificationGas = update.preVerificationGas;
  }

  // Add paymaster-specific gas limits
  // These are required when paymaster is used (ERC-4337 v0.7 spec)
  if (update.paymasterPostOpGasLimit) {
    Object.assign(target, { paymasterPostOpGasLimit: update.paymasterPostOpGasLimit });
  }
  if (update.paymasterVerificationGasLimit) {
    Object.assign(target, {
      paymasterVerificationGasLimit: update.paymasterVerificationGasLimit,
    });
  }

  // Apply paymaster fields
  // Two formats: modern (separate paymaster/paymasterData) or legacy (paymasterAndData)
  if (update.paymaster) {
    // Modern format: separate paymaster and paymasterData
    Object.assign(target, {
      paymaster: update.paymaster,
      paymasterData: update.paymasterData ?? ("0x" as Hex),
    });
  } else {
    // Legacy format: paymasterAndData (first 20 bytes = paymaster, rest = data)
    Object.assign(target, {
      paymaster: `0x${update.paymasterAndData.slice(2, 42)}` as Hex,
      paymasterData: `0x${update.paymasterAndData.slice(42)}` as Hex,
    });
  }
};
