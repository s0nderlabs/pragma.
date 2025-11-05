/**
 * Execute Swap with Multi-Delegation Architecture
 *
 * This module implements swap execution using the multi-delegation pattern:
 * - ONE delegation = ONE blockchain action
 * - Approve and swap are separate delegations
 * - Each delegation has its own enforcement rules
 * - All delegations share the same nonce
 *
 * Flow:
 * 1. Retrieve and validate quote
 * 2. Check session key balance (fund if needed)
 * 3. Fetch current nonce from DelegationManager
 * 4. Create delegation(s): approve (0-2 calls) + swap (1 call)
 * 5. Sign all delegations with Web3Auth
 * 6. Execute all delegations sequentially
 * 7. Wait for confirmation
 * 8. Calculate actual output
 * 9. Return receipt
 */

import {
  type Address,
  type Hex,
  type PublicClient,
  createWalletClient,
  http,
  formatUnits,
  formatEther,
  getContract,
  getAddress,
  encodeFunctionData,
  erc20Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createExecution,
  ExecutionMode,
  type ExecutionStruct,
  redeemDelegations,
} from "@metamask/delegation-toolkit";

import type { ExecutionResult, SwapQuoteData } from "./types.js";
import { createApproveDelegation } from "../delegation/approveDelegation.js";
import { createSwapDelegation } from "../delegation/swapDelegation.js";
import { getSwapQuote, deleteSwapQuote } from "./quoteStore.js";
import { checkSessionKeyBalance, fundSessionKey, SESSION_KEY_FUNDING_AMOUNT } from "./sessionKeyManager.js";
import { patchMonorailMinOutput } from "../../monorail/calldataPatcher.js";
import {
  MONAD_RPC_URL,
  DELEGATION_MANAGER_ADDRESS,
  NONCE_ENFORCER_ADDRESS,
  NONCE_ENFORCER_ABI,
  MON_ADDRESS,
} from "../config.js";

// ============================================================================
// Debug Logging
// ============================================================================

const DEBUG = process.env.H2_DEBUG === "true";

function debugLog(message: string, data?: any) {
  if (DEBUG) {
    console.log(`\n[H2 DEBUG] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, (key, value) =>
        typeof value === "bigint" ? value.toString() : value
      , 2));
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if token address is native MON token
 */
const isNativeToken = (tokenAddress: Address, nativeAddress: Address): boolean => {
  return tokenAddress.toLowerCase() === nativeAddress.toLowerCase();
};

// ============================================================================
// Execute Swap Implementation
// ============================================================================

export interface ExecuteSwapParams {
  /** Quote ID from getSwapQuote */
  quoteId: string;
  /** Smart account address (HybridDelegator) */
  userAddress: Address;
  /** Session key address */
  sessionKeyAddress: Address;
  /** Session key private key */
  sessionKeyPrivateKey: Hex;
  /** Owner address (for signing delegation) */
  ownerAddress: Address;
  /** Public client for reading blockchain state */
  publicClient: PublicClient;
  /** Web3Auth bridge for delegation signing */
  web3authBridge: any; // Type: Web3AuthBridge from apps/cli (has signTypedData method)
  /** Chain ID */
  chainId: number;
  /** Smart account instance from DTK (for UserOp-based session key funding) */
  smartAccount?: any;
  /** Bundler client (for UserOp-based session key funding) */
  bundlerClient?: any;
  /**
   * Shared session wallet client (for transaction nonce management)
   * @recommended Pass this from agent context to prevent nonce collisions in parallel transactions
   * @fallback If not provided, creates temporary wallet (legacy behavior - not recommended for parallel ops)
   */
  sessionWallet?: any; // Type: viem WalletClient
}

/**
 * Execute a swap transaction with ephemeral delegation
 *
 * @param params - Execution parameters
 * @returns Execution result with transaction hash and receipt
 *
 * @throws {QuoteNotFoundError} If quote not found
 * @throws {QuoteExpiredError} If quote expired
 * @throws {SessionKeyFundingError} If session key funding fails
 * @throws {Error} If execution fails
 */
export async function executeSwap(params: ExecuteSwapParams): Promise<ExecutionResult> {
  const {
    quoteId,
    userAddress,
    sessionKeyAddress,
    sessionKeyPrivateKey,
    ownerAddress,
    publicClient,
    web3authBridge,
    chainId,
    smartAccount,
    bundlerClient,
  } = params;

  // Step 1: Retrieve and validate quote
  const quote = getSwapQuote(quoteId);

  debugLog("===== SWAP EXECUTION START =====");
  debugLog("Quote Retrieved", {
    quoteId,
    fromToken: quote.fromToken,
    toToken: quote.toToken,
    amountWei: quote.amountWei.toString(),
    aggregator: quote.monorailQuote.aggregator,
    transactionValue: quote.monorailQuote.transactionValue.toString(),
  });

  // Step 2: Check session key balance and auto-fund if needed
  const { needsFunding, balance, recommendedFundingAmount } = await checkSessionKeyBalance(
    sessionKeyAddress,
    publicClient
  );

  if (needsFunding) {
    // Notify user about auto-funding
    console.log(`\n⚡ Session key needs gas`);
    console.log(`   Current balance: ${formatEther(balance)} MON (minimum: 0.1 MON)`);
    console.log(`   Transferring ${formatEther(SESSION_KEY_FUNDING_AMOUNT)} MON from smart account...\n`);

    debugLog("Session Key Funding Required", {
      currentBalance: formatUnits(balance, 18),
      threshold: "0.1 MON",
      fundingAmount: formatUnits(recommendedFundingAmount, 18),
    });

    const fundingResult = await fundSessionKey(
      {
        smartAccountAddress: userAddress,
        sessionKeyAddress,
        sessionKeyPrivateKey,
        ownerAddress,
        chainId,
        rpcUrl: MONAD_RPC_URL,
        delegationManager: DELEGATION_MANAGER_ADDRESS,
        smartAccount,
        bundlerClient,
      },
      publicClient,
      web3authBridge
    );

    console.log(`✓ Session key funded: ${formatEther(fundingResult.newBalance)} MON`);
    console.log(`   Tx: ${fundingResult.txHash}\n`);

    debugLog("Session Key Funded", {
      oldBalance: formatUnits(balance, 18),
      newBalance: formatUnits(fundingResult.newBalance, 18),
      fundedAmount: formatUnits(fundingResult.fundedAmount, 18),
    });
  }

  // Step 2.5: Verify on-chain balance matches quote amount (guard against stale indexer data)
  const actualBalance = isNativeToken(quote.fromToken, MON_ADDRESS)
    ? await publicClient.getBalance({ address: userAddress })
    : (await publicClient.readContract({
        address: quote.fromToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [userAddress],
      }) as bigint);

  if (actualBalance < quote.amountWei) {
    const shortfall = quote.amountWei - actualBalance;
    throw new Error(
      `Insufficient ${quote.fromTokenSymbol} balance for swap.\n` +
      `Required: ${formatUnits(quote.amountWei, quote.fromTokenDecimals)} ${quote.fromTokenSymbol}\n` +
      `Available: ${formatUnits(actualBalance, quote.fromTokenDecimals)} ${quote.fromTokenSymbol}\n` +
      `Shortfall: ${formatUnits(shortfall, quote.fromTokenDecimals)} ${quote.fromTokenSymbol}\n\n` +
      `This can happen if another transaction spent tokens between quote and execution.\n` +
      `Please request a fresh quote and try again.`
    );
  }

  debugLog("Balance Verified", {
    token: quote.fromToken,
    symbol: quote.fromTokenSymbol,
    required: quote.amountWei.toString(),
    actual: actualBalance.toString(),
    sufficient: true,
  });

  // Step 3: Get balance before swap (to calculate actual output later)
  const balanceBefore = isNativeToken(quote.toToken, MON_ADDRESS)
    ? await publicClient.getBalance({ address: userAddress })
    : (await publicClient.readContract({
        address: quote.toToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [userAddress],
      }) as bigint);

  // Step 3.5: Check current allowance (for ERC20 swaps, to optimize approve)
  let currentAllowance = 0n;
  const needsApprove = !isNativeToken(quote.fromToken, MON_ADDRESS);

  if (needsApprove) {
    currentAllowance = (await publicClient.readContract({
      address: quote.fromToken,
      abi: erc20Abi,
      functionName: "allowance",
      args: [userAddress, getAddress(quote.monorailQuote.aggregator)],
    }) as bigint);

    debugLog("Allowance Check", {
      fromToken: quote.fromToken,
      spender: getAddress(quote.monorailQuote.aggregator),
      currentAllowance: currentAllowance.toString(),
      requiredAmount: quote.amountWei.toString(),
      needsApprove: currentAllowance < quote.amountWei,
    });
  }

  // Step 4: Fetch current nonce from NonceEnforcer
  // All delegations in this batch will share the same nonce
  const nonce = await publicClient.readContract({
    address: NONCE_ENFORCER_ADDRESS,
    abi: NONCE_ENFORCER_ABI,
    functionName: "currentNonce",
    args: [DELEGATION_MANAGER_ADDRESS, userAddress],
  }) as bigint;

  // Step 5: Create delegations (multi-delegation architecture)
  // - Approve delegation(s): 0-2 depending on current allowance
  // - Swap delegation: 1 always
  interface DelegationBundle {
    delegationResult: any; // Result from createApproveDelegation/createSwapDelegation
    execution: ExecutionStruct;
    label: string;
  }

  const delegationBundles: DelegationBundle[] = [];
  const aggregator = getAddress(quote.monorailQuote.aggregator);

  // Step 5a: Create approve delegations if needed (smart allowance pattern)
  if (needsApprove) {
    // Case 1: Sufficient allowance - skip approve entirely (gas optimization)
    if (currentAllowance >= quote.amountWei) {
      // No approve delegations needed
      debugLog("Approve delegations: SKIPPED (sufficient allowance)", {
        currentAllowance: currentAllowance.toString(),
        requiredAmount: quote.amountWei.toString(),
      });
    }
    // Case 2: Has allowance but insufficient - reset to 0 first (USDC/USDT safety)
    else if (currentAllowance > 0n && currentAllowance < quote.amountWei) {
      // Reset delegation: approve(0)
      const resetDelegationResult = createApproveDelegation({
        tokenAddress: quote.fromToken,
        spender: aggregator,
        amount: 0n,
        delegator: userAddress,
        sessionKey: sessionKeyAddress,
        nonce,
        chainId,
        delegationManager: DELEGATION_MANAGER_ADDRESS,
      });

      const resetCalldata = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [aggregator, 0n],
      });

      delegationBundles.push({
        delegationResult: resetDelegationResult,
        execution: createExecution({
          target: quote.fromToken,
          value: 0n,
          callData: resetCalldata,
        }),
        label: "approve(0) - Reset",
      });

      // Approve delegation: approve(amount)
      const approveDelegationResult = createApproveDelegation({
        tokenAddress: quote.fromToken,
        spender: aggregator,
        amount: quote.amountWei,
        delegator: userAddress,
        sessionKey: sessionKeyAddress,
        nonce, // Same nonce!
        chainId,
        delegationManager: DELEGATION_MANAGER_ADDRESS,
      });

      const approveCalldata = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [aggregator, quote.amountWei],
      });

      delegationBundles.push({
        delegationResult: approveDelegationResult,
        execution: createExecution({
          target: quote.fromToken,
          value: 0n,
          callData: approveCalldata,
        }),
        label: "approve(amount)",
      });

      debugLog("Approve delegations: RESET + APPROVE (insufficient allowance)", {
        currentAllowance: currentAllowance.toString(),
        requiredAmount: quote.amountWei.toString(),
        totalDelegations: 2,
      });
    }
    // Case 3: No existing allowance - approve directly
    else {
      const approveDelegationResult = createApproveDelegation({
        tokenAddress: quote.fromToken,
        spender: aggregator,
        amount: quote.amountWei,
        delegator: userAddress,
        sessionKey: sessionKeyAddress,
        nonce,
        chainId,
        delegationManager: DELEGATION_MANAGER_ADDRESS,
      });

      const approveCalldata = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [aggregator, quote.amountWei],
      });

      delegationBundles.push({
        delegationResult: approveDelegationResult,
        execution: createExecution({
          target: quote.fromToken,
          value: 0n,
          callData: approveCalldata,
        }),
        label: "approve(amount) - Direct",
      });

      debugLog("Approve delegations: DIRECT APPROVE (zero allowance)", {
        requiredAmount: quote.amountWei.toString(),
        totalDelegations: 1,
      });
    }
  } else {
    debugLog("Approve delegations: NOT NEEDED (native token)", {
      fromToken: quote.fromToken,
    });
  }

  // Step 5b: Patch Monorail calldata with correct slippage (before creating swap delegation)
  const patchResult = patchMonorailMinOutput(
    quote.monorailQuote.transactionData,
    quote.expectedOutputWei,
    quote.slippageBps
  );

  debugLog("Calldata Patching", {
    tradesPatched: patchResult.tradesPatched,
    originalMinOutput: patchResult.originalMinOutput.toString(),
    patchedMinOutput: patchResult.patchedMinOutput.toString(),
    slippageBps: quote.slippageBps,
    expectedOutput: quote.expectedOutputWei.toString(),
  });

  // Step 5c: Create swap delegation (always needed)
  const swapDelegationResult = createSwapDelegation({
    aggregator: quote.monorailQuote.aggregator,
    transactionData: patchResult.patchedCalldata,
    transactionValue: quote.monorailQuote.transactionValue,
    destination: userAddress, // Swap output goes to user's smart account
    delegator: userAddress,
    sessionKey: sessionKeyAddress,
    nonce, // Same nonce as approve delegations!
    chainId,
    delegationManager: DELEGATION_MANAGER_ADDRESS,
  });

  delegationBundles.push({
    delegationResult: swapDelegationResult,
    execution: createExecution({
      target: quote.monorailQuote.aggregator,
      value: quote.monorailQuote.transactionValue,
      callData: patchResult.patchedCalldata,
    }),
    label: "swap",
  });

  debugLog("Delegations Created", {
    nonce: nonce.toString(),
    totalDelegations: delegationBundles.length,
    delegationTypes: delegationBundles.map(d => d.label),
    fromToken: quote.fromToken,
    toToken: quote.toToken,
  });

  // Step 6: Sign all delegations with Web3Auth
  for (const bundle of delegationBundles) {
    const { delegation, typedData } = bundle.delegationResult;

    debugLog(`Signing delegation: ${bundle.label}`);

    const { signature } = await web3authBridge.signTypedData({
      typedDataJson: JSON.stringify(typedData),
      from: ownerAddress,
    });

    // Attach signature to delegation
    delegation.signature = signature;
  }

  // Step 7: Get or create session wallet client
  // Use provided wallet for proper nonce management (prevents parallel tx collisions)
  // Or create temporary wallet as fallback (legacy behavior)
  let sessionWallet = params.sessionWallet;

  if (!sessionWallet) {
    // FALLBACK: Create temporary wallet (backward compatibility)
    // WARNING: This creates nonce collisions in parallel execution
    if (DEBUG || process.env.H2_WARN_NONCE) {
      console.log("\n⚠️  Creating temporary session wallet (deprecated for parallel ops)");
      console.log("   Recommendation: Pass sessionWallet via config to prevent nonce collisions\n");
    }

    sessionWallet = createWalletClient({
      account: privateKeyToAccount(sessionKeyPrivateKey),
      chain: {
        id: chainId,
        name: "Monad",
        nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
        rpcUrls: { default: { http: [MONAD_RPC_URL] }, public: { http: [MONAD_RPC_URL] } },
      },
      transport: http(MONAD_RPC_URL),
    });
  }

  // Step 8: Execute all delegations sequentially
  // Each delegation is independent and executes one blockchain action
  let finalTxHash: Hex = "0x" as Hex;

  for (const bundle of delegationBundles) {
    const { delegation } = bundle.delegationResult;

    debugLog(`Executing delegation: ${bundle.label}`, {
      target: bundle.execution.target,
      value: bundle.execution.value.toString(),
      calldata: bundle.execution.callData.slice(0, 66) + "...",
    });

    try {
      const txHash = await redeemDelegations(
        sessionWallet,
        publicClient,
        DELEGATION_MANAGER_ADDRESS,
        [{
          permissionContext: [delegation],
          executions: [bundle.execution],
          mode: ExecutionMode.SingleDefault,
        }],
      );

      debugLog(`${bundle.label} transaction sent`, { hash: txHash });

      // Wait for confirmation with timeout (60 seconds)
      // Prevents infinite waiting if transaction gets stuck
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,  // 60 second timeout
      });

      debugLog(`${bundle.label} transaction confirmed`);

      // Track the final transaction (swap) for the receipt
      if (bundle.label === "swap") {
        finalTxHash = txHash;
      }
    } catch (error: any) {
      debugLog(`${bundle.label} FAILED`, {
        error: error.message,
        stack: error.stack,
        details: error.details,
      });
      throw new Error(`Failed to execute ${bundle.label}: ${error.message}`);
    }
  }

  // Verify we executed at least the swap
  if (finalTxHash === ("0x" as Hex)) {
    throw new Error("No swap transaction was executed");
  }

  // Step 9: Wait for final transaction confirmation (if not already done)
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: finalTxHash,
    timeout: 60_000,  // 60 second timeout
  });

  debugLog("Final transaction confirmed", {
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status,
  });

  // Step 10: Calculate actual output (balance after - balance before)
  const balanceAfter = isNativeToken(quote.toToken, MON_ADDRESS)
    ? await publicClient.getBalance({ address: userAddress })
    : (await publicClient.readContract({
        address: quote.toToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [userAddress],
      }) as bigint);
  const actualOutput = balanceAfter - balanceBefore;

  // Step 11: Clean up quote from store
  deleteSwapQuote(quoteId);

  // Step 12: Return execution result
  return {
    txHash: finalTxHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    status: receipt.status === "success" ? "success" : "reverted",
    actualOutput,
    actualOutputFormatted: formatUnits(actualOutput, quote.toTokenDecimals),
  };
}
