/**
 * Execute Transfer with Ephemeral Delegation
 *
 * This module implements token transfer execution using ephemeral delegations.
 *
 * Flow:
 * 1. Retrieve and validate quote
 * 2. Check session key balance (fund if needed)
 * 3. Fetch current nonce from DelegationManager
 * 4. Create ephemeral delegation
 * 5. Sign delegation with Web3Auth
 * 6. Build ERC20 transfer execution
 * 7. Sign transaction with session key
 * 8. Submit to bundler/RPC
 * 9. Wait for confirmation
 * 10. Return receipt
 */

import {
  type Address,
  type Hex,
  type PublicClient,
  createWalletClient,
  http,
  formatUnits,
  formatEther,
  encodeFunctionData,
  erc20Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createExecution,
  ExecutionMode,
  redeemDelegations,
} from "@metamask/delegation-toolkit";

import type { ExecutionResult, TransferQuoteData } from "./types.js";
import { createEphemeralDelegation } from "../delegation/ephemeral.js";
import { getTransferQuote, deleteTransferQuote } from "./quoteStore.js";
import { checkSessionKeyBalance, fundSessionKey, SESSION_KEY_FUNDING_AMOUNT } from "./sessionKeyManager.js";
import {
  MONAD_RPC_URL,
  DELEGATION_MANAGER_ADDRESS,
  NONCE_ENFORCER_ADDRESS,
  NONCE_ENFORCER_ABI,
} from "../config.js";

// ============================================================================
// Execute Transfer Implementation
// ============================================================================

export interface ExecuteTransferParams {
  /** Quote ID from getTransferQuote */
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
}

/**
 * Execute a token transfer transaction with ephemeral delegation
 *
 * @param params - Execution parameters
 * @returns Execution result with transaction hash and receipt
 *
 * @throws {QuoteNotFoundError} If quote not found
 * @throws {QuoteExpiredError} If quote expired
 * @throws {SessionKeyFundingError} If session key funding fails
 * @throws {Error} If execution fails
 */
export async function executeTransfer(params: ExecuteTransferParams): Promise<ExecutionResult> {
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
  const quote = getTransferQuote(quoteId);

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
      web3authBridge
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

  // Step 4: Build ERC20 transfer calldata
  const transferCalldata = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [quote.recipient, quote.amountWei],
  });

  // Step 5: Create ephemeral delegation for transfer
  // For transfers, we create a delegation that allows calling the token contract's transfer function
  const { delegation, typedData } = createEphemeralDelegation({
    quote: {
      quoteId: quoteId, // Use the transfer quote ID
      aggregator: quote.token, // Target is the token contract
      transactionData: transferCalldata,
      transactionValue: 0n, // ERC20 transfers have no value
      rawInput: quote.amountWei,
      rawOutput: quote.amountWei,
      rawMinOutput: quote.amountWei,
    },
    delegator: userAddress,
    sessionKey: sessionKeyAddress,
    nonce,
    chainId,
    delegationManager: DELEGATION_MANAGER_ADDRESS,
    fromToken: quote.token,
    toToken: quote.token, // Same token for transfers
    nativeTokenAddress: quote.token, // Not used for simple transfers
    currentAllowance: 0n, // Transfers don't require approval
    requiredAmount: 0n,
  });

  // Step 6: Sign delegation with Web3Auth
  const { signature } = await web3authBridge.signTypedData({
    typedDataJson: JSON.stringify(typedData),
    from: ownerAddress,
  });

  // Attach signature to delegation
  delegation.signature = signature;

  // Step 7: Build transaction execution
  const execution = createExecution({
    target: quote.token,
    value: 0n,
    callData: transferCalldata,
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
  deleteTransferQuote(quoteId);

  // Step 12: Return execution result
  return {
    txHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    status: receipt.status === "success" ? "success" : "reverted",
    actualOutput: quote.amountWei, // For transfers, output = input
    actualOutputFormatted: quote.amount,
  };
}
