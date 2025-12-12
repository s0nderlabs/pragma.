/**
 * Execute NFT Listing
 *
 * Creates an NFT listing on OpenSea via:
 * 1. Verify NFT ownership
 * 2. Check/execute Seaport conduit approval via delegation (if needed)
 * 3. Fetch counter from Seaport contract
 * 4. Build Seaport order
 * 5. Sign order with Web3Auth (EOA) for OpenSea API indexing
 * 6. Validate order on-chain via Seaport.validate() (delegation)
 * 7. Submit signed order to OpenSea API
 *
 * Note: Smart account (HybridDelegator) implements EIP-1271 isValidSignature().
 * When OpenSea validates the EOA signature, the smart account verifies that
 * the signer is the owner, making the signature valid for the offerer.
 * On-chain validation also ensures the order is fillable directly on Seaport.
 */

import type { Address, Hex, PublicClient, Transport } from "viem";
import {
  formatEther,
  getAddress,
  encodeFunctionData,
  createWalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createExecution,
  ExecutionMode,
  redeemDelegations,
} from "@metamask/delegation-toolkit";

import type { NFTListResult } from "./types.js";
import {
  buildSeaportListingOrder,
  buildSeaportOrderTypedData,
  orderComponentsToApiFormat,
  orderComponentsToValidateFormat,
  SEAPORT_ADDRESS,
  SEAPORT_CONDUIT_ADDRESS,
  SEAPORT_COUNTER_ABI,
  SEAPORT_VALIDATE_ABI,
} from "../../opensea/seaportOrder.js";
import { emitProgress } from "../progress/emitter.js";
import { createErrorFromCode } from "../../errors/index.js";
import { getMonUsdPrice, formatMonWithUsd } from "../tools/helpers/monPrice.js";
import { createSyncTransport } from "./syncTransport.js";
import { waitForReceiptSync } from "./syncReceipt.js";
import {
  MONAD_CHAIN_ID,
  MONAD_CHAIN,
  DELEGATION_MANAGER_ADDRESS,
  NONCE_ENFORCER_ADDRESS,
  NONCE_ENFORCER_ABI,
} from "../config.js";
import { createNFTApprovalDelegation } from "../delegation/nftApprovalDelegation.js";
import { createSeaportValidateDelegation } from "../delegation/seaportValidateDelegation.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * Default listing duration: 7 days in seconds
 */
const DEFAULT_DURATION_SECONDS = 7 * 24 * 60 * 60;

/**
 * Minimal ERC721 ABI for ownership and approval checks
 */
const ERC721_ABI = [
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "isApprovedForAll",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getApproved",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const ERC1155_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "isApprovedForAll",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * setApprovalForAll ABI (used for approval delegation execution)
 */
const SETAPPROVALFORALL_ABI = [
  {
    name: "setApprovalForAll",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

// ============================================================================
// Types
// ============================================================================

export interface ExecuteNFTListParams {
  /** NFT contract address */
  nftContract: Address;
  /** Token ID to list */
  tokenId: string;
  /** Listing price in wei */
  priceWei: bigint;
  /** Listing duration in seconds (default: 7 days) */
  durationSeconds?: number;
  /** Amount to list (for ERC1155, default: 1) */
  amount?: bigint;
  /** Smart account address (seller) */
  userAddress: Address;
  /** Owner address (for signing) */
  ownerAddress: Address;
  /** Public client for reading blockchain state */
  publicClient: PublicClient;
  /** Web3Auth bridge for EIP-712 signing */
  web3authBridge: {
    signTypedData: (params: {
      typedDataJson: string;
      from: Address;
    }) => Promise<{ signature: Hex; recoveredAddress: Address }>;
  };
  /** Fetch function for API calls */
  fetchFn?: typeof fetch;
  /** Origin URL for API calls */
  origin?: string;
  /** Chain ID (default: Monad mainnet 143) */
  chainId?: number;
  /** Tool signature for progress routing */
  signature?: string;

  // ============================================================================
  // Delegation execution params (optional - for auto-approval)
  // ============================================================================

  /** Session key address (required for auto-approval) */
  sessionKeyAddress?: Address;
  /** Session key private key (required for auto-approval) */
  sessionKeyPrivateKey?: Hex;
  /**
   * Shared session wallet client (for transaction nonce management)
   * If not provided, creates temporary wallet for the approval tx
   */
  sessionWallet?: any; // Type: viem WalletClient
  /** Authenticated transport for wallet client (required if sessionWallet not provided) */
  transport?: Transport;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Execute an NFT listing on OpenSea
 *
 * @param params - Listing parameters
 * @returns Listing result with order hash and URL
 */
export async function executeNFTList(params: ExecuteNFTListParams): Promise<NFTListResult> {
  const {
    nftContract,
    tokenId,
    priceWei,
    durationSeconds = DEFAULT_DURATION_SECONDS,
    amount = 1n,
    userAddress,
    ownerAddress,
    publicClient,
    web3authBridge,
    fetchFn = fetch,
    origin = "",
    chainId = MONAD_CHAIN_ID,
    signature,
    // Delegation params for auto-approval
    sessionKeyAddress,
    sessionKeyPrivateKey,
    sessionWallet,
    transport,
  } = params;

  const toolSignature = signature || `nftList:${nftContract}:${tokenId}`;

  // Format price with USD
  const priceInMon = parseFloat(formatEther(priceWei));
  const monUsdPrice = await getMonUsdPrice(fetchFn, origin);
  const priceFormatted = formatMonWithUsd(priceInMon, monUsdPrice);

  emitProgress(`Preparing to list NFT #${tokenId} for ${priceFormatted}...`, "executeNFTList", toolSignature, `List NFT #${tokenId}`);

  // Step 1: Detect token type and verify ownership
  let tokenType: "erc721" | "erc1155" = "erc721";
  let hasApproval = false;

  try {
    // Try ERC721 ownerOf first
    const owner = await publicClient.readContract({
      address: nftContract,
      abi: ERC721_ABI,
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    });

    if ((owner as Address).toLowerCase() !== userAddress.toLowerCase()) {
      throw createErrorFromCode("INVALID_NFT_OWNERSHIP", {
        message: `You don't own NFT #${tokenId}. Current owner: ${owner}`,
      });
    }

    tokenType = "erc721";

    // Check approval for Seaport conduit
    const isApprovedForAll = await publicClient.readContract({
      address: nftContract,
      abi: ERC721_ABI,
      functionName: "isApprovedForAll",
      args: [userAddress, SEAPORT_CONDUIT_ADDRESS],
    });

    if (isApprovedForAll) {
      hasApproval = true;
    } else {
      // Check single token approval
      try {
        const approvedAddress = await publicClient.readContract({
          address: nftContract,
          abi: ERC721_ABI,
          functionName: "getApproved",
          args: [BigInt(tokenId)],
        });
        hasApproval = (approvedAddress as Address).toLowerCase() === SEAPORT_CONDUIT_ADDRESS.toLowerCase();
      } catch {
        hasApproval = false;
      }
    }
  } catch (error) {
    // Not ERC721, try ERC1155
    if ((error as Error).message?.includes("don't own")) {
      throw error; // Re-throw ownership error
    }

    try {
      const balance = await publicClient.readContract({
        address: nftContract,
        abi: ERC1155_ABI,
        functionName: "balanceOf",
        args: [userAddress, BigInt(tokenId)],
      });

      if ((balance as bigint) === 0n) {
        throw createErrorFromCode("INVALID_NFT_OWNERSHIP", {
          message: `You don't own any of NFT #${tokenId}.`,
        });
      }

      tokenType = "erc1155";

      // Check approval for Seaport conduit
      const isApprovedForAll = await publicClient.readContract({
        address: nftContract,
        abi: ERC1155_ABI,
        functionName: "isApprovedForAll",
        args: [userAddress, SEAPORT_CONDUIT_ADDRESS],
      });

      hasApproval = isApprovedForAll as boolean;
    } catch (e) {
      if ((e as Error).message?.includes("don't own")) {
        throw e;
      }
      throw createErrorFromCode("INVALID_NFT_CONTRACT", {
        message: "Could not verify NFT ownership. Contract may not be a valid ERC721 or ERC1155.",
      });
    }
  }

  // Step 2: Execute approval via delegation if needed
  let approvalTxHash: Hex | undefined;

  if (!hasApproval) {
    // Check if we have the required params for delegation execution
    if (!sessionKeyAddress || !sessionKeyPrivateKey) {
      // Fall back to error with guidance if no session key
      throw createErrorFromCode("NFT_NOT_APPROVED", {
        message: `NFT #${tokenId} is not approved for OpenSea trading.\n\n` +
          `Please approve the collection first:\n` +
          `1. Go to OpenSea and connect your wallet\n` +
          `2. Click "Approve" when prompted\n` +
          `3. Then retry the listing\n\n` +
          `OpenSea URL: https://opensea.io/assets/monad/${nftContract}/${tokenId}/sell`,
      });
    }

    // Check transport requirement
    if (!sessionWallet && !transport) {
      throw createErrorFromCode("CONFIG_MISSING", {
        message: "Transport is required for RPC calls - cannot execute approval",
      });
    }

    emitProgress(`Approving collection for OpenSea trading...`, "executeNFTList", toolSignature);

    // Step 2a: Fetch nonce from NonceEnforcer
    const nonce = await publicClient.readContract({
      address: NONCE_ENFORCER_ADDRESS,
      abi: NONCE_ENFORCER_ABI,
      functionName: "currentNonce",
      args: [DELEGATION_MANAGER_ADDRESS, userAddress],
    }) as bigint;

    // Step 2b: Create NFT approval delegation
    const approvalDelegation = createNFTApprovalDelegation({
      nftContract,
      operator: SEAPORT_CONDUIT_ADDRESS,
      approved: true,
      delegator: userAddress,
      sessionKey: sessionKeyAddress,
      nonce,
      chainId,
      delegationManager: DELEGATION_MANAGER_ADDRESS,
    });

    // Step 2c: Sign the delegation with Web3Auth
    const { signature: delegationSignature } = await web3authBridge.signTypedData({
      typedDataJson: JSON.stringify(approvalDelegation.typedData),
      from: ownerAddress,
    });
    approvalDelegation.delegation.signature = delegationSignature;

    // Step 2d: Build execution calldata
    const approvalCalldata = encodeFunctionData({
      abi: SETAPPROVALFORALL_ABI,
      functionName: "setApprovalForAll",
      args: [SEAPORT_CONDUIT_ADDRESS, true],
    });

    const execution = createExecution({
      target: nftContract,
      value: 0n,
      callData: approvalCalldata,
    });

    // Step 2e: Get or create session wallet
    // Wrap transport with EIP-7966 sync support for faster confirmations
    let wallet = sessionWallet;
    if (!wallet) {
      wallet = createWalletClient({
        account: privateKeyToAccount(sessionKeyPrivateKey),
        chain: MONAD_CHAIN,
        transport: createSyncTransport(transport!),
      });
    }

    // Step 2f: Execute the delegation
    emitProgress(`Executing approval transaction...`, "executeNFTList", toolSignature);

    approvalTxHash = await redeemDelegations(
      wallet,
      publicClient,
      DELEGATION_MANAGER_ADDRESS,
      [{
        permissionContext: [approvalDelegation.delegation],
        executions: [execution],
        mode: ExecutionMode.SingleDefault,
      }],
    );

    // Wait for transaction confirmation (EIP-7966 optimized)
    await waitForReceiptSync(publicClient, approvalTxHash, { timeout: 60_000 });

    emitProgress(`Collection approved for trading!`, "executeNFTList", toolSignature);
  }

  emitProgress(`Fetching Seaport counter...`, "executeNFTList", toolSignature);

  // Step 4: Fetch counter from Seaport contract
  const counter = await publicClient.readContract({
    address: SEAPORT_ADDRESS,
    abi: SEAPORT_COUNTER_ABI,
    functionName: "getCounter",
    args: [userAddress],
  }) as bigint;

  emitProgress(`Building Seaport order...`, "executeNFTList", toolSignature);

  // Step 5: Build Seaport order
  const orderComponents = buildSeaportListingOrder({
    offerer: userAddress,
    nftContract,
    tokenId,
    tokenType,
    amount,
    priceWei,
    durationSeconds,
    counter,
  });

  // Step 4b: Sign the order with Web3Auth (EOA)
  // This signature is needed for OpenSea API indexing.
  // OpenSea's backend should call EIP-1271 isValidSignature() on the smart account,
  // which validates the EOA signature since the EOA is the owner.
  emitProgress(`Signing listing order...`, "executeNFTList", toolSignature);

  const orderTypedData = buildSeaportOrderTypedData(orderComponents, chainId);
  const { signature: orderSignature } = await web3authBridge.signTypedData({
    typedDataJson: JSON.stringify(orderTypedData),
    from: ownerAddress,
  });

  // Step 6: Validate order on-chain via delegation
  // This ensures the order is immediately fillable on Seaport without signature checks.
  // Combined with the EOA signature for OpenSea API indexing, this provides both:
  // - API indexing: OpenSea can verify via EIP-1271 on the smart account
  // - Direct fills: Anyone can fill the validated order on Seaport

  // Check if we have the required params for delegation execution
  if (!sessionKeyAddress || !sessionKeyPrivateKey) {
    throw createErrorFromCode("CONFIG_MISSING", {
      message: "Session key required for NFT listing validation. Please ensure session is initialized.",
    });
  }

  // Check transport requirement
  if (!sessionWallet && !transport) {
    throw createErrorFromCode("CONFIG_MISSING", {
      message: "Transport is required for RPC calls - cannot execute validation",
    });
  }

  emitProgress(`Validating listing on-chain...`, "executeNFTList", toolSignature);

  // Fetch nonce for validate delegation (use next nonce after approval if executed)
  const validateNonce = await publicClient.readContract({
    address: NONCE_ENFORCER_ADDRESS,
    abi: NONCE_ENFORCER_ABI,
    functionName: "currentNonce",
    args: [DELEGATION_MANAGER_ADDRESS, userAddress],
  }) as bigint;

  // Create validation delegation
  const validateDelegation = createSeaportValidateDelegation({
    delegator: userAddress,
    sessionKey: sessionKeyAddress,
    nonce: validateNonce,
    chainId,
    delegationManager: DELEGATION_MANAGER_ADDRESS,
  });

  // Sign delegation with Web3Auth
  const { signature: validateDelegationSig } = await web3authBridge.signTypedData({
    typedDataJson: JSON.stringify(validateDelegation.typedData),
    from: ownerAddress,
  });
  validateDelegation.delegation.signature = validateDelegationSig;

  // Build calldata for Seaport.validate([order])
  const orderForValidate = orderComponentsToValidateFormat(orderComponents);
  const validateCalldata = encodeFunctionData({
    abi: SEAPORT_VALIDATE_ABI,
    functionName: "validate",
    args: [[orderForValidate]],
  });

  // Create execution for validate
  const validateExecution = createExecution({
    target: SEAPORT_ADDRESS,
    value: 0n,
    callData: validateCalldata,
  });

  // Get or create session wallet for validation
  // Wrap transport with EIP-7966 sync support for faster confirmations
  let validateWallet = sessionWallet;
  if (!validateWallet) {
    validateWallet = createWalletClient({
      account: privateKeyToAccount(sessionKeyPrivateKey),
      chain: MONAD_CHAIN,
      transport: createSyncTransport(transport!),
    });
  }

  // Execute the delegation to call Seaport.validate()
  emitProgress(`Executing on-chain validation...`, "executeNFTList", toolSignature);

  const validateTxHash = await redeemDelegations(
    validateWallet,
    publicClient,
    DELEGATION_MANAGER_ADDRESS,
    [{
      permissionContext: [validateDelegation.delegation],
      executions: [validateExecution],
      mode: ExecutionMode.SingleDefault,
    }],
  );

  // Wait for validation transaction confirmation (EIP-7966 optimized)
  await waitForReceiptSync(publicClient, validateTxHash, { timeout: 60_000 });

  console.log(`[executeNFTList] Order validated on-chain! Tx: ${validateTxHash}`);
  emitProgress(`Order validated on-chain! Tx: ${validateTxHash}`, "executeNFTList", toolSignature);

  // Step 7: Try to submit to OpenSea API for indexing
  // With Delegate.xyz delegation, OpenSea should now accept the Web3Auth EOA signature.
  // The order is already valid on-chain via Seaport.validate(), so we return success
  // regardless of whether OpenSea indexes it.
  const apiParams = orderComponentsToApiFormat(orderComponents);

  let indexedOnOpenSea = false;
  let orderHash: Hex | undefined;

  try {
    const response = await fetchFn(`${origin}/api/opensea/create-listing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parameters: apiParams,
        signature: orderSignature, // EOA signature - may fail if OpenSea doesn't support EIP-1271
        protocolAddress: SEAPORT_ADDRESS,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.order_hash) {
        orderHash = result.order_hash as Hex;
        indexedOnOpenSea = true;
        emitProgress(`Listing indexed on OpenSea!`, "executeNFTList", toolSignature);
      }
    } else {
      // Log but don't throw - order is still valid on-chain
      const errorText = await response.text().catch(() => response.statusText);
      console.log(`[executeNFTList] OpenSea API returned ${response.status}: ${errorText}`);
      emitProgress(`OpenSea indexing failed (order still valid on-chain)`, "executeNFTList", toolSignature);
    }
  } catch (e) {
    // Log but don't throw - order is still valid on-chain
    console.log(`[executeNFTList] OpenSea API error:`, e);
    emitProgress(`OpenSea indexing failed (order still valid on-chain)`, "executeNFTList", toolSignature);
  }

  // Calculate expiry time
  const expiresAt = Number(orderComponents.endTime);

  // Build listing URL
  const listingUrl = `https://opensea.io/assets/monad/${getAddress(nftContract)}/${tokenId}`;

  return {
    success: true,
    orderHash,
    listingUrl,
    priceFormatted,
    expiresAt,
    approvalTxHash,
    validateTxHash,
    indexedOnOpenSea,
  };
}
