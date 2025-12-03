/**
 * OpenSea API Client for Monad
 *
 * Provides methods to interact with OpenSea API v2 for NFT operations:
 * - List owned NFTs
 * - Get NFT details
 * - Browse collection listings
 * - Get buy fulfillment data
 * - Create listings (sell)
 *
 * @see https://docs.opensea.io/reference/api-overview
 */

import type { Address, Hex } from "viem";
import { getAddress, parseUnits, formatUnits } from "viem";

import {
  OPENSEA_API_BASE_URL,
  OPENSEA_CHAIN,
  type NFT,
  type NFTListResponse,
  type NFTResponse,
  type NFTListing,
  type BestListingResponse,
  type CollectionListingsResponse,
  type FulfillmentRequest,
  type FulfillmentResponse,
  type CreateListingOrder,
  type CreateListingResponse,
  type GetNFTsByAccountOptions,
  type GetCollectionListingsOptions,
  type Collection,
  type CollectionStats,
} from "./types.js";

// ============================================================================
// Configuration
// ============================================================================

/** Rate limit: requests per second */
const RATE_LIMIT_RPS = 2;

/** Retry configuration */
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/** Request timeout in ms */
const REQUEST_TIMEOUT_MS = 30000;

// ============================================================================
// Error Types
// ============================================================================

export class OpenSeaAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public endpoint: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "OpenSeaAPIError";
  }
}

export class OpenSeaRateLimitError extends OpenSeaAPIError {
  constructor(endpoint: string, retryAfter?: number) {
    super(
      `Rate limit exceeded. Retry after ${retryAfter ?? "unknown"} seconds.`,
      429,
      endpoint
    );
    this.name = "OpenSeaRateLimitError";
  }
}

// ============================================================================
// Client Implementation
// ============================================================================

export interface OpenSeaClientConfig {
  /** OpenSea API key */
  apiKey: string;
  /** Custom fetch function (for proxy routing in browser) */
  fetch?: typeof fetch;
  /** Base URL override (for testing) */
  baseUrl?: string;
  /** Chain slug override (default: "monad") */
  chain?: string;
}

/**
 * OpenSea API Client
 *
 * Handles rate limiting, retries, and error handling for OpenSea API requests.
 */
export class OpenSeaClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly chain: string;
  private readonly fetchFn: typeof fetch;

  // Rate limiting state
  private lastRequestTime = 0;
  private requestQueue: Array<() => void> = [];
  private isProcessingQueue = false;

  constructor(config: OpenSeaClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? OPENSEA_API_BASE_URL;
    this.chain = config.chain ?? OPENSEA_CHAIN;
    this.fetchFn = config.fetch ?? fetch;
  }

  // ============================================================================
  // Rate Limiting
  // ============================================================================

  /**
   * Wait for rate limit window
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const minInterval = 1000 / RATE_LIMIT_RPS;
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < minInterval) {
      await new Promise((resolve) =>
        setTimeout(resolve, minInterval - timeSinceLastRequest)
      );
    }

    this.lastRequestTime = Date.now();
  }

  // ============================================================================
  // HTTP Request Helper
  // ============================================================================

  /**
   * Make an authenticated request to OpenSea API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    await this.waitForRateLimit();

    const url = `${this.baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.fetchFn(url, {
          ...options,
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-API-KEY": this.apiKey,
            ...options.headers,
          },
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          throw new OpenSeaRateLimitError(
            endpoint,
            retryAfter ? parseInt(retryAfter, 10) : undefined
          );
        }

        if (!response.ok) {
          let errorDetails: unknown;
          try {
            errorDetails = await response.json();
          } catch {
            errorDetails = await response.text();
          }

          throw new OpenSeaAPIError(
            `OpenSea API error: ${response.statusText}`,
            response.status,
            endpoint,
            errorDetails
          );
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx except 429)
        if (
          error instanceof OpenSeaAPIError &&
          error.statusCode >= 400 &&
          error.statusCode < 500 &&
          error.statusCode !== 429
        ) {
          throw error;
        }

        // Retry with exponential backoff
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt))
          );
        }
      }
    }

    clearTimeout(timeoutId);
    throw lastError ?? new Error(`Request failed after ${MAX_RETRIES} retries`);
  }

  // ============================================================================
  // NFT Endpoints
  // ============================================================================

  /**
   * Get NFTs owned by an account
   *
   * @param address - Wallet address
   * @param options - Pagination and filter options
   * @returns List of owned NFTs with pagination cursor
   *
   * @example
   * ```ts
   * const { nfts, next } = await client.getNFTsByAccount(
   *   "0x123...",
   *   { limit: 20 }
   * );
   * ```
   */
  async getNFTsByAccount(
    address: Address,
    options: GetNFTsByAccountOptions = {}
  ): Promise<NFTListResponse> {
    const params = new URLSearchParams();

    if (options.collection) {
      params.set("collection", options.collection);
    }
    if (options.limit) {
      params.set("limit", Math.min(options.limit, 200).toString());
    }
    if (options.next) {
      params.set("next", options.next);
    }

    const queryString = params.toString();
    const endpoint = `/chain/${this.chain}/account/${getAddress(address)}/nfts${
      queryString ? `?${queryString}` : ""
    }`;

    return this.request<NFTListResponse>(endpoint);
  }

  /**
   * Get a single NFT by contract address and token ID
   *
   * @param contractAddress - NFT contract address
   * @param tokenId - Token ID
   * @returns NFT metadata including traits, owners, and rarity
   *
   * @example
   * ```ts
   * const { nft } = await client.getNFT("0x123...", "42");
   * console.log(nft.name, nft.traits);
   * ```
   */
  async getNFT(contractAddress: Address, tokenId: string): Promise<NFTResponse> {
    const endpoint = `/chain/${this.chain}/contract/${getAddress(
      contractAddress
    )}/nfts/${tokenId}`;

    return this.request<NFTResponse>(endpoint);
  }

  /**
   * Get NFTs by collection slug
   *
   * @param slug - OpenSea collection slug
   * @param options - Pagination options
   * @returns List of NFTs in the collection
   */
  async getNFTsByCollection(
    slug: string,
    options: { limit?: number; next?: string } = {}
  ): Promise<NFTListResponse> {
    const params = new URLSearchParams();

    if (options.limit) {
      params.set("limit", Math.min(options.limit, 200).toString());
    }
    if (options.next) {
      params.set("next", options.next);
    }

    const queryString = params.toString();
    const endpoint = `/collection/${slug}/nfts${queryString ? `?${queryString}` : ""}`;

    return this.request<NFTListResponse>(endpoint);
  }

  // ============================================================================
  // Collection Endpoints
  // ============================================================================

  /**
   * Get collection details
   *
   * @param slug - OpenSea collection slug
   * @returns Collection metadata
   */
  async getCollection(slug: string): Promise<Collection> {
    const endpoint = `/collections/${slug}`;
    return this.request<Collection>(endpoint);
  }

  /**
   * Get collection stats (floor price, volume, etc.)
   *
   * @param slug - OpenSea collection slug
   * @returns Collection statistics
   */
  async getCollectionStats(slug: string): Promise<CollectionStats> {
    const endpoint = `/collections/${slug}/stats`;
    return this.request<CollectionStats>(endpoint);
  }

  // ============================================================================
  // Listing Endpoints
  // ============================================================================

  /**
   * Get the best (lowest price) listing for a specific NFT
   *
   * @param slug - OpenSea collection slug
   * @param tokenId - Token ID
   * @returns Best listing or null if not listed
   *
   * @example
   * ```ts
   * const listing = await client.getBestListing("my-collection", "42");
   * if (listing) {
   *   console.log("Price:", listing.price.current.value);
   * }
   * ```
   */
  async getBestListing(
    slug: string,
    tokenId: string
  ): Promise<BestListingResponse | null> {
    try {
      const endpoint = `/listings/collection/${slug}/nfts/${tokenId}/best`;
      return await this.request<BestListingResponse>(endpoint);
    } catch (error) {
      // 404 means no listing exists
      if (error instanceof OpenSeaAPIError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get all active listings for a collection
   *
   * @param slug - OpenSea collection slug
   * @param options - Pagination and filter options
   * @returns List of active listings
   *
   * @example
   * ```ts
   * const { listings, next } = await client.getCollectionListings(
   *   "my-collection",
   *   { limit: 50, maxPrice: "10" }
   * );
   * ```
   */
  async getCollectionListings(
    slug: string,
    options: GetCollectionListingsOptions = {}
  ): Promise<CollectionListingsResponse> {
    const params = new URLSearchParams();

    if (options.limit) {
      params.set("limit", Math.min(options.limit, 100).toString());
    }
    if (options.next) {
      params.set("next", options.next);
    }

    const queryString = params.toString();
    const endpoint = `/listings/collection/${slug}/all${
      queryString ? `?${queryString}` : ""
    }`;

    const response = await this.request<CollectionListingsResponse>(endpoint);

    // Filter by max price if specified
    if (options.maxPrice) {
      const maxPriceWei = parseUnits(options.maxPrice, 18);
      response.listings = response.listings.filter((listing) => {
        const priceWei = BigInt(listing.price.current.value);
        return priceWei <= maxPriceWei;
      });
    }

    return response;
  }

  // ============================================================================
  // Order Fulfillment (Buying)
  // ============================================================================

  /**
   * Get fulfillment data for buying an NFT
   *
   * This returns the transaction data needed to execute a purchase
   * through the Seaport protocol.
   *
   * @param listing - The listing to fulfill
   * @param fulfillerAddress - Address of the buyer
   * @returns Transaction data for executing the purchase
   *
   * @example
   * ```ts
   * const listing = await client.getBestListing("my-collection", "42");
   * const fulfillment = await client.getFulfillmentData(listing, buyerAddress);
   *
   * // Execute the transaction
   * const tx = {
   *   to: fulfillment.fulfillment_data.transaction.to,
   *   value: fulfillment.fulfillment_data.transaction.value,
   *   data: encodeSeaportCall(fulfillment),
   * };
   * ```
   */
  async getFulfillmentData(
    listing: NFTListing,
    fulfillerAddress: Address,
    options: {
      recipient?: Address;
      unitsToFill?: number;
      includeOptionalCreatorFees?: boolean;
    } = {}
  ): Promise<FulfillmentResponse> {
    const body: FulfillmentRequest = {
      listing: {
        hash: listing.order_hash,
        chain: listing.chain,
        protocol_address: listing.protocol_address,
      },
      fulfiller: {
        address: getAddress(fulfillerAddress),
      },
    };

    if (options.recipient) {
      body.consideration = {
        recipient: getAddress(options.recipient),
      };
    }

    if (options.unitsToFill !== undefined) {
      body.units_to_fill = options.unitsToFill;
    }

    if (options.includeOptionalCreatorFees !== undefined) {
      body.include_optional_creator_fees = options.includeOptionalCreatorFees;
    }

    return this.request<FulfillmentResponse>("/listings/fulfillment_data", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // ============================================================================
  // Order Creation (Selling)
  // ============================================================================

  /**
   * Create a listing (sell an NFT)
   *
   * Note: Creating a listing requires signing a Seaport order off-chain.
   * The order must be constructed and signed by the seller before calling this.
   *
   * @param order - Signed Seaport order
   * @returns Created listing details
   *
   * @example
   * ```ts
   * // 1. Build Seaport order parameters
   * // 2. Sign the order with seller's wallet
   * // 3. Submit to OpenSea
   * const response = await client.createListing(signedOrder);
   * console.log("Listed:", response.order.order_hash);
   * ```
   */
  async createListing(order: CreateListingOrder): Promise<CreateListingResponse> {
    return this.request<CreateListingResponse>(
      `/orders/${this.chain}/seaport/listings`,
      {
        method: "POST",
        body: JSON.stringify(order),
      }
    );
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Format price from listing to human-readable string
   *
   * @param listing - NFT listing
   * @returns Formatted price string (e.g., "1.5 MON")
   */
  static formatListingPrice(listing: NFTListing): string {
    const { currency, decimals, value } = listing.price.current;
    const formatted = formatUnits(BigInt(value), decimals);

    // Clean up trailing zeros
    const cleanFormatted = parseFloat(formatted).toString();

    // Map currency to symbol
    const symbolMap: Record<string, string> = {
      MON: "MON",
      WMON: "WMON",
      ETH: "ETH",
      WETH: "WETH",
    };

    const symbol = symbolMap[currency] ?? currency;
    return `${cleanFormatted} ${symbol}`;
  }

  /**
   * Get price in wei from listing
   *
   * @param listing - NFT listing
   * @returns Price in wei as bigint
   */
  static getListingPriceWei(listing: NFTListing): bigint {
    return BigInt(listing.price.current.value);
  }

  /**
   * Check if a listing is still active
   *
   * @param listing - NFT listing
   * @returns True if listing can be purchased
   */
  static isListingActive(listing: NFTListing): boolean {
    if (listing.status !== "active") return false;

    // Check if listing has expired
    const endTime = parseInt(listing.protocol_data.parameters.endTime, 10);
    const now = Math.floor(Date.now() / 1000);

    return endTime > now;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an OpenSea client instance
 *
 * @param config - Client configuration
 * @returns OpenSea client
 *
 * @example
 * ```ts
 * const client = createOpenSeaClient({
 *   apiKey: process.env.OPENSEA_API_KEY!,
 * });
 *
 * const { nfts } = await client.getNFTsByAccount(userAddress);
 * ```
 */
export function createOpenSeaClient(config: OpenSeaClientConfig): OpenSeaClient {
  return new OpenSeaClient(config);
}
