/**
 * Execute Wrap with Ephemeral Delegation
 *
 * This module implements MON → WMON wrap execution using ephemeral delegations.
 *
 * Flow:
 * 1. Retrieve and validate quote
 * 2. Check session key balance (fund if needed)
 * 3. Fetch current nonce from DelegationManager
 * 4. Create ephemeral delegation
 * 5. Sign delegation with Web3Auth
 * 6. Build deposit() execution
 * 7. Sign transaction with session key
 * 8. Submit to bundler/RPC
 * 9. Wait for confirmation
 * 10. Return receipt
 */

import {
  type Address,
  type Hex,
  type PublicClient,
  type Transport,
  createWalletClient,
  formatUnits,
  formatEther,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createExecution,
  ExecutionMode,
  redeemDelegations,
} from "@metamask/delegation-toolkit";

import type { ExecutionResult, WrapQuoteData } from "./types.js";
import { createEphemeralDelegation } from "../delegation/ephemeral.js";
import { getWrapQuote, deleteWrapQuote } from "./quoteStore.js";
import { checkSessionKeyBalance, fundSessionKey, SESSION_KEY_FUNDING_AMOUNT } from "./sessionKeyManager.js";
import {
  DELEGATION_MANAGER_ADDRESS,
  NONCE_ENFORCER_ADDRESS,
  NONCE_ENFORCER_ABI,
  MONAD_CHAIN,
} from "../config.js";

const WRAPPED_NATIVE_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

// ============================================================================
// Execute Wrap Implementation
// ============================================================================

export interface ExecuteWrapParams {
  /** Quote ID from getWrapQuote */
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
  web3authBridge: any;
  /** Authenticated transport for wallet client (e.g., /api/rpc proxy) */
  transport: Transport;
  /** Chain ID */
  chainId: number;
  /** Smart account instance from DTK (for UserOp-based session key funding) */
  smartAccount?: any;
  /** Bundler client (for UserOp-based session key funding) */
  bundlerClient?: any;
}

/**
 * Execute a wrap transaction with ephemeral delegation
 */
export async function executeWrap(params: ExecuteWrapParams): Promise<ExecutionResult> {
  const {
    quoteId,
    userAddress,
    sessionKeyAddress,
    sessionKeyPrivateKey,
    ownerAddress,
    publicClient,
    web3authBridge,
    transport,
    chainId,
    smartAccount,
    bundlerClient,
  } = params;

  // Step 1: Retrieve and validate quote
  const quote = getWrapQuote(quoteId);

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

    const fundingResult = await fundSessionKey(
      {
        smartAccountAddress: userAddress,
        sessionKeyAddress,
        sessionKeyPrivateKey,
        ownerAddress,
        chainId,
        delegationManager: DELEGATION_MANAGER_ADDRESS,
        smartAccount,
        bundlerClient,
      },
      publicClient,
      web3authBridge,
      transport // Authenticated transport from params
    );

    console.log(`✓ Session key funded: ${formatEther(fundingResult.newBalance)} MON`);
    console.log(`   Tx: ${fundingResult.txHash}\n`);
  }

  // Step 3: Fetch current nonce from NonceEnforcer
  const nonce = await publicClient.readContract({
    address: NONCE_ENFORCER_ADDRESS,
    abi: NONCE_ENFORCER_ABI,
    functionName: "currentNonce",
    args: [DELEGATION_MANAGER_ADDRESS, userAddress],
  }) as bigint;

  // Step 4: Build deposit calldata
  const depositCalldata = encodeFunctionData({
    abi: WRAPPED_NATIVE_ABI,
    functionName: "deposit",
    args: [],
  });

  // Step 5: Create ephemeral delegation for wrap
  // IMPORTANT: Skip parameter enforcement for wrap operations
  // deposit() has NO parameters, so destination enforcement at offset 132 would fail
  const { delegation, typedData } = createEphemeralDelegation({
    quote: {
      quoteId: quoteId,
      aggregator: quote.wmonAddress,
      transactionData: depositCalldata,
      transactionValue: quote.amountWei,
      rawInput: quote.amountWei,
      rawOutput: quote.amountWei,
      rawMinOutput: quote.amountWei,
    },
    delegator: userAddress,
    sessionKey: sessionKeyAddress,
    nonce,
    chainId,
    delegationManager: DELEGATION_MANAGER_ADDRESS,
    fromToken: quote.wmonAddress, // Not used for wraps
    toToken: quote.wmonAddress,
    nativeTokenAddress: quote.wmonAddress,
    currentAllowance: 0n, // Wraps don't require approval
    requiredAmount: 0n,
    skipParameterEnforcement: true, // deposit() has no destination parameter
  });

  // Step 6: Sign delegation with Web3Auth
  const { signature } = await web3authBridge.signTypedData({
    typedDataJson: JSON.stringify(typedData),
    from: ownerAddress,
  });
  delegation.signature = signature;

  // Step 7: Build transaction execution
  const execution = createExecution({
    target: quote.wmonAddress,
    value: quote.amountWei,
    callData: depositCalldata,
  });

  // Step 8: Create session wallet client using transport from params
  const sessionWallet = createWalletClient({
    account: privateKeyToAccount(sessionKeyPrivateKey),
    chain: MONAD_CHAIN,
    transport,
  });

  // Step 9: Submit transaction via delegation redemption
  const txHash = await redeemDelegations(
    sessionWallet,
    publicClient,
    DELEGATION_MANAGER_ADDRESS,
    [{
      permissionContext: [delegation],
      executions: [execution],
      mode: ExecutionMode.SingleDefault,
    }],
  );

  // Step 10: Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });

  // Step 11: Clean up quote from store
  deleteWrapQuote(quoteId);

  // Step 12: Return execution result
  return {
    txHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    status: receipt.status === "success" ? "success" : "reverted",
    actualOutput: quote.amountWei,
    actualOutputFormatted: quote.amount,
    delegationMetadata: {
      delegator: userAddress,
      sessionKey: sessionKeyAddress,
      nonce,
      delegationCount: 1, // Wrap uses 1 delegation
      delegationTypes: ['wrap'],
      expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes in seconds
      feeEnforced: false, // Wraps are FREE (gas only)
    },
  };
}
