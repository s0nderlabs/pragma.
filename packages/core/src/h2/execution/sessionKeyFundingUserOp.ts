/**
 * Session Key Funding via UserOp
 *
 * Funds session key from smart account using ERC4337 UserOp pattern.
 * This approach solves the circular dependency for initial funding (0 MON balance).
 *
 * Flow:
 * 1. Build execute() calldata for MON transfer
 * 2. Create UserOp with that calldata
 * 3. Estimate gas via bundler
 * 4. Sign UserOp with smart account (EOA signature)
 * 5. Submit to bundler → EntryPoint → HybridDelegator.execute() → Session key funded
 *
 * Note: This is a self-paid UserOp (no paymaster sponsorship).
 * Smart account pays gas directly from its balance.
 * Paymaster was removed due to AA34 signature validation issues.
 */

import { type Address, type Hex, type PublicClient, encodeFunctionData, formatEther } from "viem";
import type { BundlerClient } from "viem/account-abstraction";
import {
  getUserOpGasPrice,
  getFallbackGasPrice,
  estimateUserOpGas,
  applyGasEstimates,
  submitUserOp,
  type BaseUserOp,
} from "./userOpUtils.js";
import { SESSION_KEY_FUNDING_AMOUNT } from "./sessionKeyManager.js";

// ============================================================================
// Constants
// ============================================================================

// HybridDelegator's execute() function ABI
const HYBRID_DELEGATOR_EXECUTE_ABI = [
  {
    type: "function",
    name: "execute",
    inputs: [
      {
        name: "_execution",
        type: "tuple",
        components: [
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

// ============================================================================
// UserOp Building
// ============================================================================

/**
 * Build execute() calldata for native MON transfer to session key
 */
function buildSessionKeyFundingCallData(sessionKeyAddress: Address, amount: bigint): Hex {
  return encodeFunctionData({
    abi: HYBRID_DELEGATOR_EXECUTE_ABI,
    functionName: "execute",
    args: [
      {
        target: sessionKeyAddress,
        value: amount,
        callData: "0x", // Native transfer (no contract call)
      },
    ],
  });
}

// ============================================================================
// Main Funding Function
// ============================================================================

export interface FundSessionKeyViaUserOpParams {
  /** Smart account address (HybridDelegator) */
  smartAccountAddress: Address;
  /** Session key address to fund */
  sessionKeyAddress: Address;
  /** Smart account instance from DTK */
  smartAccount: any; // toMetaMaskSmartAccount result
  /** Bundler client */
  bundlerClient: BundlerClient;
  /** Public client */
  publicClient: PublicClient;
  /** Optional dynamic funding amount (defaults to SESSION_KEY_FUNDING_AMOUNT) */
  fundingAmount?: bigint;
}

export interface FundSessionKeyViaUserOpResult {
  /** UserOp hash */
  userOpHash: Hex;
  /** Transaction hash (if available) */
  transactionHash?: Hex;
  /** New session key balance */
  newBalance: bigint;
  /** Amount funded */
  fundedAmount: bigint;
}

/**
 * Fund session key from smart account using UserOp
 *
 * This is used for INITIAL funding when session key has 0 MON.
 * Subsequent refills (< 0.1 MON) should use delegation-based approach.
 *
 * @param params - Funding parameters
 * @returns UserOp hash, transaction hash, and new balance
 */
export async function fundSessionKeyViaUserOp(
  params: FundSessionKeyViaUserOpParams,
): Promise<FundSessionKeyViaUserOpResult> {
  const {
    smartAccountAddress,
    sessionKeyAddress,
    smartAccount,
    bundlerClient,
    publicClient,
    fundingAmount = SESSION_KEY_FUNDING_AMOUNT, // Default to fixed amount if not provided
  } = params;

  // Get balance before funding
  const balanceBefore = await publicClient.getBalance({ address: sessionKeyAddress });

  // Step 1: Build execute() calldata with dynamic funding amount
  const callData = buildSessionKeyFundingCallData(sessionKeyAddress, fundingAmount);

  // Step 2: Get nonce from smart account
  const nonce = (await smartAccount.getNonce?.()) ?? 0n;

  // Step 3: Get gas prices (try bundler, fallback to public client)
  const bundlerGasPrice = await getUserOpGasPrice(bundlerClient);
  const gasPrice = bundlerGasPrice ?? (await getFallbackGasPrice(publicClient));

  // Step 4: Build base UserOp (self-paid, no paymaster)
  const userOp: BaseUserOp = {
    sender: smartAccountAddress,
    nonce,
    factory: undefined, // No deployment
    factoryData: undefined,
    callData,
    callGasLimit: 0n, // Will be estimated
    verificationGasLimit: 0n, // Will be estimated
    preVerificationGas: 0n, // Will be estimated
    maxFeePerGas: gasPrice.maxFeePerGas,
    maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
    paymaster: undefined, // Self-paid (no paymaster)
    paymasterData: undefined,
    signature: "0x", // Placeholder
  };

  // Step 5: Estimate gas
  const entryPoint = smartAccount.entryPoint.address;
  const gasEstimates = await estimateUserOpGas(bundlerClient, userOp, entryPoint);
  applyGasEstimates(userOp, gasEstimates);

  // Note: This is a self-paid UserOp. No paymaster sponsorship is used.
  // Paymaster was removed due to AA34 signature validation issues.
  // Smart account pays gas directly from its balance (~0.001 MON for this transfer).

  // Step 6: Sign UserOp with smart account (EOA signature)
  const signature = await smartAccount.signUserOperation(userOp);
  userOp.signature = signature;

  // Step 7: Submit UserOp to bundler (smart account pays gas)
  const { userOpHash, transactionHash } = await submitUserOp(
    bundlerClient,
    userOp,
    entryPoint,
  );

  // Step 8: Wait for transaction confirmation if we have tx hash
  if (transactionHash) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });

    // Verify transaction succeeded (not reverted)
    if (receipt.status !== "success") {
      throw new Error(
        `Session key funding transaction failed (reverted onchain). ` +
        `TxHash: ${transactionHash}. Check block explorer for revert reason.`
      );
    }

    // Wait for RPC state propagation (prevent stale balance reads)
    // RPC nodes may have stale state immediately after waitForTransactionReceipt
    // Adding 2s delay ensures balance updates have propagated across the network
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } else {
    // No transaction hash = bundler failed to return receipt
    // This means UserOp was never confirmed or bundler timeout occurred
    throw new Error(
      `Session key funding UserOp submitted but no transaction hash returned. ` +
      `UserOpHash: ${userOpHash}. Transaction may still be pending in bundler mempool. ` +
      `Check bundler logs or wait and retry.`
    );
  }

  // Step 9: Get new balance and verify funding succeeded
  const balanceAfter = await publicClient.getBalance({ address: sessionKeyAddress });
  const actualFunded = balanceAfter - balanceBefore;

  // Verify actual balance increase matches expected (allow 10% tolerance for gas)
  const minimumExpected = (fundingAmount * 90n) / 100n;
  if (actualFunded < minimumExpected) {
    throw new Error(
      `Session key funding verification failed. ` +
      `Expected: ${formatEther(fundingAmount)} MON, ` +
      `Actual: ${formatEther(actualFunded)} MON. ` +
      `Transaction may have partially failed or gas costs were unexpectedly high.`
    );
  }

  return {
    userOpHash,
    transactionHash,
    newBalance: balanceAfter,
    fundedAmount: actualFunded,
  };
}
