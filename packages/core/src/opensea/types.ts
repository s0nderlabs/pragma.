/**
 * OpenSea API Types for Monad
 *
 * Types for NFT data, listings, and Seaport orders from OpenSea API v2.
 * Supports viewing, buying, selling, and transferring NFTs.
 *
 * @see https://docs.opensea.io/reference/api-overview
 */

import type { Address, Hex } from "viem";

// ============================================================================
// Chain Configuration
// ============================================================================

/** OpenSea chain slug for Monad */
export const OPENSEA_CHAIN = "monad" as const;

/** OpenSea API base URL */
export const OPENSEA_API_BASE_URL = "https://api.opensea.io/api/v2";

// ============================================================================
// NFT Types
// ============================================================================

/** NFT trait/attribute */
export interface NFTTrait {
  trait_type: string;
  display_type?: string;
  max_value?: string;
  value: string | number;
}

/** NFT owner information (for ERC1155) */
export interface NFTOwner {
  address: Address;
  quantity: number;
}

/** NFT rarity information */
export interface NFTRarity {
  strategy_id?: string;
  strategy_version?: string;
  rank?: number;
}

/** NFT metadata from OpenSea */
export interface NFT {
  /** Token ID */
  identifier: string;
  /** Collection slug on OpenSea */
  collection: string;
  /** Contract address */
  contract: Address;
  /** Token standard */
  token_standard: "erc721" | "erc1155";
  /** NFT name */
  name?: string;
  /** NFT description */
  description?: string;
  /** Raw image URL */
  image_url?: string;
  /** Optimized display image URL */
  display_image_url?: string;
  /** Animation URL (video/3D) */
  display_animation_url?: string;
  /** Metadata JSON URL */
  metadata_url?: string;
  /** OpenSea URL */
  opensea_url: string;
  /** Last updated timestamp */
  updated_at: string;
  /** Is NFT disabled on OpenSea */
  is_disabled: boolean;
  /** Is NFT flagged as NSFW */
  is_nsfw: boolean;
  /** Animation URL (deprecated, use display_animation_url) */
  animation_url?: string;
  /** Is NFT flagged as suspicious */
  is_suspicious?: boolean;
  /** Creator address */
  creator?: Address;
  /** NFT traits/attributes */
  traits?: NFTTrait[];
  /** Owners (for ERC1155, includes quantity) */
  owners?: NFTOwner[];
  /** Rarity information */
  rarity?: NFTRarity;
}

/** Response for list NFTs endpoint */
export interface NFTListResponse {
  nfts: NFT[];
  next?: string;
}

/** Response for single NFT endpoint */
export interface NFTResponse {
  nft: NFT;
}

// ============================================================================
// Collection Types
// ============================================================================

/** Collection stats */
export interface CollectionStats {
  total_supply: number;
  total_listings: number;
  total_owners: number;
  average_price: number;
  num_reports?: number;
  market_cap?: number;
  floor_price?: number;
  floor_price_symbol?: string;
}

/** Collection data */
export interface Collection {
  collection: string;
  name: string;
  description?: string;
  image_url?: string;
  banner_image_url?: string;
  owner: Address;
  category?: string;
  is_disabled: boolean;
  is_nsfw: boolean;
  trait_offers_enabled: boolean;
  collection_offers_enabled: boolean;
  opensea_url: string;
  project_url?: string;
  wiki_url?: string;
  discord_url?: string;
  telegram_url?: string;
  twitter_username?: string;
  instagram_username?: string;
  contracts: Array<{
    address: Address;
    chain: string;
  }>;
}

// ============================================================================
// Listing/Order Types
// ============================================================================

/** Price information */
export interface Price {
  current: {
    currency: string;
    decimals: number;
    value: string;
  };
}

/** Seaport offer item */
export interface SeaportOfferItem {
  itemType: number;
  token: Address;
  identifierOrCriteria: string;
  startAmount: string;
  endAmount: string;
}

/** Seaport consideration item */
export interface SeaportConsiderationItem extends SeaportOfferItem {
  recipient: Address;
}

/** Seaport order parameters */
export interface SeaportOrderParameters {
  offerer: Address;
  zone?: Address;
  offer: SeaportOfferItem[];
  consideration: SeaportConsiderationItem[];
  orderType: number;
  startTime: string;
  endTime: string;
  zoneHash?: Hex;
  salt: string;
  conduitKey?: Hex;
  totalOriginalConsiderationItems: number;
  counter?: number;
}

/** Seaport protocol data */
export interface SeaportProtocolData {
  parameters: SeaportOrderParameters;
  signature: Hex;
}

/** Listing status */
export type ListingStatus = "active" | "inactive" | "fulfilled" | "expired" | "cancelled";

/** NFT listing from OpenSea */
export interface NFTListing {
  order_hash: Hex;
  chain: string;
  protocol_data: SeaportProtocolData;
  protocol_address: Address;
  remaining_quantity?: number;
  price: Price;
  type?: string;
  status: ListingStatus;
}

/** Response for best listing endpoint */
export interface BestListingResponse extends NFTListing {}

/** Response for collection listings endpoint */
export interface CollectionListingsResponse {
  listings: NFTListing[];
  next?: string;
}

// ============================================================================
// Fulfillment Types (for buying)
// ============================================================================

/** Transaction data for fulfilling an order */
export interface FulfillmentTransaction {
  function: string;
  chain: number;
  to: Address;
  value: string;
  input_data: {
    advancedOrder?: unknown;
    criteriaResolvers?: unknown[];
    fulfillerConduitKey?: Hex;
    recipient?: {
      value: Address;
      typeAsString?: string;
    };
  };
}

/** Fulfillment data response */
export interface FulfillmentResponse {
  protocol: string;
  fulfillment_data: {
    transaction: FulfillmentTransaction;
    orders: Array<{
      parameters: SeaportOrderParameters;
      signature: Hex;
    }>;
  };
}

/** Request body for fulfillment endpoint */
export interface FulfillmentRequest {
  listing: {
    hash: Hex;
    chain: string;
    protocol_address: Address;
  };
  fulfiller: {
    address: Address;
  };
  consideration?: {
    recipient?: Address;
  };
  units_to_fill?: number;
  include_optional_creator_fees?: boolean;
}

// ============================================================================
// Create Listing Types (for selling)
// ============================================================================

/** Seaport order for creating listings */
export interface CreateListingOrder {
  parameters: SeaportOrderParameters;
  signature: Hex;
  protocol_address: Address;
}

/** Response from create listing */
export interface CreateListingResponse {
  order: {
    order_hash: Hex;
    chain: string;
    protocol_data: SeaportProtocolData;
    protocol_address: Address;
  };
}

// ============================================================================
// API Client Options
// ============================================================================

/** Options for paginated requests */
export interface PaginationOptions {
  limit?: number;
  next?: string;
}

/** Options for getNFTsByAccount */
export interface GetNFTsByAccountOptions extends PaginationOptions {
  collection?: string;
}

/** Options for getCollectionListings */
export interface GetCollectionListingsOptions extends PaginationOptions {
  /** Filter by max price (in currency units, e.g., "1.5" for 1.5 MON) */
  maxPrice?: string;
}

// ============================================================================
// UI/Display Types (for frontend)
// ============================================================================

/** NFT with display-friendly data for UI */
export interface NFTDisplayData {
  /** Core NFT data */
  nft: NFT;
  /** Order hash for buy operations (omit full listing to avoid serialization issues) */
  orderHash?: string;
  /** Formatted price string (e.g., "1.5 MON") */
  formattedPrice?: string;
  /** Price in wei (string for JSON serialization) */
  priceWei?: string;
  /** Is this NFT owned by the current user */
  isOwned?: boolean;
  /** Can this NFT be purchased */
  canBuy?: boolean;
}

/** NFT gallery data for chat display */
export interface NFTGalleryData {
  /** Type marker for component detection */
  __type: "nft_gallery";
  /** Display title */
  title: string;
  /** NFTs to display */
  nfts: NFTDisplayData[];
  /** Total count (may be more than displayed) */
  totalCount?: number;
  /** Pagination cursor for next page */
  nextCursor?: string;
  /** Is this owned NFTs or browsable listings */
  mode: "owned" | "browse";
}

/** NFT buy quote data (stored for execution) */
export interface NFTBuyQuoteData {
  quoteId: string;
  /** NFT details */
  nft: NFT;
  /** Listing being purchased */
  listing: NFTListing;
  /** Fulfillment data from OpenSea */
  fulfillmentData?: FulfillmentResponse;
  /** Total price in wei */
  totalPriceWei: bigint;
  /** Total price formatted */
  totalPriceFormatted: string;
  /** Currency symbol */
  currency: string;
  /** Created timestamp */
  createdAt: number;
  /** Expiry timestamp */
  expiresAt: number;
  /** User address */
  userAddress: Address;
}
