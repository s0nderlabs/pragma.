/**
 * NFT Transfer Delegation Builder
 *
 * Creates ephemeral delegations for ERC721 and ERC1155 NFT transfers.
 * Unlike NFT purchases, transfers are FREE (no protocol fee).
 *
 * Security Model:
 * - Target: NFT contract address
 * - Function: safeTransferFrom (ERC721 or ERC1155)
 * - Single-use delegation (limitedCalls: 1)
 * - 5-minute expiry
 * - Nonce-based revocation support
 *
 * Calldata Enforcement:
 * - ERC721 safeTransferFrom(from, to, tokenId):
 *   - Enforces `from` (user address at offset 4)
 *   - Enforces `to` (recipient at offset 36)
 *   - Enforces `tokenId` (at offset 68)
 * - ERC1155 safeTransferFrom(from, to, id, amount, data):
 *   - Enforces `from` (user address at offset 4)
 *   - Enforces `to` (recipient at offset 36)
 *   - Enforces `id` (tokenId at offset 68)
 *   - Enforces `amount` (at offset 100)
 *
 * @example
 * ```typescript
 * // ERC721 transfer
 * const delegation = createNFTTransferDelegation({
 *   nftContract: contractAddress,
 *   from: userAddress,
 *   to: recipientAddress,
 *   tokenId: 42n,
 *   isERC721: true,
 *   transactionData: encodedCalldata,
 *   delegator: userSmartAccountAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: currentNonce,
 *   chainId: MONAD_CHAIN_ID,
 *   delegationManager: DELEGATION_MANAGER_ADDRESS,
 * });
 * ```
 */

import { Address, Hex, getAddress, toHex, keccak256, concat, numberToHex, pad } from "viem";
import {
  createDelegation,
  type Delegation,
  type Caveats,
} from "@metamask/delegation-toolkit";

import { buildDelegationTypedData } from "../../delegations/typedData.js";
import { getDTKEnvironment } from "../config.js";

// ============================================================================
// Constants
// ============================================================================

/** Ephemeral delegation expiry (5 minutes from now) */
const EPHEMERAL_EXPIRY_SECONDS = 5 * 60;

/** ERC721 safeTransferFrom(address,address,uint256) selector */
const ERC721_SAFE_TRANSFER_FROM_SELECTOR = "0x42842e0e" as Hex;

/** ERC1155 safeTransferFrom(address,address,uint256,uint256,bytes) selector */
const ERC1155_SAFE_TRANSFER_FROM_SELECTOR = "0xf242432a" as Hex;

// ============================================================================
// Types
// ============================================================================

export interface NFTTransferDelegationContext {
  /** NFT contract address */
  nftContract: Address;
  /** Sender address (user's smart account) */
  from: Address;
  /** Recipient address */
  to: Address;
  /** Token ID to transfer */
  tokenId: bigint;
  /** Amount to transfer (ERC1155 only, defaults to 1) */
  amount?: bigint;
  /** True for ERC721, false for ERC1155 */
  isERC721: boolean;
  /** Encoded transfer calldata */
  transactionData: Hex;
  /** HybridDelegator address (delegator) */
  delegator: Address;
  /** Session key address (delegate) */
  sessionKey: Address;
  /** Current nonce from DelegationManager */
  nonce: bigint;
  /** Chain ID (e.g., Monad mainnet) */
  chainId: number;
  /** DelegationManager contract address */
  delegationManager: Address;
}

export interface NFTTransferDelegationResult {
  /** DTK delegation object (unsigned) */
  delegation: Delegation;
  /** EIP-712 typed data for signing */
  typedData: ReturnType<typeof buildDelegationTypedData>;
  /** Expiry timestamp */
  expiresAt: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build caveats for NFT transfer delegation
 */
const buildNFTTransferCaveats = (
  nonce: bigint,
  expiresAt: number
): Caveats => {
  return [
    {
      type: "timestamp" as const,
      afterThreshold: 0,
      beforeThreshold: expiresAt,
    },
    {
      type: "nonce" as const,
      nonce: toHex(nonce),
    },
    {
      type: "limitedCalls" as const,
      limit: 1, // Single-use: one transfer
    },
  ] as unknown as Caveats;
};

/**
 * Build calldata enforcement for ERC721 safeTransferFrom
 * Enforces: from (offset 4), to (offset 36), tokenId (offset 68)
 */
const buildERC721TransferEnforcement = (
  from: Address,
  to: Address,
  tokenId: bigint
): Array<{ startIndex: number; value: Hex }> => {
  return [
    {
      startIndex: 4, // After selector (4 bytes)
      value: pad(from, { size: 32 }) as Hex, // from address (left-padded to 32 bytes)
    },
    {
      startIndex: 36, // After selector + from
      value: pad(to, { size: 32 }) as Hex, // to address (left-padded to 32 bytes)
    },
    {
      startIndex: 68, // After selector + from + to
      value: pad(toHex(tokenId), { size: 32 }) as Hex, // tokenId (left-padded to 32 bytes)
    },
  ];
};

/**
 * Build calldata enforcement for ERC1155 safeTransferFrom
 * Enforces: from (offset 4), to (offset 36), id (offset 68), amount (offset 100)
 */
const buildERC1155TransferEnforcement = (
  from: Address,
  to: Address,
  tokenId: bigint,
  amount: bigint
): Array<{ startIndex: number; value: Hex }> => {
  return [
    {
      startIndex: 4, // After selector (4 bytes)
      value: pad(from, { size: 32 }) as Hex, // from address
    },
    {
      startIndex: 36, // After selector + from
      value: pad(to, { size: 32 }) as Hex, // to address
    },
    {
      startIndex: 68, // After selector + from + to
      value: pad(toHex(tokenId), { size: 32 }) as Hex, // id (tokenId)
    },
    {
      startIndex: 100, // After selector + from + to + id
      value: pad(toHex(amount), { size: 32 }) as Hex, // amount
    },
  ];
};

// ============================================================================
// Main API
// ============================================================================

/**
 * Create ephemeral delegation for NFT transfer (ERC721 or ERC1155)
 *
 * Flow:
 * 1. User requests NFT transfer
 * 2. Contract type detected (ERC721 vs ERC1155)
 * 3. Ownership verified
 * 4. This function creates delegation with parameter enforcement
 * 5. Delegation signed by Web3Auth
 * 6. Session key executes via redeemDelegations
 *
 * @param context - Delegation context
 * @returns Unsigned delegation ready for Web3Auth signature
 */
export const createNFTTransferDelegation = (
  context: NFTTransferDelegationContext
): NFTTransferDelegationResult => {
  const {
    nftContract,
    from,
    to,
    tokenId,
    amount = 1n,
    isERC721,
    delegator,
    sessionKey,
    nonce,
    chainId,
    delegationManager,
  } = context;

  // Expiry: 5 minutes from now
  const expiresAt = Math.floor(Date.now() / 1000) + EPHEMERAL_EXPIRY_SECONDS;

  // Select appropriate selector and build enforcement
  const selector = isERC721
    ? ERC721_SAFE_TRANSFER_FROM_SELECTOR
    : ERC1155_SAFE_TRANSFER_FROM_SELECTOR;

  const allowedCalldata = isERC721
    ? buildERC721TransferEnforcement(from, to, tokenId)
    : buildERC1155TransferEnforcement(from, to, tokenId, amount);

  // Build scope with parameter enforcement
  const scope = {
    type: "functionCall" as const,
    targets: [getAddress(nftContract)],
    selectors: [selector],
    allowedCalldata, // Enforce from, to, tokenId (and amount for ERC1155)
  };

  // Build caveats (timestamp, nonce, limitedCalls: 1)
  const caveats = buildNFTTransferCaveats(nonce, expiresAt);

  // Get DTK environment (uses workaround chain ID - see config.ts)
  const environment = getDTKEnvironment();

  // Generate unique salt for this delegation
  const uniqueSalt = keccak256(
    concat([
      numberToHex(Date.now(), { size: 32 }),
      numberToHex(Math.floor(Math.random() * 1e18), { size: 32 }),
      toHex(nonce),
    ])
  );

  // Create unsigned delegation
  const delegation = createDelegation({
    environment,
    scope,
    from: delegator as Hex,
    to: sessionKey as Hex,
    caveats,
    salt: uniqueSalt,
  });

  // Build EIP-712 typed data for signing
  const typedData = buildDelegationTypedData(delegation, chainId, delegationManager);

  return {
    delegation,
    typedData,
    expiresAt,
  };
};
