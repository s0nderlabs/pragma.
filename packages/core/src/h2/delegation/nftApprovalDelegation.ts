/**
 * NFT Approval Delegation Builder
 *
 * Creates ephemeral delegations for ERC721/ERC1155 setApprovalForAll operations.
 * Used to approve NFT contracts for Seaport (OpenSea) trading.
 *
 * Security Model:
 * - Enforces BOTH operator and approved parameters (offsets 4 + 36)
 * - Single-use delegation (limitedCalls: 1)
 * - 5-minute expiry
 * - Nonce-based revocation support
 *
 * Attack Prevention:
 * 1. Operator substitution: Enforces exact Seaport conduit address
 * 2. Approval manipulation: Enforces whether approval is being granted or revoked
 *
 * @example
 * ```typescript
 * // Approve NFT collection for Seaport trading
 * const nftApprovalDelegation = createNFTApprovalDelegation({
 *   nftContract: boredCatYachtClubAddress,
 *   operator: SEAPORT_CONDUIT_ADDRESS,
 *   approved: true,
 *   delegator: userSmartAccountAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: currentNonce,
 *   chainId: MONAD_CHAIN_ID,
 *   delegationManager: DELEGATION_MANAGER_ADDRESS,
 * });
 *
 * // Sign with Web3Auth
 * const signature = await web3authBridge.signTypedData(nftApprovalDelegation.typedData);
 * nftApprovalDelegation.delegation.signature = signature;
 *
 * // Execute via session key
 * await redeemDelegations(...);
 * ```
 */

import { Address, Hex, getAddress, toHex } from "viem";
import {
  createDelegation,
  type Delegation,
  type Caveats,
} from "@metamask/delegation-toolkit";

import { buildDelegationTypedData } from "../../delegations/typedData.js";
import { ZERO_SALT } from "../../delegations/hybrid.js";
import { buildSetApprovalForAllEnforcement } from "./calldataEnforcement.js";
import { getDTKEnvironment } from "../config.js";

// ============================================================================
// Constants
// ============================================================================

/** Ephemeral delegation expiry (5 minutes from now) */
const EPHEMERAL_EXPIRY_SECONDS = 5 * 60;

/** ERC721/ERC1155 setApprovalForAll function selector */
const SETAPPROVALFORALL_SELECTOR = "0xa22cb465" as Hex;

// ============================================================================
// Types
// ============================================================================

export interface NFTApprovalDelegationContext {
  /** NFT contract address (ERC721 or ERC1155) */
  nftContract: Address;
  /** Operator address (typically Seaport conduit) */
  operator: Address;
  /** Whether to grant (true) or revoke (false) approval */
  approved: boolean;
  /** HybridDelegator address (delegator) */
  delegator: Address;
  /** Session key address (delegate) */
  sessionKey: Address;
  /** Current nonce from DelegationManager */
  nonce: bigint;
  /** Chain ID (e.g., 143 for Monad mainnet) */
  chainId: number;
  /** DelegationManager contract address */
  delegationManager: Address;
}

export interface NFTApprovalDelegationResult {
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
 * Build caveats for NFT approval delegation
 */
const buildNFTApprovalCaveats = (
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
      limit: 1, // Single-use: one setApprovalForAll call
    },
  ] as unknown as Caveats;
};

// ============================================================================
// Main API
// ============================================================================

/**
 * Create ephemeral delegation for NFT setApprovalForAll operation
 *
 * This delegation allows the session key to call setApprovalForAll on an NFT
 * contract, typically to approve the Seaport conduit for OpenSea trading.
 *
 * The delegation enforces:
 * - Target: Specific NFT contract only
 * - Selector: setApprovalForAll only (0xa22cb465)
 * - Parameters: Exact operator address and approved boolean
 *
 * @param context - Delegation context
 * @returns Unsigned delegation ready for Web3Auth signature
 */
export const createNFTApprovalDelegation = (
  context: NFTApprovalDelegationContext
): NFTApprovalDelegationResult => {
  const {
    nftContract,
    operator,
    approved,
    delegator,
    sessionKey,
    nonce,
    chainId,
    delegationManager,
  } = context;

  // Expiry: 5 minutes from now
  const expiresAt = Math.floor(Date.now() / 1000) + EPHEMERAL_EXPIRY_SECONDS;

  // Build enforcement for operator + approved
  const allowedCalldata = buildSetApprovalForAllEnforcement(operator, approved);

  // Build scope with parameter enforcement
  const scope = {
    type: "functionCall" as const,
    targets: [getAddress(nftContract)],
    selectors: [SETAPPROVALFORALL_SELECTOR],
    allowedCalldata, // Enforces operator (offset 4) + approved (offset 36)
  };

  // Build caveats (timestamp, nonce, limitedCalls: 1)
  const caveats = buildNFTApprovalCaveats(nonce, expiresAt);

  // Get DTK environment (uses workaround chain ID - see config.ts)
  const environment = getDTKEnvironment();

  // Create unsigned delegation
  const delegation = createDelegation({
    environment,
    scope,
    from: delegator as Hex,
    to: sessionKey as Hex,
    caveats,
    salt: ZERO_SALT,
  });

  // Build EIP-712 typed data for signing
  const typedData = buildDelegationTypedData(delegation, chainId, delegationManager);

  return {
    delegation,
    typedData,
    expiresAt,
  };
};
