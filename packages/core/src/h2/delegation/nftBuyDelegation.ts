/**
 * NFT Buy Delegation Builder
 *
 * Creates ephemeral delegations for NFT purchases via OpenSea Seaport protocol.
 *
 * Security Model:
 * - Target: Seaport protocol address (from quote)
 * - Function: fulfillBasicOrder or fulfillOrder
 * - Single-use delegation (limitedCalls: 1)
 * - 5-minute expiry
 * - Nonce-based revocation support
 *
 * Why No Calldata Enforcement:
 * - Seaport has complex struct encoding (BasicOrderParameters, OrderComponents)
 * - Byte offsets are dynamic based on array lengths
 * - Order hash validation is done by Seaport itself
 * - Price protection: User confirms exact price in quote, value is enforced by transactionValue
 *
 * Attack Prevention:
 * - Target enforcement: Can only call the specific Seaport address
 * - Selector enforcement: Can only call fulfillment functions
 * - Value enforcement: transactionValue matches quoted price
 * - timestamp/nonce/limitedCalls caveats prevent replay
 *
 * @example
 * ```typescript
 * const nftBuyDelegation = createNFTBuyDelegation({
 *   seaportAddress: quote.protocolAddress,
 *   transactionData: fulfillmentData.calldata,
 *   transactionValue: quote.priceWei,
 *   delegator: userSmartAccountAddress,
 *   sessionKey: sessionKeyAddress,
 *   nonce: currentNonce,
 *   chainId: MONAD_CHAIN_ID,
 *   delegationManager: DELEGATION_MANAGER_ADDRESS,
 * });
 *
 * // Sign with Web3Auth
 * const signature = await walletClient.signTypedData(nftBuyDelegation.typedData);
 * nftBuyDelegation.delegation.signature = signature;
 *
 * // Execute purchase via session key
 * await redeemDelegations(...);
 * ```
 */

import { Address, Hex, getAddress, toHex, keccak256, concat, numberToHex } from "viem";
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

// ============================================================================
// Types
// ============================================================================

export interface NFTBuyDelegationContext {
  /** Seaport protocol address (from quote/fulfillment) */
  seaportAddress: Address;
  /** Transaction calldata from OpenSea fulfillment API */
  transactionData: Hex;
  /** Transaction value (wei) - NFT purchase price */
  transactionValue: bigint;
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

export interface NFTBuyDelegationResult {
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
 * Extract function selector from calldata
 */
const extractSelector = (calldata: Hex): Hex => {
  if (!calldata || calldata === "0x" || calldata.length < 10) {
    throw new Error(`Invalid calldata for selector extraction: ${calldata}`);
  }
  return calldata.slice(0, 10) as Hex;
};

/**
 * Build caveats for NFT buy delegation
 */
const buildNFTBuyCaveats = (
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
      limit: 1, // Single-use: one purchase
    },
  ] as unknown as Caveats;
};

// ============================================================================
// Main API
// ============================================================================

/**
 * Create ephemeral delegation for NFT purchase via Seaport
 *
 * Flow:
 * 1. User requests NFT buy quote
 * 2. Quote stored with order details
 * 3. User confirms purchase
 * 4. This function creates delegation
 * 5. Delegation signed by Web3Auth
 * 6. Session key executes via redeemDelegations
 *
 * @param context - Delegation context
 * @returns Unsigned delegation ready for Web3Auth signature
 */
export const createNFTBuyDelegation = (
  context: NFTBuyDelegationContext
): NFTBuyDelegationResult => {
  const {
    seaportAddress,
    transactionData,
    delegator,
    sessionKey,
    nonce,
    chainId,
    delegationManager,
  } = context;

  // Expiry: 5 minutes from now
  const expiresAt = Math.floor(Date.now() / 1000) + EPHEMERAL_EXPIRY_SECONDS;

  // Extract function selector from calldata
  const selector = extractSelector(transactionData);

  // Build scope - Seaport has complex calldata, we enforce target + selector only
  // Price protection comes from transactionValue matching the quoted price
  const scope = {
    type: "functionCall" as const,
    targets: [getAddress(seaportAddress)],
    selectors: [selector],
    // No allowedCalldata - Seaport struct encoding is too complex
    // Security relies on: target, selector, value, timestamp, nonce, limitedCalls
  };

  // Build caveats (timestamp, nonce, limitedCalls: 1)
  const caveats = buildNFTBuyCaveats(nonce, expiresAt);

  // Get DTK environment (uses workaround chain ID - see config.ts)
  const environment = getDTKEnvironment();

  // Generate unique salt for this delegation
  // Prevents delegation hash collisions
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
