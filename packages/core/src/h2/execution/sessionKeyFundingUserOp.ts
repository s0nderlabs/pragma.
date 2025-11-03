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
 * No gas needed from session key (EOA signs, bundler submits, smart account pays gas).
 */

import { type Address, type Hex, type PublicClient, encodeFunctionData, parseEther } from "viem";
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
function buildSessionKeyFundingCallData(sessionKeyAddress: Address): Hex {
  return encodeFunctionData({
    abi: HYBRID_DELEGATOR_EXECUTE_ABI,
    functionName: "execute",
    args: [
      {
        target: sessionKeyAddress,
        value: SESSION_KEY_FUNDING_AMOUNT,
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
  } = params;

  // Get balance before funding
  const balanceBefore = await publicClient.getBalance({ address: sessionKeyAddress });

  // Step 1: Build execute() calldata
  const callData = buildSessionKeyFundingCallData(sessionKeyAddress);

  // Step 2: Get nonce from smart account
  const nonce = (await smartAccount.getNonce?.()) ?? 0n;

  // Step 3: Get gas prices (try bundler, fallback to public client)
  const bundlerGasPrice = await getUserOpGasPrice(bundlerClient);
  const gasPrice = bundlerGasPrice ?? (await getFallbackGasPrice(publicClient));

  // Step 4: Build base UserOp
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
    paymaster: undefined, // User pays their own gas
    paymasterData: undefined,
    signature: "0x", // Placeholder
  };

  // Step 5: Estimate gas
  const entryPoint = smartAccount.entryPoint.address;
  const gasEstimates = await estimateUserOpGas(bundlerClient, userOp, entryPoint);
  applyGasEstimates(userOp, gasEstimates);

  // Step 6: Sign UserOp with smart account (EOA signature)
  const signature = await smartAccount.signUserOperation(userOp);
  userOp.signature = signature;

  // Step 7: Submit UserOp to bundler
  const { userOpHash, transactionHash } = await submitUserOp(
    bundlerClient,
    userOp,
    entryPoint,
  );

  // Step 8: Wait for transaction confirmation if we have tx hash
  if (transactionHash) {
    await publicClient.waitForTransactionReceipt({ hash: transactionHash });
  } else {
    // Wait a bit for tx to be mined even if we don't have hash
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Step 9: Get new balance
  const balanceAfter = await publicClient.getBalance({ address: sessionKeyAddress });

  return {
    userOpHash,
    transactionHash,
    newBalance: balanceAfter,
    fundedAmount: balanceAfter - balanceBefore,
  };
}
