/**
 * Execute Unwrap with Ephemeral Delegation
 *
 * This module implements WMON → MON unwrap execution using ephemeral delegations.
 *
 * Flow:
 * 1. Retrieve and validate quote
 * 2. Check session key balance (fund if needed)
 * 3. Fetch current nonce from DelegationManager
 * 4. Create ephemeral delegation
 * 5. Sign delegation with Web3Auth
 * 6. Build withdraw() execution
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
  http,
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

import type { ExecutionResult, UnwrapQuoteData } from "./types.js";
import { createEphemeralDelegation } from "../delegation/ephemeral.js";
import { getUnwrapQuote, deleteUnwrapQuote } from "./quoteStore.js";
import { checkSessionKeyBalance, fundSessionKey, SESSION_KEY_FUNDING_AMOUNT } from "./sessionKeyManager.js";
import {
  MONAD_RPC_URL,
  DELEGATION_MANAGER_ADDRESS,
  NONCE_ENFORCER_ADDRESS,
  NONCE_ENFORCER_ABI,
} from "../config.js";

const WRAPPED_NATIVE_ABI = [
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: [],
  },
] as const;

// ============================================================================
// Execute Unwrap Implementation
// ============================================================================

export interface ExecuteUnwrapParams {
  /** Quote ID from getUnwrapQuote */
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
 * Execute an unwrap transaction with ephemeral delegation
 */
export async function executeUnwrap(params: ExecuteUnwrapParams): Promise<ExecutionResult> {
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
  const quote = getUnwrapQuote(quoteId);

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
        rpcUrl: MONAD_RPC_URL,
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

  // Step 4: Build withdraw calldata
  const withdrawCalldata = encodeFunctionData({
    abi: WRAPPED_NATIVE_ABI,
    functionName: "withdraw",
    args: [quote.amountWei],
  });

  // Step 5: Create ephemeral delegation for unwrap
  // IMPORTANT: Skip parameter enforcement for unwrap operations
  // withdraw(uint256) has only 1 parameter (amount), no destination at offset 132
  const { delegation, typedData } = createEphemeralDelegation({
    quote: {
      quoteId: quoteId,
      aggregator: quote.wmonAddress,
      transactionData: withdrawCalldata,
      transactionValue: 0n,
      rawInput: quote.amountWei,
      rawOutput: quote.amountWei,
      rawMinOutput: quote.amountWei,
    },
    delegator: userAddress,
    sessionKey: sessionKeyAddress,
    nonce,
    chainId,
    delegationManager: DELEGATION_MANAGER_ADDRESS,
    fromToken: quote.wmonAddress,
    toToken: quote.wmonAddress, // Not used for unwraps
    nativeTokenAddress: quote.wmonAddress,
    currentAllowance: 0n, // Unwraps don't require approval
    requiredAmount: 0n,
    skipParameterEnforcement: true, // withdraw() has no destination parameter
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
    value: 0n,
    callData: withdrawCalldata,
  });

  // Step 8: Create session wallet client
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
  deleteUnwrapQuote(quoteId);

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
      delegationCount: 1, // Unwrap uses 1 delegation
      delegationTypes: ['unwrap'],
      expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes in seconds
      feeEnforced: false, // Unwraps are FREE (gas only)
    },
  };
}
