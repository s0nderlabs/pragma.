/**
 * Execute Swap with Ephemeral Delegation
 *
 * This module implements the actual swap execution using ephemeral delegations.
 *
 * Flow:
 * 1. Retrieve and validate quote
 * 2. Check session key balance (fund if needed)
 * 3. Fetch current nonce from DelegationManager
 * 4. Create ephemeral delegation
 * 5. Sign delegation with Web3Auth
 * 6. Build transaction execution
 * 7. Sign transaction with session key
 * 8. Submit to bundler/RPC
 * 9. Wait for confirmation
 * 10. Calculate actual output
 * 11. Return receipt
 */

import {
  type Address,
  type Hex,
  type PublicClient,
  createWalletClient,
  http,
  formatUnits,
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
import { createEphemeralDelegation } from "../delegation/ephemeral.js";
import { getSwapQuote, deleteSwapQuote } from "./quoteStore.js";
import { checkSessionKeyBalance } from "./sessionKeyManager.js";
import { patchMonorailMinOutput } from "../../monorail/calldataPatcher.js";

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
// Configuration
// ============================================================================

// These will be loaded from environment/config
const MONAD_RPC_URL = process.env.MONAD_EXECUTION_RPC_URL || "https://testnet.monad.xyz/";
const DELEGATION_MANAGER_ADDRESS = (process.env.DELEGATION_MANAGER_ADDRESS as Address) || "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" as Address;
const NONCE_ENFORCER_ADDRESS = (process.env.NONCE_ENFORCER_ADDRESS as Address) || "0xDE4f2FAC4B3D87A1d9953Ca5FC09FCa7F366254f" as Address;
const MON_ADDRESS = (process.env.MON_ADDRESS as Address) || "0x0000000000000000000000000000000000000000" as Address;

// NonceEnforcer ABI (used to fetch delegation nonce - H1 pattern)
const NONCE_ENFORCER_ABI = [
  {
    type: "function",
    name: "currentNonce",
    stateMutability: "view",
    inputs: [
      { name: "delegationManager", type: "address" },
      { name: "delegator", type: "address" },
    ],
    outputs: [{ name: "nonce", type: "uint256" }],
  },
] as const;

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

  // Step 2: Check session key balance
  const { needsFunding, balance } = await checkSessionKeyBalance(
    sessionKeyAddress,
    publicClient
  );

  if (needsFunding) {
    throw new Error(
      `Session key balance too low: ${formatUnits(balance, 18)} MON. ` +
      `Please fund the session key before executing.`
    );
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

  // Step 4: Fetch current nonce from NonceEnforcer (H1 pattern)
  const nonce = await publicClient.readContract({
    address: NONCE_ENFORCER_ADDRESS,
    abi: NONCE_ENFORCER_ABI,
    functionName: "currentNonce",
    args: [DELEGATION_MANAGER_ADDRESS, userAddress],
  }) as bigint;

  // Step 5: Create ephemeral delegation
  const { delegation, typedData, callLimit, requiresApprove } = createEphemeralDelegation({
    quote: quote.monorailQuote,
    delegator: userAddress,
    sessionKey: sessionKeyAddress,
    nonce,
    chainId,
    delegationManager: DELEGATION_MANAGER_ADDRESS,
    fromToken: quote.fromToken,
    toToken: quote.toToken,
    nativeTokenAddress: MON_ADDRESS,
    currentAllowance, // Pass allowance for smart callLimit calculation
    requiredAmount: quote.amountWei, // Pass required amount for comparison
  });

  debugLog("Delegation Created", {
    nonce: nonce.toString(),
    callLimit,
    requiresApprove,
    delegator: userAddress,
    delegate: sessionKeyAddress,
    fromToken: quote.fromToken,
    toToken: quote.toToken,
  });

  // Step 6: Sign delegation with Web3Auth
  const { signature } = await web3authBridge.signTypedData({
    typedDataJson: JSON.stringify(typedData),
    from: ownerAddress,
  });

  // Attach signature to delegation
  delegation.signature = signature;

  // Step 7: Create session wallet client
  const sessionWallet = createWalletClient({
    account: privateKeyToAccount(sessionKeyPrivateKey),
    chain: {
      id: chainId,
      name: "Monad",
      nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
      rpcUrls: { default: { http: [MONAD_RPC_URL] }, public: { http: [MONAD_RPC_URL] } },
    },
    transport: http(MONAD_RPC_URL),
  });

  // Step 8: Execute approve if needed (smart allowance pattern)
  if (needsApprove) {
    const aggregator = getAddress(quote.monorailQuote.aggregator);

    // Case 1: Sufficient allowance - skip approve entirely (gas optimization)
    if (currentAllowance >= quote.amountWei) {
      // No approve needed, sufficient allowance exists
      // This saves ~45k gas and one transaction
    }
    // Case 2: Has allowance but insufficient - reset to 0 first (USDC safety)
    else if (currentAllowance > 0n && currentAllowance < quote.amountWei) {
      // Reset allowance to 0 first (USDC/USDT requirement)
      const resetCalldata = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [aggregator, 0n],
      });

      const resetExecution = createExecution({
        target: quote.fromToken,
        value: 0n,
        callData: resetCalldata,
      });

      debugLog("Executing approve(0) - Reset allowance", {
        token: quote.fromToken,
        spender: aggregator,
        currentAllowance: currentAllowance.toString(),
        calldata: resetCalldata,
      });

      try {
        const resetTxHash = await redeemDelegations(
          sessionWallet,
          publicClient,
          DELEGATION_MANAGER_ADDRESS,
          [{
            permissionContext: [delegation],
            executions: [resetExecution],
            mode: ExecutionMode.SingleDefault,
          }],
        );

        debugLog("approve(0) transaction sent", { hash: resetTxHash });
        await publicClient.waitForTransactionReceipt({ hash: resetTxHash });
        debugLog("approve(0) transaction confirmed");
      } catch (error: any) {
        debugLog("approve(0) FAILED", {
          error: error.message,
          stack: error.stack,
          details: error.details,
        });
        throw new Error(`Failed to reset allowance: ${error.message}`);
      }

      // Then approve the required amount
      const approveCalldata = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [aggregator, quote.amountWei],
      });

      const approveExecution = createExecution({
        target: quote.fromToken,
        value: 0n,
        callData: approveCalldata,
      });

      debugLog("Executing approve(amount) after reset", {
        token: quote.fromToken,
        spender: aggregator,
        amount: quote.amountWei.toString(),
        calldata: approveCalldata,
      });

      try {
        const approveTxHash = await redeemDelegations(
          sessionWallet,
          publicClient,
          DELEGATION_MANAGER_ADDRESS,
          [{
            permissionContext: [delegation],
            executions: [approveExecution],
            mode: ExecutionMode.SingleDefault,
          }],
        );

        debugLog("approve(amount) transaction sent", { hash: approveTxHash });
        await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
        debugLog("approve(amount) transaction confirmed");
      } catch (error: any) {
        debugLog("approve(amount) FAILED", {
          error: error.message,
          stack: error.stack,
          details: error.details,
        });
        throw new Error(`Failed to approve token: ${error.message}`);
      }
    }
    // Case 3: No existing allowance - approve directly
    else {
      const approveCalldata = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [aggregator, quote.amountWei],
      });

      const approveExecution = createExecution({
        target: quote.fromToken,
        value: 0n,
        callData: approveCalldata,
      });

      debugLog("Executing approve(amount) - Direct approve", {
        token: quote.fromToken,
        spender: aggregator,
        amount: quote.amountWei.toString(),
        calldata: approveCalldata,
      });

      try {
        const approveTxHash = await redeemDelegations(
          sessionWallet,
          publicClient,
          DELEGATION_MANAGER_ADDRESS,
          [{
            permissionContext: [delegation],
            executions: [approveExecution],
            mode: ExecutionMode.SingleDefault,
          }],
        );

        debugLog("approve(amount) transaction sent", { hash: approveTxHash });
        await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
        debugLog("approve(amount) transaction confirmed");
      } catch (error: any) {
        debugLog("approve(amount) FAILED", {
          error: error.message,
          stack: error.stack,
          details: error.details,
        });
        throw new Error(`Failed to approve token: ${error.message}`);
      }
    }
  }

  // Step 8.5: Patch Monorail calldata with correct slippage (H1 pattern)
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

  // Step 9: Execute swap (second redeemDelegations call, or first if no approve needed)
  const swapExecution = createExecution({
    target: quote.monorailQuote.aggregator,
    value: quote.monorailQuote.transactionValue,
    callData: patchResult.patchedCalldata,
  });

  debugLog("Executing SWAP", {
    aggregator: quote.monorailQuote.aggregator,
    fromToken: quote.fromToken,
    toToken: quote.toToken,
    amountIn: quote.amountWei.toString(),
    value: quote.monorailQuote.transactionValue.toString(),
    calldata: quote.monorailQuote.transactionData.slice(0, 66) + "...", // First 32 bytes
  });

  let txHash: Hex;
  try {
    txHash = await redeemDelegations(
      sessionWallet,
      publicClient,
      DELEGATION_MANAGER_ADDRESS,
      [{
        permissionContext: [delegation],
        executions: [swapExecution],
        mode: ExecutionMode.SingleDefault,
      }],
    );

    debugLog("Swap transaction sent", { hash: txHash });
  } catch (error: any) {
    debugLog("SWAP redeemDelegations FAILED", {
      error: error.message,
      stack: error.stack,
      details: error.details,
      cause: error.cause,
    });
    throw new Error(`Swap execution failed: ${error.message}`);
  }

  // Step 10: Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });

  debugLog("Swap transaction confirmed", {
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status,
  });

  // Step 11: Calculate actual output (balance after - balance before)
  const balanceAfter = isNativeToken(quote.toToken, MON_ADDRESS)
    ? await publicClient.getBalance({ address: userAddress })
    : (await publicClient.readContract({
        address: quote.toToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [userAddress],
      }) as bigint);
  const actualOutput = balanceAfter - balanceBefore;

  // Step 12: Clean up quote from store
  deleteSwapQuote(quoteId);

  // Step 13: Return execution result
  return {
    txHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    status: receipt.status === "success" ? "success" : "reverted",
    actualOutput,
    actualOutputFormatted: formatUnits(actualOutput, quote.toTokenDecimals),
  };
}
