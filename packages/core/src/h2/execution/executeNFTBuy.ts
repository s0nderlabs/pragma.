/**
 * Execute NFT Purchase with Fee Enforcement
 *
 * This module implements NFT purchase execution using ephemeral delegations.
 *
 * Flow:
 * 1. Retrieve and validate quote
 * 2. Check session key balance (fund if needed)
 * 3. Verify user has sufficient MON for purchase
 * 4. Fetch current nonce from DelegationManager
 * 5. Create NFT buy delegation
 * 6. Add fee enforcement (1% protocol fee)
 * 7. Sign delegation with Web3Auth
 * 8. Create fee allowance delegation (if fee enabled)
 * 9. Execute via redeemDelegations from DTK
 * 10. Return ExecutionResult with metadata
 */

import {
  type Address,
  type Hex,
  type PublicClient,
  type Transport,
  createWalletClient,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createExecution,
  ExecutionMode,
  redeemDelegations,
} from "@metamask/delegation-toolkit";

import type { ExecutionResult, NFTBuyQuoteData } from "./types.js";
import { createNFTBuyDelegation } from "../delegation/nftBuyDelegation.js";
import { getNFTBuyQuote, deleteNFTBuyQuote } from "./quoteStore.js";
import { getMinBalanceForOperation } from "./sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";
import { emitProgress } from "../progress/emitter.js";
import {
  DELEGATION_MANAGER_ADDRESS,
  NONCE_ENFORCER_ADDRESS,
  NONCE_ENFORCER_ABI,
  MON_ADDRESS,
  DELEGATION_MANAGER_ABI,
  MONAD_CHAIN,
  PROTOCOL_FEES,
} from "../config.js";
import { addPragmaFeeEnforcer, requiresFee, calculateProtocolFee } from "../delegation/withFeeEnforcer.js";
import { buildDelegationTypedData } from "../../delegations/typedData.js";

// ============================================================================
// Execute NFT Buy Implementation
// ============================================================================

export interface ExecuteNFTBuyParams {
  /** Quote ID from getNFTBuyQuote */
  quoteId: string;
  /** OpenSea fulfillment data (calldata for Seaport) */
  fulfillmentData: {
    calldata: Hex;
    value: bigint;
  };
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
  /** Authenticated transport for wallet client */
  transport: Transport;
  /** Chain ID */
  chainId: number;
  /** Shared session wallet client (for transaction nonce management) */
  sessionWallet?: any;
  /** Tool signature for progress routing */
  signature?: string;
}

/**
 * Execute an NFT purchase transaction with ephemeral delegation and fee enforcement
 *
 * @param params - Execution parameters
 * @returns Execution result with transaction hash and receipt
 */
export async function executeNFTBuy(params: ExecuteNFTBuyParams): Promise<ExecutionResult> {
  const {
    quoteId,
    fulfillmentData,
    userAddress,
    sessionKeyAddress,
    sessionKeyPrivateKey,
    ownerAddress,
    publicClient,
    web3authBridge,
    transport,
    chainId,
    signature,
  } = params;

  // Step 1: Retrieve and validate quote
  const quote = getNFTBuyQuote(quoteId);

  const toolSignature = signature || `nftBuy:${quoteId}`;
  emitProgress(`Preparing to purchase ${quote.nftName}...`, "executeNFTBuy", toolSignature, `Buy ${quote.nftName}`);

  // Step 2: Check session key balance
  const sessionKeyBalance = await publicClient.getBalance({ address: sessionKeyAddress });
  const minBalance = getMinBalanceForOperation('swap'); // NFT buy has similar gas requirements

  if (sessionKeyBalance < minBalance) {
    throw createErrorFromCode("SESSION_KEY_LOW_BALANCE", {
      message: `Session key balance too low: ${formatEther(sessionKeyBalance)} MON (minimum: ${formatEther(minBalance)} MON). Fund session key first.`,
    });
  }

  // Step 3: Verify user has sufficient MON for purchase
  const userBalance = await publicClient.getBalance({ address: userAddress });
  const totalCost = quote.priceWei; // Fulfillment value should match quote price

  if (userBalance < totalCost) {
    throw createErrorFromCode("INSUFFICIENT_BALANCE", {
      message: `Insufficient MON balance for NFT purchase.\n` +
        `Required: ${formatEther(totalCost)} MON\n` +
        `Available: ${formatEther(userBalance)} MON`,
    });
  }

  emitProgress(`Building NFT purchase delegation...`, "executeNFTBuy", toolSignature);

  // Step 4: Fetch current nonce from NonceEnforcer
  const nonce = await publicClient.readContract({
    address: NONCE_ENFORCER_ADDRESS,
    abi: NONCE_ENFORCER_ABI,
    functionName: "currentNonce",
    args: [DELEGATION_MANAGER_ADDRESS, userAddress],
  }) as bigint;

  // Step 5: Create NFT buy delegation
  const nftBuyDelegationResult = createNFTBuyDelegation({
    seaportAddress: quote.protocolAddress,
    transactionData: fulfillmentData.calldata,
    transactionValue: fulfillmentData.value,
    delegator: userAddress,
    sessionKey: sessionKeyAddress,
    nonce,
    chainId,
    delegationManager: DELEGATION_MANAGER_ADDRESS,
  });

  // Step 6: Add fee enforcement (1% protocol fee on NFT purchases)
  let feeEnforcedBuy = null;
  let feeAllowanceDelegation = null;
  const protocolFeeAmount = calculateProtocolFee(quote.priceWei, PROTOCOL_FEES.nftBuy);

  if (requiresFee("nftBuy", PROTOCOL_FEES) && protocolFeeAmount > 0n) {
    feeEnforcedBuy = addPragmaFeeEnforcer(nftBuyDelegationResult, {
      feeAmount: protocolFeeAmount,
      swapAmount: quote.priceWei, // Original purchase amount (for percentage-based minimum)
      tokenAddress: MON_ADDRESS,
      isNative: true,
      sessionKey: sessionKeyAddress,
    });

    // Rebuild typedData to include fee enforcer caveat
    feeEnforcedBuy.mainDelegation.typedData = buildDelegationTypedData(
      feeEnforcedBuy.mainDelegation.delegation,
      chainId,
      DELEGATION_MANAGER_ADDRESS
    );
  }

  const delegationToSign = feeEnforcedBuy?.mainDelegation || nftBuyDelegationResult;

  // Step 7: Sign delegation with Web3Auth
  emitProgress(`Signing purchase authorization...`, "executeNFTBuy", toolSignature);

  const { signature: delegationSignature } = await web3authBridge.signTypedData({
    typedDataJson: JSON.stringify(delegationToSign.typedData),
    from: ownerAddress,
  });
  delegationToSign.delegation.signature = delegationSignature;

  // Step 8: Create fee allowance delegation if fee enforcer was added
  if (feeEnforcedBuy) {
    // Note: Type assertion needed because DTK's Delegation type has salt as Hex,
    // but the ABI parameter expects bigint. Viem handles the conversion.
    const delegationHash = await publicClient.readContract({
      address: DELEGATION_MANAGER_ADDRESS,
      abi: DELEGATION_MANAGER_ABI,
      functionName: "getDelegationHash",
      args: [delegationToSign.delegation as any],
    }) as Hex;

    feeAllowanceDelegation = feeEnforcedBuy.createFeeAllowanceDelegation(delegationHash);

    // Sign fee allowance delegation
    const feeAllowanceTypedData = buildDelegationTypedData(
      feeAllowanceDelegation,
      chainId,
      DELEGATION_MANAGER_ADDRESS
    );

    const { signature: feeSignature } = await web3authBridge.signTypedData({
      typedDataJson: JSON.stringify(feeAllowanceTypedData),
      from: ownerAddress,
    });
    feeAllowanceDelegation.signature = feeSignature;

    // Update main delegation's caveat args with fee allowance
    feeEnforcedBuy.updateMainDelegationArgs(feeAllowanceDelegation);
  }

  // Step 9: Build execution
  const execution = createExecution({
    target: quote.protocolAddress,
    value: fulfillmentData.value,
    callData: fulfillmentData.calldata,
  });

  // Get or create session wallet
  let sessionWallet = params.sessionWallet;
  if (!sessionWallet) {
    sessionWallet = createWalletClient({
      account: privateKeyToAccount(sessionKeyPrivateKey),
      chain: MONAD_CHAIN,
      transport,
    });
  }

  emitProgress(`Executing NFT purchase...`, "executeNFTBuy", toolSignature);

  // Step 10: Execute delegation
  const txHash = await redeemDelegations(
    sessionWallet,
    publicClient,
    DELEGATION_MANAGER_ADDRESS,
    [{
      permissionContext: [delegationToSign.delegation],
      executions: [execution],
      mode: ExecutionMode.SingleDefault,
    }],
  );

  emitProgress(`Waiting for blockchain confirmation...`, "executeNFTBuy", toolSignature);

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 60_000,
  });

  // Clean up quote
  deleteNFTBuyQuote(quoteId);

  // Return result
  return {
    txHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    status: receipt.status === "success" ? "success" : "reverted",
    delegationMetadata: {
      delegator: userAddress,
      sessionKey: sessionKeyAddress,
      nonce,
      delegationCount: feeAllowanceDelegation ? 2 : 1,
      delegationTypes: feeAllowanceDelegation ? ["nftBuy", "feeAllowance"] : ["nftBuy"],
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      feeEnforced: !!feeEnforcedBuy,
    },
  };
}
