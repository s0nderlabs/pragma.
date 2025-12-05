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
  type Transport,
  createWalletClient,
  formatUnits,
  formatEther,
  getContract,
  getAddress,
  encodeFunctionData,
  erc20Abi,
  parseEventLogs,
  WaitForTransactionReceiptTimeoutError,
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createExecution,
  ExecutionMode,
  type ExecutionStruct,
  redeemDelegations,
} from "@metamask/delegation-toolkit";

import type { ExecutionResult, SwapQuoteData, DelegationMetadata } from "./types.js";
import type { StandardQuote } from "../../aggregators/types.js";
import { createApproveDelegation } from "../delegation/approveDelegation.js";
import { createSwapDelegation } from "../delegation/swapDelegation.js";
import { getSwapQuote, deleteSwapQuote } from "./quoteStore.js";
import { getMinBalanceForOperation } from "./sessionKeyManager.js";
import { patchMonorailMinOutput } from "../../monorail/calldataPatcher.js";
import { createErrorFromCode } from "../../errors/index.js";
import { emitProgress } from "../progress/emitter.js";
import {
  DELEGATION_MANAGER_ADDRESS,
  NONCE_ENFORCER_ADDRESS,
  NONCE_ENFORCER_ABI,
  MON_ADDRESS,
  DELEGATION_MANAGER_ABI,
  PRAGMA_FEE_ENFORCER_ADDRESS,
  ARGS_EQUALITY_CHECK_ENFORCER_ADDRESS,
  ROOT_AUTHORITY,
  MONAD_CHAIN,
} from "../config.js";
import { addPragmaFeeEnforcer, requiresFee } from "../delegation/withFeeEnforcer.js";
import { buildDelegationTypedData } from "../../delegations/typedData.js";
import { PROTOCOL_FEES } from "../config.js";

// ============================================================================
// Debug Logging
// ============================================================================

const DEBUG = process.env.H2_DEBUG === "true";

function debugLog(_message: string, _data?: any) {
  // Debug logging disabled in production
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

/**
 * Check if error is RPC infrastructure issue (not user/code fault)
 * These errors indicate problems with the RPC endpoint, not the transaction itself
 */
const isRpcInfrastructureError = (error: unknown): boolean => {
  if (!error) return false;

  // Viem timeout errors
  if (error instanceof WaitForTransactionReceiptTimeoutError) return true;
  if (error instanceof TransactionNotFoundError) return true;
  if (error instanceof TransactionReceiptNotFoundError) return true;

  // Message-based detection (fallback)
  const message = error instanceof Error ? error.message : String(error);
  return (
    /timed out while waiting for transaction/i.test(message) ||
    /block requested not found/i.test(message) ||
    /transaction (receipt )?not found/i.test(message) ||
    /connection refused/i.test(message) ||
    /rate limit/i.test(message) ||
    /gateway timeout/i.test(message) ||
    /service unavailable/i.test(message) ||
    /invalid parameters/i.test(message)
  );
};

/**
 * Check if error is retryable with a different aggregator
 * These are on-chain execution failures that might succeed with another DEX route
 */
const isRetryableExecutionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);

  // ON-CHAIN failures (retryable with different aggregator)
  // These indicate the swap route failed, not a fundamental issue
  if (/revert|execution reverted/i.test(message)) return true;
  if (/out of gas|gas required exceeds/i.test(message)) return true;
  if (/swap failed|route failed|trade failed/i.test(message)) return true;
  if (/insufficient.*output|slippage|price movement/i.test(message)) return true;
  if (/aggregator failed/i.test(message)) return true;

  // NOT retryable: config/signing errors (same error would happen with any aggregator)
  if (/signature|signing|web3auth/i.test(message)) return false;
  if (/delegation.*invalid|nonce.*invalid/i.test(message)) return false;
  if (/session key.*insufficient|session key.*balance/i.test(message)) return false;
  if (/insufficient.*balance|not enough/i.test(message)) return false;  // User balance issue

  // RPC errors are NOT retryable with different aggregator
  if (isRpcInfrastructureError(error)) return false;

  // Default: assume retryable (better to try than fail immediately)
  return true;
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
  /**
   * Authenticated transport for wallet client (e.g., /api/rpc proxy)
   * Required if sessionWallet not provided
   */
  transport?: Transport;
  /**
   * Unique signature for parallel tool identification (e.g., "MON-USDC")
   * Used to route progress messages to the correct tool instance
   */
  signature?: string;
  /**
   * Resolved description for parent tool display (e.g., "Execute USDC → MON")
   * Used to update parent tool description with human-readable text
   */
  description?: string;
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
    signature,
    description,
    transport,
  } = params;

  // Transport is required if sessionWallet not provided
  if (!params.sessionWallet && !transport) {
    throw createErrorFromCode("CONFIG_MISSING", {
      message: "Transport is required for RPC calls - cannot use direct RPC",
    });
  }

  // Step 1: Retrieve and validate quote
  const quote = getSwapQuote(quoteId);

  // Validate we have at least one aggregator quote
  if (!quote.rankedQuotes || quote.rankedQuotes.length === 0) {
    throw createErrorFromCode("QUOTE_ERROR", {
      message: "No aggregator quotes available. Quote may be expired or all aggregators failed.",
    });
  }

  debugLog("Swap execution start", {
    quoteId,
    fromToken: quote.fromToken,
    toToken: quote.toToken,
    fromSymbol: quote.fromTokenSymbol,
    toSymbol: quote.toTokenSymbol,
    amountWei: quote.amountWei.toString(),
    expectedOutputWei: quote.expectedOutputWei.toString(),
    slippageBps: quote.slippageBps,
    rankedQuotesCount: quote.rankedQuotes.length,
    availableAggregators: quote.rankedQuotes.map(q => q.aggregator),
  });

  debugLog("===== SWAP EXECUTION START =====");
  debugLog("Quote Retrieved", {
    quoteId,
    fromToken: quote.fromToken,
    toToken: quote.toToken,
    amountWei: quote.amountWei.toString(),
    availableAggregators: quote.rankedQuotes.map(q => q.aggregator),
  });

  // Step 2: Check session key balance (throw error if insufficient - LLM will fund via fundSessionKeyTool)
  const sessionKeyBalance = await publicClient.getBalance({ address: sessionKeyAddress });

  const minSwapBalance = getMinBalanceForOperation('swap');
  if (sessionKeyBalance < minSwapBalance) {
    throw createErrorFromCode("SESSION_KEY_LOW_BALANCE", {
      message: `Session key balance too low: ${formatEther(sessionKeyBalance)} MON (minimum for swap: ${formatEther(minSwapBalance)} MON). Fund session key first using fundSessionKey tool.`,
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

  // Progress: Balance verified
  // Generate signature from quote if not provided
  // Use quoteId-only format for guaranteed matching with browserAgentRunner
  const toolSignature = signature || `executeSwap:${quoteId}`;

  // Build resolved description if not provided (uses actual token symbols from quote)
  const resolvedDescription = description || `Execute ${quote.fromTokenSymbol} → ${quote.toTokenSymbol}`;

  // First progress includes description to update parent tool display
  emitProgress(`Swapping ${formatUnits(quote.amountWei, quote.fromTokenDecimals)} ${quote.fromTokenSymbol} → ${quote.toTokenSymbol}...`, "executeSwap", toolSignature, resolvedDescription);

  // Step 3: Get balance before swap (to calculate actual output later)
  // NOTE: This must be outside the retry loop - same reference point for all attempts
  const balanceBefore = isNativeToken(quote.toToken, MON_ADDRESS)
    ? await publicClient.getBalance({ address: userAddress })
    : (await publicClient.readContract({
        address: quote.toToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [userAddress],
      }) as bigint);

  // Determine if approval is needed (common to all aggregators)
  const needsApprove = !isNativeToken(quote.fromToken, MON_ADDRESS);

  // ============================================================================
  // AGGREGATOR RETRY LOOP
  // Try each aggregator in rankedQuotes order until success or all exhausted
  // On each retry: rebuild delegations with NEW aggregator address
  // ============================================================================
  let lastError: Error | null = null;

  for (let attemptIndex = 0; attemptIndex < quote.rankedQuotes.length; attemptIndex++) {
    const currentQuote = quote.rankedQuotes[attemptIndex];
    const isLastAttempt = attemptIndex === quote.rankedQuotes.length - 1;
    const isRetry = attemptIndex > 0;

    debugLog(`${isRetry ? "RETRY: " : ""}Attempting aggregator`, {
      attempt: attemptIndex + 1,
      total: quote.rankedQuotes.length,
      aggregator: currentQuote.aggregator,
      aggregatorAddress: currentQuote.aggregatorAddress,
    });

    // Emit retry progress to user
    if (isRetry) {
      emitProgress(
        `Previous route failed, trying ${currentQuote.aggregator} (${attemptIndex + 1}/${quote.rankedQuotes.length})...`,
        "executeSwap",
        toolSignature
      );
    }

    try {
      // Step 3.5: Check current allowance for THIS aggregator (each aggregator has different address)
      let currentAllowance = 0n;

      if (needsApprove) {
        currentAllowance = (await publicClient.readContract({
          address: quote.fromToken,
          abi: erc20Abi,
          functionName: "allowance",
          args: [userAddress, currentQuote.aggregatorAddress],
        }) as bigint);

        debugLog("Allowance Check", {
          fromToken: quote.fromToken,
          spender: currentQuote.aggregatorAddress,
          currentAllowance: currentAllowance.toString(),
          requiredAmount: quote.amountWei.toString(),
          needsApprove: currentAllowance < quote.amountWei,
        });
      }

      // Step 4: Fetch current nonce from NonceEnforcer
      // Re-fetch on each attempt in case previous attempt consumed it
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
      const aggregator = currentQuote.aggregatorAddress;

      // Step 5a: Create approve delegations if needed (smart allowance pattern)
      if (needsApprove) {
        // Progress: Approving router (generic message - user doesn't see aggregator name)
        emitProgress(`Approving DEX router to access your ${quote.fromTokenSymbol}...`, "executeSwap", toolSignature);

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

      // Step 5b: Patch calldata with correct slippage (Monorail only - others have slippage baked in)
      let finalCalldata = currentQuote.transactionData;

      if (currentQuote.aggregator === "monorail") {
        // Monorail requires calldata patching for slippage
        const patchResult = patchMonorailMinOutput(
          currentQuote.transactionData,
          quote.expectedOutputWei,
          quote.slippageBps
        );

        finalCalldata = patchResult.patchedCalldata;

        debugLog("Monorail Calldata Patching", {
          tradesPatched: patchResult.tradesPatched,
          originalMinOutput: patchResult.originalMinOutput.toString(),
          patchedMinOutput: patchResult.patchedMinOutput.toString(),
          slippageBps: quote.slippageBps,
          expectedOutput: quote.expectedOutputWei.toString(),
        });
      } else {
        // 0x already has slippage applied in its API response
        debugLog("Calldata ready (slippage pre-applied)", {
          aggregator: currentQuote.aggregator,
          rawMinOutput: currentQuote.rawMinOutput.toString(),
        });
      }

      // Step 5c: Create swap delegation (always needed)
      const swapDelegationResult = createSwapDelegation({
        aggregator: currentQuote.aggregatorAddress,
        aggregatorName: currentQuote.aggregator, // For calldata enforcement selection
        transactionData: finalCalldata,
        transactionValue: currentQuote.transactionValue,
        destination: userAddress, // Swap output goes to user's smart account
        delegator: userAddress,
        sessionKey: sessionKeyAddress,
        nonce, // Same nonce as approve delegations!
        chainId,
        delegationManager: DELEGATION_MANAGER_ADDRESS,
      });

      // Step 5d: Add fee enforcer if protocol fees are enabled
      let feeEnforcedSwap = null;
      let feeAllowanceDelegation = null;

      if (requiresFee("swap", PROTOCOL_FEES) && quote.protocolFeeAmount > 0n) {
        debugLog("Adding PragmaFeeEnforcer", {
          feeAmount: quote.protocolFeeAmount.toString(),
          fromToken: quote.fromToken,
          isNative: quote.fromToken === MON_ADDRESS,
        });

        feeEnforcedSwap = addPragmaFeeEnforcer(swapDelegationResult, {
          feeAmount: quote.protocolFeeAmount,
          swapAmount: quote.amountWei, // Original swap amount (before fee deduction)
          tokenAddress: quote.fromToken,
          isNative: quote.fromToken === MON_ADDRESS,
          sessionKey: sessionKeyAddress,
        });

        // CRITICAL FIX: Rebuild typedData to include fee enforcer caveat
        // Without this, the signature is created for the OLD delegation structure (without fee enforcer)
        // causing InvalidERC1271Signature error during redemption
        feeEnforcedSwap.mainDelegation.typedData = buildDelegationTypedData(
          feeEnforcedSwap.mainDelegation.delegation,
          chainId,
          DELEGATION_MANAGER_ADDRESS
        );
      }

      delegationBundles.push({
        delegationResult: feeEnforcedSwap?.mainDelegation || swapDelegationResult,
        execution: createExecution({
          target: currentQuote.aggregatorAddress,
          value: currentQuote.transactionValue,
          callData: finalCalldata,
        }),
        label: "swap",
      });

      debugLog("Delegations Created", {
        nonce: nonce.toString(),
        totalDelegations: delegationBundles.length,
        delegationTypes: delegationBundles.map(d => d.label),
        fromToken: quote.fromToken,
        toToken: quote.toToken,
        feeEnforcerAdded: !!feeEnforcedSwap,
      });

      // Step 6: Sign approve delegations (if any)
      for (let i = 0; i < delegationBundles.length - 1; i++) {
        const bundle = delegationBundles[i];
        const { delegation, typedData } = bundle.delegationResult;

        debugLog(`Signing delegation: ${bundle.label}`);

        const { signature } = await web3authBridge.signTypedData({
          typedDataJson: JSON.stringify(typedData),
          from: ownerAddress,
        });

        delegation.signature = signature;
      }

      // Step 6b: Sign swap delegation (with fee enforcer caveat if added)
      const swapBundle = delegationBundles[delegationBundles.length - 1];
      const swapTypedData = feeEnforcedSwap?.mainDelegation.typedData || swapBundle.delegationResult.typedData;

      debugLog("Signing swap delegation", {
        hasFeeEnforcer: !!feeEnforcedSwap,
        caveatsCount: swapBundle.delegationResult.delegation.caveats.length,
      });

      const swapSignatureResult = await web3authBridge.signTypedData({
        typedDataJson: JSON.stringify(swapTypedData),
        from: ownerAddress,
      });
      swapBundle.delegationResult.delegation.signature = swapSignatureResult.signature;

      // Step 6c: If fee enforcer is added, get delegation hash and create fee allowance
      if (feeEnforcedSwap) {
        debugLog("Getting swap delegation hash for fee allowance");

        const swapDelegationHash = await publicClient.readContract({
          address: DELEGATION_MANAGER_ADDRESS,
          abi: DELEGATION_MANAGER_ABI,
          functionName: "getDelegationHash",
          args: [swapBundle.delegationResult.delegation],
        });

        debugLog("Swap delegation hash", { hash: swapDelegationHash });

        // Create fee allowance delegation
        feeAllowanceDelegation = feeEnforcedSwap.createFeeAllowanceDelegation(swapDelegationHash);

        debugLog("Fee allowance delegation created", {
          delegate: feeAllowanceDelegation.delegate,
          authority: feeAllowanceDelegation.authority,
        });

        // Sign fee allowance delegation
        const feeAllowanceTypedData = buildDelegationTypedData(
          feeAllowanceDelegation,
          chainId,
          DELEGATION_MANAGER_ADDRESS
        );

        debugLog("Signing fee allowance delegation");

        const feeSignatureResult = await web3authBridge.signTypedData({
          typedDataJson: JSON.stringify(feeAllowanceTypedData),
          from: ownerAddress,
        });
        feeAllowanceDelegation.signature = feeSignatureResult.signature;

        debugLog("Fee allowance delegation signed");

        // Update swap delegation's caveat args (no re-signing needed!)
        feeEnforcedSwap.updateMainDelegationArgs(feeAllowanceDelegation);

        debugLog("Swap delegation args updated with fee allowance");
      }

      // Step 6d: Collect delegation metadata for activity tracking
      const delegationTypes: string[] = delegationBundles.map(b => b.label);
      const delegationMetadata = {
        delegator: userAddress,
        sessionKey: sessionKeyAddress,
        nonce,
        delegationCount: delegationBundles.length + (feeAllowanceDelegation ? 1 : 0),
        delegationTypes,
        expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes from now
        feeEnforced: !!feeEnforcedSwap,

        // Detailed per-delegation breakdown for transparency
        delegations: delegationBundles.map(bundle => ({
          type: bundle.label,
          target: bundle.execution.target,
          functionSelector: bundle.execution.callData.slice(0, 10),
          value: bundle.execution.value.toString(),
          enforcers: bundle.delegationResult.delegation.caveats.map((c: any) => c.enforcer),
        })),
      };

      debugLog("Delegation Metadata", delegationMetadata);

      // Step 7: Get or create session wallet client
      // Use provided wallet for proper nonce management (prevents parallel tx collisions)
      // Or create temporary wallet as fallback (legacy behavior)
      let sessionWallet = params.sessionWallet;

      if (!sessionWallet) {
        // FALLBACK: Create temporary wallet using transport from params
        // WARNING: This creates nonce collisions in parallel execution
        sessionWallet = createWalletClient({
          account: privateKeyToAccount(sessionKeyPrivateKey),
          chain: MONAD_CHAIN,
          transport: transport!,
        });
      }

      // Step 8: Execute all delegations sequentially
      // Each delegation is independent and executes one blockchain action
      let finalTxHash: Hex = "0x" as Hex;

      // Progress: Building delegations complete
      emitProgress(`Building swap delegation with ${(quote.slippageBps / 100).toFixed(1)}% slippage protection...`, "executeSwap", toolSignature);

      for (const bundle of delegationBundles) {
        const { delegation } = bundle.delegationResult;

        debugLog(`Executing delegation: ${bundle.label}`, {
          target: bundle.execution.target,
          value: bundle.execution.value.toString(),
          calldata: bundle.execution.callData.slice(0, 66) + "...",
        });

        // Progress: Executing delegation
        if (bundle.label === "swap") {
          emitProgress(`Executing swap...`, "executeSwap", toolSignature);
        }

        let txHash: Hex | undefined;
        try {
          txHash = await redeemDelegations(
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

          // Progress: Waiting for confirmation
          if (bundle.label === "swap") {
            emitProgress(`Waiting for blockchain confirmation...`, "executeSwap", toolSignature);
          }

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

      // Check if RPC infrastructure issue
      if (isRpcInfrastructureError(error)) {
        const txHashInfo = txHash ? `(hash: ${txHash})` : "(transaction may not have been broadcast)";
        throw new Error(
          `⚠️  RPC Endpoint Issue: ${bundle.label} transaction confirmation failed.\n\n` +
          `This is a network infrastructure problem, not a bug in your transaction.\n\n` +
          `What happened:\n` +
          `• Your transaction was sent to the blockchain ${txHashInfo}\n` +
          `• The RPC provider failed to confirm it within 60 seconds\n` +
          `• This could be due to RPC sync lag, rate limiting, or network issues\n\n` +
          `Your tokens are SAFE. Possible outcomes:\n` +
          `• Transaction is pending confirmation\n` +
          `• Transaction completed but RPC didn't report it\n\n` +
          `Recommended actions:\n` +
          `1. Check transaction status manually (explorer or different RPC)\n` +
          `2. Check your balance - operation may have succeeded\n` +
          `3. Try again in a few moments\n` +
          `4. Switch to different RPC endpoint if problem persists\n\n` +
          `Technical details: ${error.message}`
        );
      }

      throw new Error(`Failed to execute ${bundle.label}: ${error.message}`);
    }
  }

  // Verify we executed at least the swap
  if (finalTxHash === ("0x" as Hex)) {
    throw new Error("No swap transaction was executed");
  }

  // Step 9: Wait for final transaction confirmation (if not already done)
  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({
      hash: finalTxHash,
      timeout: 60_000,  // 60 second timeout
    });

    debugLog("Final transaction confirmed", {
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      status: receipt.status,
    });
  } catch (error: any) {
    debugLog("Final confirmation FAILED", { error: error.message });

    if (isRpcInfrastructureError(error)) {
      throw new Error(
        `⚠️  RPC Endpoint Issue: Transaction confirmation failed.\n\n` +
        `This is a network infrastructure problem, not a bug.\n\n` +
        `What happened:\n` +
        `• Your swap transaction was submitted (hash: ${finalTxHash})\n` +
        `• The RPC provider failed to return confirmation\n` +
        `• This is often due to RPC sync issues or rate limiting\n\n` +
        `Your tokens are SAFE. Possible outcomes:\n` +
        `• Transaction is pending confirmation (check status manually)\n` +
        `• Transaction completed but RPC didn't report it\n\n` +
        `Recommended actions:\n` +
        `1. Check transaction on block explorer\n` +
        `2. Check your balance - swap may have succeeded\n` +
        `3. Try different RPC endpoint if problem persists\n\n` +
        `Technical details: ${error.message}`
      );
    }

    throw error;
  }

  // Step 10: Calculate actual output using event parsing (safe for parallel swaps)
  // CRITICAL: Cannot use balance difference for parallel swaps due to race conditions
  // All parallel swaps read balanceBefore simultaneously, then all read balanceAfter after completion
  // Result: Each swap claims credit for TOTAL balance change (7x individual amount for 7 parallel swaps)
  //
  // Solution: Parse transaction logs for exact amounts
  // - Strategy 1: ERC20 Transfer events (for WMON and other ERC20 outputs)
  // - Strategy 2: WMON Withdrawal events (for native MON outputs after unwrapping)
  // - Strategy 3: Balance difference fallback (for single swaps or edge cases)
  let actualOutput: bigint;

  try {
    debugLog("Parsing transaction events for exact output amount");

    // Strategy 1: Try to find ERC20 Transfer TO user (works for WMON)
    const transferEvents = parseEventLogs({
      abi: erc20Abi,
      logs: receipt.logs,
      eventName: 'Transfer'
    });

    const transferToUser = transferEvents.find(event =>
      event.address.toLowerCase() === quote.toToken.toLowerCase() &&
      event.args.to?.toLowerCase() === userAddress.toLowerCase()
    );

    if (transferToUser && transferToUser.args.value) {
      actualOutput = transferToUser.args.value;
      debugLog("✓ Detected output amount from Transfer event", {
        amount: formatUnits(actualOutput, quote.toTokenDecimals),
        token: quote.toTokenSymbol
      });
    } else {
      // Strategy 2: Try to find WMON Withdrawal event (native MON output)
      // When Monorail routes through WMON pool, it unwraps to native MON
      // Event signature: Withdrawal(address indexed src, uint256 wad)
      const withdrawalAbi = [{
        type: 'event',
        name: 'Withdrawal',
        inputs: [
          { name: 'src', type: 'address', indexed: true },
          { name: 'wad', type: 'uint256', indexed: false }
        ]
      }] as const;

      const withdrawalEvents = parseEventLogs({
        abi: withdrawalAbi,
        logs: receipt.logs,
        eventName: 'Withdrawal'
      });

      if (withdrawalEvents.length > 0) {
        // Take the last withdrawal event (most likely our unwrap)
        actualOutput = withdrawalEvents[withdrawalEvents.length - 1].args.wad!;
        debugLog("✓ Detected output amount from Withdrawal event (native MON)", {
          amount: formatEther(actualOutput),
          token: 'MON'
        });
      } else {
        // Strategy 3: Fallback to balance difference (for single swaps or unknown cases)
        debugLog("⚠ No Transfer or Withdrawal events found, falling back to balance difference");
        const balanceAfter = isNativeToken(quote.toToken, MON_ADDRESS)
          ? await publicClient.getBalance({ address: userAddress })
          : (await publicClient.readContract({
              address: quote.toToken,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [userAddress],
            }) as bigint);
        actualOutput = balanceAfter - balanceBefore;
        debugLog("Balance difference calculation result", {
          balanceBefore: formatUnits(balanceBefore, quote.toTokenDecimals),
          balanceAfter: formatUnits(balanceAfter, quote.toTokenDecimals),
          actualOutput: formatUnits(actualOutput, quote.toTokenDecimals),
          warning: "This may be inaccurate for parallel swaps"
        });
      }
    }
  } catch (error) {
    // If event parsing fails entirely, fall back to balance difference
    debugLog("Event parsing failed, using balance difference fallback", { error });
    const balanceAfter = isNativeToken(quote.toToken, MON_ADDRESS)
      ? await publicClient.getBalance({ address: userAddress })
      : (await publicClient.readContract({
          address: quote.toToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [userAddress],
        }) as bigint);
    actualOutput = balanceAfter - balanceBefore;
  }

  // Step 10.5: Determine transaction status
  // CRITICAL: Check if swap actually succeeded (actualOutput > 0)
  // Transaction may be mined successfully (receipt.status = "success")
  // but swap can still fail due to slippage, price movement, etc.
  let status: "success" | "reverted" | "failed";
  if (receipt.status !== "success") {
    status = "reverted"; // Transaction itself reverted
  } else if (actualOutput <= 0n) {
    status = "failed"; // Transaction succeeded but swap failed (zero output)
  } else {
    status = "success"; // Transaction succeeded and swap succeeded
  }

      // Step 11: Clean up quote from store
      deleteSwapQuote(quoteId);

      // Step 12: Return execution result with full metadata
      // SUCCESS PATH - aggregator worked, return immediately
      return {
        txHash: finalTxHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice,
        status,
        actualOutput,
        actualOutputFormatted: formatUnits(actualOutput, quote.toTokenDecimals),

        // Token metadata for activity display
        fromToken: quote.fromTokenSymbol,
        toToken: quote.toTokenSymbol,
        fromAmount: formatUnits(quote.amountWei, quote.fromTokenDecimals),

        // Delegation metadata for activity tracking
        delegationMetadata,
      };

    } catch (error) {
      // ====================================================================
      // RETRY LOGIC: Decide whether to try next aggregator or throw
      // ====================================================================
      lastError = error as Error;

      debugLog("Aggregator execution failed", {
        aggregator: currentQuote.aggregator,
        attempt: attemptIndex + 1,
        total: quote.rankedQuotes.length,
        error: lastError.message,
        isRetryable: isRetryableExecutionError(error),
        isLastAttempt,
      });

      // Check if error is retryable with a different aggregator
      const canRetry = isRetryableExecutionError(error) && !isLastAttempt;

      if (!canRetry) {
        // Non-retryable error or no more aggregators to try
        // Add context about which aggregators were attempted
        const attemptedAggregators = quote.rankedQuotes
          .slice(0, attemptIndex + 1)
          .map(q => q.aggregator)
          .join(", ");

        const enhancedMessage = isLastAttempt && attemptIndex > 0
          ? `Swap failed after trying all ${attemptIndex + 1} aggregators (${attemptedAggregators}). ` +
            `Last error: ${lastError.message}`
          : lastError.message;

        throw new Error(enhancedMessage);
      }

      // Retryable error and more aggregators available - emit progress and continue loop
      emitProgress(
        `${currentQuote.aggregator} swap reverted, trying next route...`,
        "executeSwap",
        toolSignature
      );

      // Continue to next aggregator in the loop
    }
  } // End of retry loop

  // ============================================================================
  // ALL AGGREGATORS EXHAUSTED
  // This should only be reached if no aggregator returned successfully
  // ============================================================================
  const attemptedAggregators = quote.rankedQuotes.map(q => q.aggregator).join(", ");
  throw lastError || new Error(
    `Swap failed: All ${quote.rankedQuotes.length} aggregators failed (${attemptedAggregators}). ` +
    `Please try again or reduce the swap amount.`
  );
}
