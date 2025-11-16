/**
 * Session Key Funding via UserOp (Web Client)
 *
 * Standalone funding logic for client-side use.
 * Cannot import from @pragma/core due to LangChain dependencies (node:async_hooks).
 *
 * Flow:
 * 1. Build execute() calldata for MON transfer
 * 2. Create UserOp with that calldata
 * 3. Estimate gas via bundler
 * 4. Get paymaster sponsorship (avoids 10 MON reserve requirement)
 * 5. Sign UserOp with smart account (EOA signature)
 * 6. Submit to bundler → EntryPoint → HybridDelegator.execute() → Session key funded
 */

import { type Address, type Hex, type PublicClient, encodeFunctionData, parseEther, formatEther } from "viem";
import type { BundlerClient } from "viem/account-abstraction";
import { formatUserOperationRequest } from "viem/account-abstraction";
import type { SmartAccount } from "@metamask/delegation-toolkit";
import { sponsorUserOperation } from "../pimlico";
import { buildSponsorRequest, applySponsorshipToUserOp } from "../onboarding/paymasterUtils";

// ============================================================================
// Constants
// ============================================================================

export const SESSION_KEY_FUNDING_AMOUNT = parseEther("1.0"); // 1.0 MON
export const MIN_SESSION_KEY_BALANCE = parseEther("0.1"); // 0.1 MON

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
// Types
// ============================================================================

interface FundingParams {
  smartAccountAddress: Address;
  sessionKeyAddress: Address;
  smartAccount: SmartAccount<unknown, unknown>;
  bundlerClient: BundlerClient;
  publicClient: PublicClient;
}

interface FundingResult {
  success: boolean;
  userOpHash: Hex;
  receipt: unknown;
  balanceBefore: bigint;
  balanceAfter: bigint;
}

interface UserOpGasEstimate {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
}

interface UserOpGasPrice {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

interface BaseUserOp {
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
  signature: Hex;
}

// Fallback gas constants
const FALLBACK_VERIFICATION_GAS_LIMIT = 2_500_000n;
const FALLBACK_PRE_VERIFICATION_GAS = 120_000n;
const FALLBACK_CALL_GAS_LIMIT = 100_000n;

// ============================================================================
// Gas Utilities
// ============================================================================

/**
 * Get gas price suggestions from Pimlico bundler
 */
async function getUserOpGasPrice(bundlerClient: BundlerClient): Promise<UserOpGasPrice | null> {
  try {
    const extendedBundler = bundlerClient as BundlerClient & {
      request: <T = unknown>(
        args: { method: string; params: unknown[] },
        options?: { retryCount?: number }
      ) => Promise<T>;
    };

    const suggestion = (await extendedBundler.request(
      {
        method: "pimlico_getUserOperationGasPrice",
        params: [],
      },
      { retryCount: 0 }
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
async function getFallbackGasPrice(publicClient: PublicClient): Promise<UserOpGasPrice> {
  const feeEstimates = await publicClient.estimateFeesPerGas().catch(() => undefined);
  const gasPrice = await publicClient.getGasPrice();
  const maxPriorityFeePerGas = feeEstimates?.maxPriorityFeePerGas ?? gasPrice;
  const maxFeePerGas = feeEstimates?.maxFeePerGas ?? gasPrice + maxPriorityFeePerGas;

  return {
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
}

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
async function estimateUserOpGas(
  bundlerClient: BundlerClient,
  userOp: BaseUserOp,
  entryPoint: Address
): Promise<Partial<UserOpGasEstimate> | null> {
  try {
    const extendedBundler = bundlerClient as BundlerClient & {
      request: <T = unknown>(
        args: { method: string; params: unknown[] },
        options?: { retryCount?: number }
      ) => Promise<T>;
    };

    const estimationRequest = formatUserOperationRequest({
      ...userOp,
      signature: "0x" as Hex,
    });

    const estimation = (await extendedBundler.request(
      {
        method: "eth_estimateUserOperationGas",
        params: [estimationRequest, entryPoint],
      },
      { retryCount: 0 }
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
      verificationGasLimit: coerceEstimate(estimation.verificationGasLimit ?? estimation.verificationGas),
      preVerificationGas: coerceEstimate(estimation.preVerificationGas),
    };
  } catch {
    return null;
  }
}

/**
 * Apply gas estimates to UserOp with fallbacks
 */
function applyGasEstimates(userOp: BaseUserOp, estimates: Partial<UserOpGasEstimate> | null): void {
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
// Funding Logic
// ============================================================================

/**
 * Fund session key from smart account using ERC4337 UserOp pattern
 */
export async function fundSessionKeyViaUserOp(params: FundingParams): Promise<FundingResult> {
  const { smartAccountAddress, sessionKeyAddress, smartAccount, bundlerClient, publicClient } = params;

  console.log("[FundingUserOp] Starting funding flow");
  console.log("[FundingUserOp] Smart Account:", smartAccountAddress);
  console.log("[FundingUserOp] Session Key:", sessionKeyAddress);
  console.log("[FundingUserOp] Amount:", formatEther(SESSION_KEY_FUNDING_AMOUNT), "MON");

  // Get balances before funding
  const balanceBefore = await publicClient.getBalance({ address: sessionKeyAddress });
  const smartAccountBalance = await publicClient.getBalance({ address: smartAccountAddress });

  console.log("[FundingUserOp] Balances before:");
  console.log(`  - Session key: ${formatEther(balanceBefore)} MON`);
  console.log(`  - Smart account: ${formatEther(smartAccountBalance)} MON`);

  // Validate smart account has enough balance
  if (smartAccountBalance < SESSION_KEY_FUNDING_AMOUNT) {
    throw new Error(
      `Smart account has insufficient balance. Has: ${formatEther(smartAccountBalance)} MON, needs: ${formatEther(SESSION_KEY_FUNDING_AMOUNT)} MON`
    );
  }

  // Step 1: Build execute() calldata for plain MON transfer
  // execute({ target: sessionKey, value: 1.0 MON, callData: "0x" })
  const callData = encodeFunctionData({
    abi: HYBRID_DELEGATOR_EXECUTE_ABI,
    functionName: "execute",
    args: [
      {
        target: sessionKeyAddress,
        value: SESSION_KEY_FUNDING_AMOUNT,
        callData: "0x",
      },
    ],
  });

  console.log("[FundingUserOp] Execute calldata:", callData);

  // Step 2: Get nonce from smart account
  const nonce = (await smartAccount.getNonce?.()) ?? 0n;
  console.log("[FundingUserOp] Nonce:", nonce);

  // Step 3: Get gas prices (try bundler first, fallback to public client)
  const bundlerGasPrice = await getUserOpGasPrice(bundlerClient);
  const gasPrice = bundlerGasPrice ?? (await getFallbackGasPrice(publicClient));

  console.log("[FundingUserOp] Gas prices:", {
    source: bundlerGasPrice ? "bundler" : "publicClient",
    maxFeePerGas: formatEther(gasPrice.maxFeePerGas),
    maxPriorityFeePerGas: formatEther(gasPrice.maxPriorityFeePerGas),
  });

  // Step 4: Build base UserOp with 0 gas limits (will be estimated)
  const userOp: BaseUserOp = {
    sender: smartAccountAddress,
    nonce,
    factory: undefined,
    factoryData: undefined,
    callData,
    callGasLimit: 0n, // Will be estimated
    verificationGasLimit: 0n, // Will be estimated
    preVerificationGas: 0n, // Will be estimated
    maxFeePerGas: gasPrice.maxFeePerGas,
    maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
    paymaster: undefined,
    paymasterData: undefined,
    signature: "0x",
  };

  console.log("[FundingUserOp] Base UserOp created");

  // Step 5: Estimate gas
  const entryPoint = smartAccount.entryPoint.address;
  const gasEstimates = await estimateUserOpGas(bundlerClient, userOp, entryPoint);
  applyGasEstimates(userOp, gasEstimates);

  console.log("[FundingUserOp] Gas estimates applied:", {
    callGasLimit: userOp.callGasLimit.toString(),
    verificationGasLimit: userOp.verificationGasLimit.toString(),
    preVerificationGas: userOp.preVerificationGas.toString(),
  });

  // Step 5.5: Get paymaster sponsorship (avoids 10 MON reserve requirement)
  console.log("[FundingUserOp] Requesting paymaster sponsorship...");
  const sponsorship = await sponsorUserOperation({
    userOperation: buildSponsorRequest(userOp as any), // eslint-disable-line @typescript-eslint/no-explicit-any
    entryPoint,
  });
  applySponsorshipToUserOp(userOp as any, sponsorship); // eslint-disable-line @typescript-eslint/no-explicit-any

  console.log("[FundingUserOp] Paymaster sponsorship applied:", {
    paymaster: userOp.paymaster,
    paymasterVerificationGasLimit: (userOp as any).paymasterVerificationGasLimit?.toString(), // eslint-disable-line @typescript-eslint/no-explicit-any
    paymasterPostOpGasLimit: (userOp as any).paymasterPostOpGasLimit?.toString(), // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  // Step 6: Sign UserOp with smart account (returns signature)
  console.log("[FundingUserOp] Signing UserOp...");
  const signature = await smartAccount.signUserOperation(userOp);
  userOp.signature = signature;
  console.log("[FundingUserOp] Signature:", signature.slice(0, 20) + "...");

  // Step 7: Submit UserOp to bundler (raw RPC pattern)
  console.log("[FundingUserOp] Submitting to bundler...");

  // Use raw RPC to avoid account parameter requirements
  const extendedBundler = bundlerClient as BundlerClient & {
    request: <T = unknown>(
      args: { method: string; params: unknown[] },
      options?: { retryCount?: number }
    ) => Promise<T>;
  };

  const rpcUserOperation = formatUserOperationRequest(userOp);

  const userOpHash = await extendedBundler.request(
    {
      method: "eth_sendUserOperation",
      params: [rpcUserOperation, entryPoint],
    },
    { retryCount: 0 }
  ) as Hex;

  console.log("[FundingUserOp] UserOp hash:", userOpHash);

  // Step 8: Wait for receipt
  console.log("[FundingUserOp] Waiting for receipt...");
  const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });
  console.log("[FundingUserOp] Receipt:", receipt);

  if (!receipt.success) {
    throw new Error(`UserOp failed. Hash: ${userOpHash}`);
  }

  // Step 9: Get balance after funding
  const balanceAfter = await publicClient.getBalance({ address: sessionKeyAddress });
  console.log("[FundingUserOp] Balance after:", formatEther(balanceAfter), "MON");

  return {
    success: true,
    userOpHash,
    receipt,
    balanceBefore,
    balanceAfter,
  };
}
