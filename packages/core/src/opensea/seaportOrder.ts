/**
 * Seaport Order Builder
 *
 * Builds Seaport order parameters and EIP-712 typed data for creating NFT listings.
 * Used for signing orders with Web3Auth and submitting to OpenSea.
 *
 * @see https://docs.opensea.io/reference/seaport-overview
 */

import type { Address, Hex } from "viem";
import { getAddress, keccak256, toHex, pad, concat } from "viem";

// ============================================================================
// Contract Addresses
// ============================================================================

/**
 * Seaport 1.6 contract address (deterministic across all chains)
 */
export const SEAPORT_ADDRESS = "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC" as Address;

/**
 * OpenSea Seaport conduit address on Monad
 * Used for token approvals - allows Seaport to transfer tokens on behalf of users
 * Derived from conduit key via ConduitController.getConduit()
 */
export const SEAPORT_CONDUIT_ADDRESS = "0x963F00d3ff000064fFCbA824b800c0000000C300" as Address;

/**
 * OpenSea conduit key (used in Seaport orders)
 * This identifies the OpenSea conduit for Seaport on Monad
 */
export const SEAPORT_CONDUIT_KEY =
  "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e" as Hex;

/**
 * OpenSea fee recipient address
 * Receives OpenSea marketplace fee (1%)
 */
export const OPENSEA_FEE_RECIPIENT = "0x0000a26b00c1F0DF003000390027140000fAa719" as Address;

/**
 * OpenSea marketplace fee basis points (1% = 100 bps on Monad)
 */
export const OPENSEA_FEE_BPS = 100n;

// ============================================================================
// Enums
// ============================================================================

/**
 * Seaport item types
 * @see https://docs.opensea.io/reference/seaport-enums
 */
export enum ItemType {
  NATIVE = 0,
  ERC20 = 1,
  ERC721 = 2,
  ERC1155 = 3,
  ERC721_WITH_CRITERIA = 4,
  ERC1155_WITH_CRITERIA = 5,
}

/**
 * Seaport order types
 * @see https://docs.opensea.io/reference/seaport-enums
 */
export enum OrderType {
  FULL_OPEN = 0,
  PARTIAL_OPEN = 1,
  FULL_RESTRICTED = 2,
  PARTIAL_RESTRICTED = 3,
}

// ============================================================================
// Types
// ============================================================================

/** Seaport offer item (what seller is offering - the NFT) */
export interface SeaportOfferItemParams {
  itemType: ItemType;
  token: Address;
  identifierOrCriteria: bigint;
  startAmount: bigint;
  endAmount: bigint;
}

/** Seaport consideration item (what seller wants - payment + fees) */
export interface SeaportConsiderationItemParams {
  itemType: ItemType;
  token: Address;
  identifierOrCriteria: bigint;
  startAmount: bigint;
  endAmount: bigint;
  recipient: Address;
}

/** Full order components (for signing) */
export interface SeaportOrderComponents {
  offerer: Address;
  zone: Address;
  offer: SeaportOfferItemParams[];
  consideration: SeaportConsiderationItemParams[];
  orderType: OrderType;
  startTime: bigint;
  endTime: bigint;
  zoneHash: Hex;
  salt: bigint;
  conduitKey: Hex;
  counter: bigint;
}

/** EIP-712 typed data structure */
export interface EIP712TypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

/** Parameters for building a listing order */
export interface BuildListingOrderParams {
  offerer: Address;
  nftContract: Address;
  tokenId: string;
  tokenType: "erc721" | "erc1155";
  amount?: bigint; // For ERC1155, default 1
  priceWei: bigint;
  durationSeconds: number;
  counter: bigint;
}

// ============================================================================
// EIP-712 Types
// ============================================================================

/**
 * EIP-712 types for Seaport OrderComponents
 * Used for signing orders with eth_signTypedData_v4
 */
export const SEAPORT_ORDER_TYPES = {
  OrderComponents: [
    { name: "offerer", type: "address" },
    { name: "zone", type: "address" },
    { name: "offer", type: "OfferItem[]" },
    { name: "consideration", type: "ConsiderationItem[]" },
    { name: "orderType", type: "uint8" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "zoneHash", type: "bytes32" },
    { name: "salt", type: "uint256" },
    { name: "conduitKey", type: "bytes32" },
    { name: "counter", type: "uint256" },
  ],
  OfferItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
  ],
  ConsiderationItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
    { name: "recipient", type: "address" },
  ],
} as const;

// ============================================================================
// Seaport ABI (minimal - for counter lookup)
// ============================================================================

/**
 * Minimal Seaport ABI for reading counter
 */
export const SEAPORT_COUNTER_ABI = [
  {
    name: "getCounter",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "offerer", type: "address" }],
    outputs: [{ name: "counter", type: "uint256" }],
  },
] as const;

/**
 * Seaport validate function ABI
 *
 * Used for on-chain order validation. When the offerer calls validate(),
 * no signature is required. This enables smart account listings.
 *
 * @see https://docs.opensea.io/v2.0/reference/seaport-interface
 */
export const SEAPORT_VALIDATE_ABI = [
  {
    name: "validate",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "orders",
        type: "tuple[]",
        components: [
          {
            name: "parameters",
            type: "tuple",
            components: [
              { name: "offerer", type: "address" },
              { name: "zone", type: "address" },
              {
                name: "offer",
                type: "tuple[]",
                components: [
                  { name: "itemType", type: "uint8" },
                  { name: "token", type: "address" },
                  { name: "identifierOrCriteria", type: "uint256" },
                  { name: "startAmount", type: "uint256" },
                  { name: "endAmount", type: "uint256" },
                ],
              },
              {
                name: "consideration",
                type: "tuple[]",
                components: [
                  { name: "itemType", type: "uint8" },
                  { name: "token", type: "address" },
                  { name: "identifierOrCriteria", type: "uint256" },
                  { name: "startAmount", type: "uint256" },
                  { name: "endAmount", type: "uint256" },
                  { name: "recipient", type: "address" },
                ],
              },
              { name: "orderType", type: "uint8" },
              { name: "startTime", type: "uint256" },
              { name: "endTime", type: "uint256" },
              { name: "zoneHash", type: "bytes32" },
              { name: "salt", type: "uint256" },
              { name: "conduitKey", type: "bytes32" },
              { name: "totalOriginalConsiderationItems", type: "uint256" },
            ],
          },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [{ name: "validated", type: "bool" }],
  },
] as const;

/**
 * Seaport validate function selector: 0x88147732
 */
export const SEAPORT_VALIDATE_SELECTOR = "0x88147732" as Hex;

// ============================================================================
// Builder Functions
// ============================================================================

/**
 * Generate a random salt for order uniqueness
 */
export function generateOrderSalt(): bigint {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return BigInt(toHex(randomBytes));
}

/**
 * Calculate OpenSea fee amount (2.5%)
 *
 * @param priceWei - Full listing price in wei
 * @returns Fee amount in wei
 */
export function calculateOpenSeaFee(priceWei: bigint): bigint {
  return (priceWei * OPENSEA_FEE_BPS) / 10000n;
}

/**
 * Build Seaport order components for an NFT listing
 *
 * Creates an order where:
 * - Offer: The NFT (ERC721 or ERC1155)
 * - Consideration: Payment to seller + OpenSea fee
 *
 * @param params - Listing parameters
 * @returns Complete order components ready for signing
 */
export function buildSeaportListingOrder(
  params: BuildListingOrderParams
): SeaportOrderComponents {
  const {
    offerer,
    nftContract,
    tokenId,
    tokenType,
    amount = 1n,
    priceWei,
    durationSeconds,
    counter,
  } = params;

  const now = BigInt(Math.floor(Date.now() / 1000));
  const endTime = now + BigInt(durationSeconds);

  // Item type based on token standard
  const nftItemType = tokenType === "erc721" ? ItemType.ERC721 : ItemType.ERC1155;

  // Build offer (what seller is offering - the NFT)
  const offer: SeaportOfferItemParams[] = [
    {
      itemType: nftItemType,
      token: getAddress(nftContract),
      identifierOrCriteria: BigInt(tokenId),
      startAmount: amount,
      endAmount: amount,
    },
  ];

  // Calculate fee amounts
  const openSeaFee = calculateOpenSeaFee(priceWei);
  const sellerProceeds = priceWei - openSeaFee;

  // Build consideration (what seller wants - payment + fees)
  // Native token (MON) payments use itemType 0 and zero address
  const consideration: SeaportConsiderationItemParams[] = [
    // Seller receives proceeds (full price minus OpenSea fee)
    {
      itemType: ItemType.NATIVE,
      token: "0x0000000000000000000000000000000000000000" as Address,
      identifierOrCriteria: 0n,
      startAmount: sellerProceeds,
      endAmount: sellerProceeds,
      recipient: getAddress(offerer),
    },
    // OpenSea fee (2.5%)
    {
      itemType: ItemType.NATIVE,
      token: "0x0000000000000000000000000000000000000000" as Address,
      identifierOrCriteria: 0n,
      startAmount: openSeaFee,
      endAmount: openSeaFee,
      recipient: OPENSEA_FEE_RECIPIENT,
    },
  ];

  return {
    offerer: getAddress(offerer),
    zone: "0x0000000000000000000000000000000000000000" as Address,
    offer,
    consideration,
    orderType: OrderType.FULL_OPEN,
    startTime: now,
    endTime,
    zoneHash: "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
    salt: generateOrderSalt(),
    conduitKey: SEAPORT_CONDUIT_KEY,
    counter,
  };
}

/**
 * Build EIP-712 typed data for signing a Seaport order
 *
 * @param orderComponents - The order components to sign
 * @param chainId - Chain ID (143 for Monad mainnet)
 * @returns EIP-712 typed data ready for signTypedData
 */
export function buildSeaportOrderTypedData(
  orderComponents: SeaportOrderComponents,
  chainId: number
): EIP712TypedData {
  // Convert bigints to strings for JSON serialization
  const message = {
    offerer: orderComponents.offerer,
    zone: orderComponents.zone,
    offer: orderComponents.offer.map((item) => ({
      itemType: item.itemType,
      token: item.token,
      identifierOrCriteria: item.identifierOrCriteria.toString(),
      startAmount: item.startAmount.toString(),
      endAmount: item.endAmount.toString(),
    })),
    consideration: orderComponents.consideration.map((item) => ({
      itemType: item.itemType,
      token: item.token,
      identifierOrCriteria: item.identifierOrCriteria.toString(),
      startAmount: item.startAmount.toString(),
      endAmount: item.endAmount.toString(),
      recipient: item.recipient,
    })),
    orderType: orderComponents.orderType,
    startTime: orderComponents.startTime.toString(),
    endTime: orderComponents.endTime.toString(),
    zoneHash: orderComponents.zoneHash,
    salt: orderComponents.salt.toString(),
    conduitKey: orderComponents.conduitKey,
    counter: orderComponents.counter.toString(),
  };

  return {
    domain: {
      name: "Seaport",
      version: "1.6",
      chainId,
      verifyingContract: SEAPORT_ADDRESS,
    },
    types: SEAPORT_ORDER_TYPES as unknown as Record<
      string,
      Array<{ name: string; type: string }>
    >,
    primaryType: "OrderComponents",
    message,
  };
}

/**
 * Convert order components to OpenSea API format (SeaportOrderParameters)
 *
 * OpenSea API expects slightly different field names and format than EIP-712.
 * This converts the components for submission via createListing().
 *
 * @param orderComponents - Order components from buildSeaportListingOrder
 * @returns Parameters in OpenSea API format
 */
export function orderComponentsToApiFormat(orderComponents: SeaportOrderComponents): {
  offerer: Address;
  zone: Address;
  offer: Array<{
    itemType: number;
    token: Address;
    identifierOrCriteria: string;
    startAmount: string;
    endAmount: string;
  }>;
  consideration: Array<{
    itemType: number;
    token: Address;
    identifierOrCriteria: string;
    startAmount: string;
    endAmount: string;
    recipient: Address;
  }>;
  orderType: number;
  startTime: string;
  endTime: string;
  zoneHash: Hex;
  salt: string;
  conduitKey: Hex;
  totalOriginalConsiderationItems: number;
  counter: string;
} {
  return {
    offerer: orderComponents.offerer,
    zone: orderComponents.zone,
    offer: orderComponents.offer.map((item) => ({
      itemType: item.itemType,
      token: item.token,
      identifierOrCriteria: item.identifierOrCriteria.toString(),
      startAmount: item.startAmount.toString(),
      endAmount: item.endAmount.toString(),
    })),
    consideration: orderComponents.consideration.map((item) => ({
      itemType: item.itemType,
      token: item.token,
      identifierOrCriteria: item.identifierOrCriteria.toString(),
      startAmount: item.startAmount.toString(),
      endAmount: item.endAmount.toString(),
      recipient: item.recipient,
    })),
    orderType: orderComponents.orderType,
    startTime: orderComponents.startTime.toString(),
    endTime: orderComponents.endTime.toString(),
    zoneHash: orderComponents.zoneHash,
    salt: orderComponents.salt.toString(),
    conduitKey: orderComponents.conduitKey,
    totalOriginalConsiderationItems: orderComponents.consideration.length,
    counter: orderComponents.counter.toString(),
  };
}

/**
 * Convert order components to the format expected by Seaport.validate()
 *
 * The validate function expects Order[] where each Order is:
 * { parameters: OrderParameters, signature: bytes }
 *
 * When the offerer calls validate(), signature can be empty ("0x").
 *
 * @param orderComponents - Order components from buildSeaportListingOrder
 * @returns Order struct array for validate() call
 */
export function orderComponentsToValidateFormat(orderComponents: SeaportOrderComponents): {
  parameters: {
    offerer: Address;
    zone: Address;
    offer: Array<{
      itemType: number;
      token: Address;
      identifierOrCriteria: bigint;
      startAmount: bigint;
      endAmount: bigint;
    }>;
    consideration: Array<{
      itemType: number;
      token: Address;
      identifierOrCriteria: bigint;
      startAmount: bigint;
      endAmount: bigint;
      recipient: Address;
    }>;
    orderType: number;
    startTime: bigint;
    endTime: bigint;
    zoneHash: Hex;
    salt: bigint;
    conduitKey: Hex;
    totalOriginalConsiderationItems: bigint;
  };
  signature: Hex;
} {
  return {
    parameters: {
      offerer: orderComponents.offerer,
      zone: orderComponents.zone,
      offer: orderComponents.offer.map((item) => ({
        itemType: item.itemType,
        token: item.token,
        identifierOrCriteria: item.identifierOrCriteria,
        startAmount: item.startAmount,
        endAmount: item.endAmount,
      })),
      consideration: orderComponents.consideration.map((item) => ({
        itemType: item.itemType,
        token: item.token,
        identifierOrCriteria: item.identifierOrCriteria,
        startAmount: item.startAmount,
        endAmount: item.endAmount,
        recipient: item.recipient,
      })),
      orderType: orderComponents.orderType,
      startTime: orderComponents.startTime,
      endTime: orderComponents.endTime,
      zoneHash: orderComponents.zoneHash,
      salt: orderComponents.salt,
      conduitKey: orderComponents.conduitKey,
      totalOriginalConsiderationItems: BigInt(orderComponents.consideration.length),
    },
    signature: "0x" as Hex, // Empty signature - offerer is calling validate
  };
}
