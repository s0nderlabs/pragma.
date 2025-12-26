/**
 * Execute NFT Transfer with Ephemeral Delegation
 *
 * This module implements NFT transfer execution using ephemeral delegations.
 * NFT transfers are FREE (no protocol fee).
 *
 * Flow:
 * 1. Check session key balance (fund if needed)
 * 2. Fetch current nonce from DelegationManager
 * 3. Build transfer calldata (ERC721 or ERC1155)
 * 4. Create NFT transfer delegation
 * 5. Sign delegation with Web3Auth
 * 6. Execute via redeemDelegations from DTK
 * 7. Return ExecutionResult with metadata
 */

import {
  type Address,
  type Hex,
  type PublicClient,
  type Transport,
  createWalletClient,
  formatEther,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createExecution,
  ExecutionMode,
  redeemDelegations,
} from "@metamask/delegation-toolkit";

import type { ExecutionResult } from "./types.js";
import { createNFTTransferDelegation } from "../delegation/nftTransferDelegation.js";
import { getMinBalanceForOperation } from "./sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";
import { emitProgress } from "../progress/emitter.js";
import { createSyncTransport } from "./syncTransport.js";
import { waitForReceiptSync } from "./syncReceipt.js";
import {
  DELEGATION_MANAGER_ADDRESS,
  NONCE_ENFORCER_ADDRESS,
  NONCE_ENFORCER_ABI,
  MONAD_CHAIN,
} from "../config.js";

// ============================================================================
// ABIs
// ============================================================================

const ERC721_ABI = [
  {
    name: "safeTransferFrom",
    type: "function",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const ERC1155_ABI = [
  {
    name: "safeTransferFrom",
    type: "function",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "id", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

// ============================================================================
// Execute NFT Transfer Implementation
// ============================================================================

export interface ExecuteNFTTransferParams {
  /** NFT contract address */
  contractAddress: Address;
  /** Token ID to transfer */
  tokenId: string;
  /** Recipient address */
  recipientAddress: Address;
  /** True for ERC721, false for ERC1155 */
  isERC721: boolean;
  /** Amount to transfer (ERC1155 only, defaults to 1) */
  amount?: number;
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
  /** NFT name for display */
  nftName?: string;
}

/**
 * Execute an NFT transfer transaction with ephemeral delegation
 * NFT transfers are FREE (no protocol fee)
 *
 * @param params - Execution parameters
 * @returns Execution result with transaction hash and receipt
 */
export async function executeNFTTransfer(params: ExecuteNFTTransferParams): Promise<ExecutionResult> {
  const {
    contractAddress,
    tokenId,
    recipientAddress,
    isERC721,
    amount = 1,
    userAddress,
    sessionKeyAddress,
    sessionKeyPrivateKey,
    ownerAddress,
    publicClient,
    web3authBridge,
    transport,
    chainId,
    signature,
    nftName,
  } = params;

  const displayName = nftName || `NFT #${tokenId}`;
  const recipientShort = `${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`;
  const toolSignature = signature || `nftTransfer:${contractAddress}:${tokenId}`;

  emitProgress(`Preparing to transfer ${displayName}...`, "transferNFT", toolSignature, `Transferring ${displayName}`);

  // Step 1: Check session key balance
  const sessionKeyBalance = await publicClient.getBalance({ address: sessionKeyAddress });
  const minBalance = getMinBalanceForOperation('transfer');

  if (sessionKeyBalance < minBalance) {
    throw createErrorFromCode("SESSION_KEY_LOW_BALANCE", {
      message: `Session key balance too low: ${formatEther(sessionKeyBalance)} MON (minimum: ${formatEther(minBalance)} MON). Fund session key first.`,
    });
  }

  emitProgress(`Building NFT transfer delegation...`, "transferNFT", toolSignature);

  // Step 2: Fetch current nonce from NonceEnforcer
  const nonce = await publicClient.readContract({
    address: NONCE_ENFORCER_ADDRESS,
    abi: NONCE_ENFORCER_ABI,
    functionName: "currentNonce",
    args: [DELEGATION_MANAGER_ADDRESS, userAddress],
  }) as bigint;

  // Step 3: Build transfer calldata
  let transferData: Hex;
  const tokenIdBigInt = BigInt(tokenId);

  if (isERC721) {
    transferData = encodeFunctionData({
      abi: ERC721_ABI,
      functionName: "safeTransferFrom",
      args: [userAddress, recipientAddress, tokenIdBigInt],
    });
  } else {
    transferData = encodeFunctionData({
      abi: ERC1155_ABI,
      functionName: "safeTransferFrom",
      args: [userAddress, recipientAddress, tokenIdBigInt, BigInt(amount), "0x" as Hex],
    });
  }

  // Step 4: Create NFT transfer delegation
  const delegationResult = createNFTTransferDelegation({
    nftContract: contractAddress,
    from: userAddress,
    to: recipientAddress,
    tokenId: tokenIdBigInt,
    amount: BigInt(amount),
    isERC721,
    transactionData: transferData,
    delegator: userAddress,
    sessionKey: sessionKeyAddress,
    nonce,
    chainId,
    delegationManager: DELEGATION_MANAGER_ADDRESS,
  });

  // Step 5: Sign delegation with Web3Auth
  emitProgress(`Signing transfer authorization...`, "transferNFT", toolSignature);

  const { signature: delegationSignature } = await web3authBridge.signTypedData({
    typedDataJson: JSON.stringify(delegationResult.typedData),
    from: ownerAddress,
  });
  delegationResult.delegation.signature = delegationSignature;

  // Step 6: Build execution
  const execution = createExecution({
    target: contractAddress,
    value: 0n, // NFT transfers don't require value
    callData: transferData,
  });

  // Get or create session wallet
  // Wrap transport with EIP-7966 sync support for faster confirmations
  let sessionWallet = params.sessionWallet;
  if (!sessionWallet) {
    sessionWallet = createWalletClient({
      account: privateKeyToAccount(sessionKeyPrivateKey),
      chain: MONAD_CHAIN,
      transport: createSyncTransport(transport),
    });
  }

  emitProgress(`Transferring ${displayName} to ${recipientShort}...`, "transferNFT", toolSignature);

  // Step 7: Execute delegation
  const txHash = await redeemDelegations(
    sessionWallet,
    publicClient,
    DELEGATION_MANAGER_ADDRESS,
    [{
      permissionContext: [delegationResult.delegation],
      executions: [execution],
      mode: ExecutionMode.SingleDefault,
    }],
  );

  emitProgress(`Waiting for blockchain confirmation...`, "transferNFT", toolSignature);

  // Wait for confirmation (EIP-7966 optimized)
  const receipt = await waitForReceiptSync(publicClient, txHash, { timeout: 60_000 });

  // Return result (NFT transfers are FREE - no fee)
  return {
    txHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    status: receipt.status === "success" ? "success" : "reverted",
    delegationMetadata: {
      delegator: userAddress,
      sessionKey: sessionKeyAddress,
      nonce,
      delegationCount: 1,
      delegationTypes: ["nftTransfer"],
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      feeEnforced: false, // NFT transfers are FREE
    },
  };
}
