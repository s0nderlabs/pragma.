/**
 * Paymaster Sponsorship Utilities
 *
 * Shared helpers for working with Pimlico paymaster sponsorship.
 * Used by both hybrid delegator deployment and session key funding.
 */

import { type Hex } from "viem";
import { formatUserOperationRequest, type UserOperationRequest } from "viem/account-abstraction";
import type { PimlicoSponsorship } from "../pimlico";

/**
 * UserOperation type compatible with smartAccount.signUserOperation
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SignableUserOperation = Parameters<any>[0] & {
  callData: Hex;
  callGasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  nonce: bigint;
  preVerificationGas: bigint;
  sender: Hex;
  signature: Hex;
  verificationGasLimit: bigint;
  paymaster?: Hex;
  paymasterData?: Hex;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
};

/**
 * Build sponsorship request for Pimlico paymaster
 *
 * Formats UserOp for pm_sponsorUserOperation endpoint by:
 * - Clearing paymaster fields (will be filled by sponsor response)
 * - Setting signature to 0x (not needed for gas estimation)
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
 */
export const applySponsorshipToUserOp = (
  target: SignableUserOperation,
  update: PimlicoSponsorship
) => {
  // Update gas limits if provided
  if (update.callGasLimit && update.callGasLimit > 0n) {
    target.callGasLimit = update.callGasLimit;
  }
  if (update.verificationGasLimit && update.verificationGasLimit > 0n) {
    target.verificationGasLimit = update.verificationGasLimit;
  }
  if (update.preVerificationGas && update.preVerificationGas > 0n) {
    target.preVerificationGas = update.preVerificationGas;
  }

  // Add paymaster gas limits
  if (update.paymasterPostOpGasLimit) {
    Object.assign(target, { paymasterPostOpGasLimit: update.paymasterPostOpGasLimit });
  }
  if (update.paymasterVerificationGasLimit) {
    Object.assign(target, {
      paymasterVerificationGasLimit: update.paymasterVerificationGasLimit,
    });
  }

  // Apply paymaster fields (modern or legacy format)
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
