/**
 * HyperSync Activity Fetcher - REWRITTEN
 *
 * Fetches on-chain activity for smart accounts using Envio HyperSync.
 *
 * KEY INSIGHT: Smart accounts execute via redeemDelegations() on DelegationManager.
 * The PRIMARY indicator of Pragma transactions is the RedeemedDelegation event,
 * NOT ValidatedPayment (which only fires for fee-charging operations).
 *
 * Query Strategy:
 * - Smart Accounts: Query RedeemedDelegation events from DelegationManager
 *   - Filter by topic1 (rootDelegator) = user's smart account address
 * - EOAs: Query transactions where from = eoa address
 *
 * Classification (order matters!):
 * 1. NFT Purchase (OrderFulfilled or ERC721 Transfer)
 * 2. Stake (aPriori Deposit event)
 * 3. Unstake Request (aPriori RedeemRequest event)
 * 4. Swap - Monorail (ANY event from Monorail Router)
 * 5. Swap - 0x (2+ unique tokens transferred)
 * 6. Wrap (pure WMON Deposit event)
 * 7. Unwrap (pure WMON Withdrawal event)
 * 8. Transfer (single token outflow)
 * 9. Approve (approval without transfers)
 * 10. Native Transfer (IncreasedSpentMap event)
 */

import { formatUnits, type Address } from "viem";
import {
  extractExecutionTarget as decodeExecutionTarget,
  getExecutionDetails,
  type TxType,
} from "./decodeRedeemDelegations";

// ============================================================================
// Configuration
// ============================================================================

const HYPERSYNC_URL = process.env.MONAD_HYPERSYNC_URL || "https://monad.hypersync.xyz/query";
const ENVIO_TOKEN = process.env.ENVIO_TOKEN_API;
const RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC_URL || process.env.MONAD_RPC_URL;
const MONORAIL_DATA_API_URL = process.env.NEXT_PUBLIC_MONORAIL_DATA_API_URL || "https://api.monorail.xyz/v2";

// Known contract addresses (all lowercase)
const CONTRACTS = {
  DELEGATION_MANAGER: "0xdb9b1e94b5b69df7e401ddbede43491141047db3",
  PRAGMA_FEE_ENFORCER: "0xc0060a7411b5a66fff4285bef32e02ecd1ba9d92",
  MONORAIL_ROUTER: "0xa68a7f0601effdc65c64d9c47ca1b18d96b4352c",
  APRIORI: "0x0c65a0bc65a5d819235b71f554d210d3f80e0852",
  WMON: "0x3bd359c1119da7da1d913d1c4d2b7c461115433a",
  SEAPORT: "0x0000000000000068f116a894984e2db1123eb395",
} as const;

// Event topic signatures (keccak256 hashes)
const TOPICS = {
  // Primary Pragma tx indicator
  REDEEMED_DELEGATION: "0x40dadaa36c6c2e3d7317e24757451ffb2d603d875f0ad5e92c5dd156573b1873",

  // ERC20/ERC721 events
  TRANSFER: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  APPROVAL: "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",

  // aPriori events
  DEPOSIT_APRIORI: "0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7",
  // ERC-7540: RedeemRequest(address,address,uint256,address,uint256,uint256)
  REDEEM_REQUEST: "0x110990b6c317a85848c161e269666a01fea23eb9e16150c2c46cae8c0faf4a9d",
  // ERC-7540: Redeem(address,address,uint256,uint256,uint256,uint256) - claim unstaked funds
  REDEEM_CLAIM: "0x8caf04742286d017f9ac3924388e188c73e6e5094311c5e59a61a7ef86dda8bf",

  // WMON events (for wrap/unwrap)
  WMON_DEPOSIT: "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c",
  WMON_WITHDRAWAL: "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65",

  // Seaport NFT event
  ORDER_FULFILLED: "0x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31",

  // Native MON spending tracking
  INCREASED_SPENT_MAP: "0xc026e493323d526061a052b5dd562495120e2f648797a48be61966d3a6beec8d",

  // Monorail swap event (contains tokenIn/tokenOut directly)
  // MonorailSwap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, ...)
  MONORAIL_SWAP: "0x6e4c3aa29fc5ed6dc56aa0a95d8ac6660b6bf4e9c2ab49a0ea79b9cdafbcd7eb",
} as const;

// redeemDelegations function selector
const REDEEM_DELEGATIONS_SELECTOR = "0xcef6d209";

/**
 * Extract execution target from redeemDelegations tx input
 *
 * This function now uses the proper ABI decoder from decodeRedeemDelegations.ts
 * which handles ALL Pragma transaction types correctly.
 *
 * The decoder uses proper ABI decoding as PRIMARY approach, with a fallback
 * to marker-based extraction if decoding fails.
 *
 * @see decodeRedeemDelegations.ts for full implementation
 */
function extractExecutionTarget(input: string | undefined, _expectedValue: bigint): string | null {
  return decodeExecutionTarget(input, _expectedValue);
}

/**
 * LEGACY FALLBACK: Marker-based extraction approach
 *
 * This was the original approach that works for native_transfer transactions
 * where execution data is packed at the END with format:
 * ...00000034<address:40hex><value:64hex><padding>...
 * 0x34 = 52 bytes = 20 (address) + 32 (value)
 *
 * Kept for reference but now handled by decodeRedeemDelegations.ts
 */
// function extractExecutionTargetLegacy(input: string | undefined, _expectedValue: bigint): string | null {
//   if (!input || !input.startsWith(REDEEM_DELEGATIONS_SELECTOR)) {
//     return null;
//   }
//
//   const hex = input.slice(2); // Remove 0x prefix
//
//   // The packed execution data is at the END of the input
//   // Format: ...00000034<address:40hex><value:64hex><padding>...
//   // 0x34 = 52 bytes = 20 (address) + 32 (value)
//   const marker = "00000034";
//   const markerIndex = hex.lastIndexOf(marker);
//
//   if (markerIndex === -1) {
//     return null;
//   }
//
//   const afterMarker = hex.slice(markerIndex + marker.length);
//
//   // First 40 hex chars = 20-byte address
//   if (afterMarker.length < 40) {
//     return null;
//   }
//
//   const address = afterMarker.slice(0, 40).toLowerCase();
//
//   // Validate it's not all zeros
//   if (address === "0".repeat(40)) {
//     return null;
//   }
//
//   return "0x" + address;
// }

// Monad block timing (~500ms blocks = 2 blocks/second)
const BLOCKS_PER_MINUTE = 120;
const BLOCKS_PER_HOUR = 7200;
const BLOCKS_PER_DAY = 172800;

// Expanding time ranges for finding N transactions
const TIME_RANGE_STEPS = [
  { name: "1h", blocks: BLOCKS_PER_HOUR },
  { name: "6h", blocks: 6 * BLOCKS_PER_HOUR },
  { name: "24h", blocks: BLOCKS_PER_DAY },
  { name: "7d", blocks: 7 * BLOCKS_PER_DAY },
  { name: "30d", blocks: 30 * BLOCKS_PER_DAY },
];

// Known token decimals (fallback)
const KNOWN_TOKEN_DECIMALS: Record<string, number> = {
  "0x0000000000000000000000000000000000000000": 18, // Native MON
  "0x3bd359c1119da7da1d913d1c4d2b7c461115433a": 18, // WMON
  "0xe7cd86e13ac4309349f30b3435a9d337750fc82d": 6, // USDT0
  "0x00000000efe302beaa2b3e6e1b18d08d69a9012a": 6, // AUSD
  "0xf817257fed379853cde0fa4f97ab987181b1e5ea": 6, // USDC
  "0x0f0bdebf0f83cd1ee3974779bcb7315f9808c714": 6, // USDC (alternate)
  "0xee8c0e9f1bffb4eb878d8f15f368a02a35481242": 18, // WETH
  "0xb5a30b0fdc5ea94a52fdc42e3e9760cb8449fb37": 18, // aprMON
};

// ============================================================================
// Types
// ============================================================================

export interface HypersyncLog {
  block_number: number;
  transaction_hash: string;
  log_index: number;
  topic0: string;
  topic1?: string;
  topic2?: string;
  topic3?: string;
  data: string;
  address: string;
}

export interface HypersyncBlock {
  number: number;
  timestamp: number;
}

export interface HypersyncTransaction {
  block_number: number;
  transaction_index: number;
  hash: string;
  from: string;
  to?: string;
  value?: string;
  input?: string;
}

export interface HypersyncResponse {
  data: Array<{
    logs?: HypersyncLog[];
    blocks?: HypersyncBlock[];
    transactions?: HypersyncTransaction[];
  }>;
  archive_height: number;
  next_block: number;
}

export type ActivityType =
  | "swap"
  | "transfer"
  | "transfer_in"
  | "transfer_out"
  | "native_transfer"
  | "stake"
  | "unstake_request"
  | "unstake_claim"
  | "wrap"
  | "unwrap"
  | "nft_purchase"
  | "nft_sell"
  | "nft_transfer"
  | "approve"
  | "unknown";

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  priceUsd: number;
}

export interface ActivityItem {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  type: ActivityType;
  typeDescription?: string;
  // Token movements
  tokenIn?: {
    address: string;
    symbol: string;
    amount: string;
    amountFormatted: string;
    valueUsd?: string;
  };
  tokenOut?: {
    address: string;
    symbol: string;
    amount: string;
    amountFormatted: string;
    valueUsd?: string;
  };
  // Gas info
  gasFee?: string;
  gasFeeFormatted?: string;
  // Transaction participants
  from?: string;  // Sender address
  to?: string;    // Receiver address (for transfers)
  // Additional context
  protocol?: string;
  counterparty?: string;
  isPragma?: boolean;
}

export interface ActivityResponse {
  activities: ActivityItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  fromBlock: number;
  toBlock: number;
  timeRange: string;
}

// ============================================================================
// Token Price Cache
// ============================================================================

interface TokenPrice {
  address: string;
  symbol: string;
  decimals: number;
  priceUsd: number;
  fetchedAt: number;
}

const priceCache = new Map<string, TokenPrice>();
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Track pending requests to deduplicate concurrent calls
const pendingRequests = new Map<string, Promise<TokenInfo>>();

async function getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
  const normalized = tokenAddress.toLowerCase();

  // Check cache first
  const cached = priceCache.get(normalized);
  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL) {
    return cached;
  }

  // Check if there's already a pending request for this token (dedup concurrent calls)
  const pending = pendingRequests.get(normalized);
  if (pending) {
    return pending;
  }

  // Create and track the request
  const requestPromise = fetchTokenInfo(normalized);
  pendingRequests.set(normalized, requestPromise);

  try {
    const result = await requestPromise;
    return result;
  } finally {
    // Clean up pending request
    pendingRequests.delete(normalized);
  }
}

async function fetchTokenInfo(normalized: string): Promise<TokenInfo> {
  try {
    // Native token (MON) - use WMON address for price
    const queryAddress =
      normalized === "0x0000000000000000000000000000000000000000"
        ? CONTRACTS.WMON
        : normalized;

    const response = await fetch(`${MONORAIL_DATA_API_URL}/token/${queryAddress}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const info: TokenPrice = {
      address: normalized,
      symbol:
        normalized === "0x0000000000000000000000000000000000000000"
          ? "MON"
          : data.symbol || "UNKNOWN",
      decimals: data.decimals ?? KNOWN_TOKEN_DECIMALS[normalized] ?? 18,
      priceUsd: data.usd_per_token || 0,
      fetchedAt: Date.now(),
    };

    priceCache.set(normalized, info);
    return info;
  } catch {
    // Fallback to known decimals
    return {
      address: normalized,
      symbol:
        normalized === "0x0000000000000000000000000000000000000000"
          ? "MON"
          : "UNKNOWN",
      decimals: KNOWN_TOKEN_DECIMALS[normalized] ?? 18,
      priceUsd: 0,
    };
  }
}

/**
 * Extract unique token addresses from transaction logs for pre-fetching
 */
function extractTokenAddresses(logs: HypersyncLog[]): Set<string> {
  const addresses = new Set<string>();

  for (const log of logs) {
    // ERC20 transfers have the token address in log.address
    if (log.topic0?.toLowerCase() === TOPICS.TRANSFER.toLowerCase()) {
      addresses.add(log.address.toLowerCase());
    }
  }

  // Add commonly needed tokens to pre-warm
  addresses.add(CONTRACTS.WMON);
  addresses.add("0xb5a30b0fdc5ea94a52fdc42e3e9760cb8449fb37"); // aprMON

  return addresses;
}

/**
 * Pre-fetch token info in parallel to warm the cache
 * This prevents redundant API calls during parallel tx processing
 */
async function prefetchTokenInfo(addresses: Set<string>): Promise<void> {
  if (addresses.size === 0) return;
  await Promise.all([...addresses].map((addr) => getTokenInfo(addr)));
}

// ============================================================================
// NFT Metadata Cache (Legacy - kept for reference, not used)
// ============================================================================

interface NFTMetadata {
  contractAddress: string;
  tokenId: string;
  name: string | null;
  collectionName: string | null;
  imageUrl: string | null;
  fetchedAt: number;
}

const nftCache = new Map<string, NFTMetadata>();
const NFT_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Track pending NFT requests to deduplicate concurrent calls
const nftPendingRequests = new Map<string, Promise<NFTMetadata>>();

const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY;

// ============================================================================
// Collection Name Cache (On-Chain RPC)
// ============================================================================

// Collection name cache (immutable, very long TTL since names never change)
const collectionNameCache = new Map<string, string>();

// ERC721 name() function selector
const ERC721_NAME_SELECTOR = "0x06fdde03";

/**
 * Batch fetch ERC721 collection names via RPC
 * Much faster than OpenSea API - single batch call for all contracts
 */
async function batchFetchCollectionNames(
  contracts: string[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  if (contracts.length === 0) return results;

  // Filter out already cached contracts
  const uncached = contracts.filter((c) => !collectionNameCache.has(c.toLowerCase()));

  // Return cached results if all are cached
  if (uncached.length === 0) {
    for (const c of contracts) {
      const cached = collectionNameCache.get(c.toLowerCase());
      if (cached) results.set(c.toLowerCase(), cached);
    }
    return results;
  }

  // Build eth_call requests for each contract
  const requests = uncached.map((contract) => ({
    method: "eth_call",
    params: [{ to: contract, data: ERC721_NAME_SELECTOR }, "latest"],
  }));

  const rpcResults = await batchRpcCalls(requests);

  // Decode results
  for (let i = 0; i < uncached.length; i++) {
    const contract = uncached[i].toLowerCase();
    const result = rpcResults[i];

    if (result && typeof result === "string" && result.length > 2) {
      try {
        const name = decodeAbiString(result);
        if (name) {
          collectionNameCache.set(contract, name);
          results.set(contract, name);
        }
      } catch {
        // Fallback: use shortened address
        const fallbackName = `NFT ${contract.slice(0, 8)}...`;
        collectionNameCache.set(contract, fallbackName);
        results.set(contract, fallbackName);
      }
    } else {
      // No result - use fallback
      const fallbackName = `NFT ${contract.slice(0, 8)}...`;
      collectionNameCache.set(contract, fallbackName);
      results.set(contract, fallbackName);
    }
  }

  // Add any remaining cached results
  for (const c of contracts) {
    const lc = c.toLowerCase();
    if (!results.has(lc)) {
      const cached = collectionNameCache.get(lc);
      if (cached) results.set(lc, cached);
    }
  }

  return results;
}

/**
 * Decode ABI-encoded string from eth_call result
 */
function decodeAbiString(hex: string): string | null {
  try {
    if (!hex || hex === "0x") return null;

    const data = hex.slice(2); // Remove 0x
    if (data.length < 128) return null; // Minimum: offset (32 bytes) + length (32 bytes)

    // Parse length from second 32-byte word
    const lengthHex = data.slice(64, 128);
    const length = parseInt(lengthHex, 16);
    if (length === 0 || length > 100) return null; // Sanity check

    // Extract and decode string bytes
    const stringHex = data.slice(128, 128 + length * 2);
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = parseInt(stringHex.slice(i * 2, i * 2 + 2), 16);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Extract unique NFT contract addresses from logs
 * Only includes contracts where user is sender or recipient
 */
function extractNFTContracts(
  logs: HypersyncLog[],
  userAddress: string
): Set<string> {
  const contracts = new Set<string>();
  const normalizedUser = userAddress.toLowerCase();

  for (const log of logs) {
    if (
      log.topic0?.toLowerCase() === TOPICS.TRANSFER.toLowerCase() &&
      log.topic1 &&
      log.topic2 &&
      log.topic3 // ERC721 has tokenId in topic3
    ) {
      const fromAddress = "0x" + log.topic1.slice(-40).toLowerCase();
      const toAddress = "0x" + log.topic2.slice(-40).toLowerCase();

      if (fromAddress === normalizedUser || toAddress === normalizedUser) {
        contracts.add(log.address.toLowerCase());
      }
    }
  }

  return contracts;
}

/**
 * Fetch NFT metadata from OpenSea API
 * Returns collection name + NFT name for display
 * Uses pending request deduplication to avoid concurrent API calls for same NFT
 * @deprecated Use collectionNameCache with batchFetchCollectionNames instead
 */
async function getNFTMetadata(
  contractAddress: string,
  tokenId: string
): Promise<NFTMetadata> {
  const cacheKey = `${contractAddress.toLowerCase()}-${tokenId}`;

  // Check cache first
  const cached = nftCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < NFT_CACHE_TTL) {
    return cached;
  }

  // Check if there's already a pending request for this NFT (dedup concurrent calls)
  const pending = nftPendingRequests.get(cacheKey);
  if (pending) {
    return pending;
  }

  // Create and track the request
  const requestPromise = fetchNFTMetadata(contractAddress.toLowerCase(), tokenId);
  nftPendingRequests.set(cacheKey, requestPromise);

  try {
    const result = await requestPromise;
    return result;
  } finally {
    // Clean up pending request
    nftPendingRequests.delete(cacheKey);
  }
}

/**
 * Actually fetch NFT metadata from OpenSea API (internal)
 */
async function fetchNFTMetadata(
  contractAddress: string,
  tokenId: string
): Promise<NFTMetadata> {
  const cacheKey = `${contractAddress}-${tokenId}`;

  // Default fallback
  const fallback: NFTMetadata = {
    contractAddress,
    tokenId,
    name: null,
    collectionName: null,
    imageUrl: null,
    fetchedAt: Date.now(),
  };

  if (!OPENSEA_API_KEY) {
    nftCache.set(cacheKey, fallback);
    return fallback;
  }

  try {
    // OpenSea API v2 for Monad (chain name: monad)
    const url = `https://api.opensea.io/api/v2/chain/monad/contract/${contractAddress}/nfts/${tokenId}`;
    const response = await fetch(url, {
      headers: {
        "x-api-key": OPENSEA_API_KEY,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      // Try fetching just the collection info
      const collectionUrl = `https://api.opensea.io/api/v2/chain/monad/contract/${contractAddress}`;
      const collectionResponse = await fetch(collectionUrl, {
        headers: {
          "x-api-key": OPENSEA_API_KEY,
          Accept: "application/json",
        },
      });

      if (collectionResponse.ok) {
        const collectionData = await collectionResponse.json();
        const metadata: NFTMetadata = {
          contractAddress,
          tokenId,
          name: null,
          collectionName: collectionData.name || collectionData.collection || null,
          imageUrl: collectionData.image_url || null,
          fetchedAt: Date.now(),
        };
        nftCache.set(cacheKey, metadata);
        return metadata;
      }

      nftCache.set(cacheKey, fallback);
      return fallback;
    }

    const data = await response.json();
    const nft = data.nft || data;

    const metadata: NFTMetadata = {
      contractAddress,
      tokenId,
      name: nft.name || null,
      collectionName: nft.collection || nft.asset_contract?.name || null,
      imageUrl: nft.image_url || nft.display_image_url || null,
      fetchedAt: Date.now(),
    };

    nftCache.set(cacheKey, metadata);
    return metadata;
  } catch (error) {
    console.warn(`[ActivityFetcher] Failed to fetch NFT metadata for ${contractAddress}#${tokenId}:`, error);
    nftCache.set(cacheKey, fallback);
    return fallback;
  }
}

// ============================================================================
// Address Type Detection
// ============================================================================

/**
 * Detect if an address is an EOA or smart account
 * Smart accounts have contract code deployed
 */
async function detectAddressType(
  address: string
): Promise<"eoa" | "smart_account"> {
  if (!RPC_URL) {
    // Default to smart_account if we can't check
    return "smart_account";
  }

  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getCode",
        params: [address, "latest"],
        id: 1,
      }),
    });

    const data = await response.json();
    const code = data.result;

    // If code exists and is not "0x", it's a smart account
    return code && code !== "0x" ? "smart_account" : "eoa";
  } catch {
    // Default to smart_account on error
    return "smart_account";
  }
}

// ============================================================================
// Time Range Parsing
// ============================================================================

/**
 * Parse time range string into block range
 * Supports: "X days", "X hours", "X minutes", "X weeks"
 */
export function parseTimeRange(
  timeRange: string,
  currentBlock: number
): { fromBlock: number; toBlock: number } {
  const normalized = timeRange.toLowerCase().trim();

  // Parse number and unit
  const match = normalized.match(
    /^(\d+(?:\.\d+)?)\s*(day|days|hour|hours|minute|minutes|min|mins|week|weeks|d|h|m|w)s?$/
  );
  if (!match) {
    // Default to 7 days if parsing fails
    return {
      fromBlock: Math.max(0, currentBlock - 7 * BLOCKS_PER_DAY),
      toBlock: currentBlock,
    };
  }

  const value = parseFloat(match[1]);
  const unit = match[2];

  let blocks: number;
  switch (unit) {
    case "week":
    case "weeks":
    case "w":
      blocks = value * 7 * BLOCKS_PER_DAY;
      break;
    case "day":
    case "days":
    case "d":
      blocks = value * BLOCKS_PER_DAY;
      break;
    case "hour":
    case "hours":
    case "h":
      blocks = value * BLOCKS_PER_HOUR;
      break;
    case "minute":
    case "minutes":
    case "min":
    case "mins":
    case "m":
      blocks = value * BLOCKS_PER_MINUTE;
      break;
    default:
      blocks = 7 * BLOCKS_PER_DAY;
  }

  return {
    fromBlock: Math.max(0, currentBlock - Math.floor(blocks)),
    toBlock: currentBlock,
  };
}

// ============================================================================
// RPC Helpers
// ============================================================================

/**
 * Get current block number via RPC
 */
async function getCurrentBlock(): Promise<number> {
  if (!RPC_URL) {
    throw new Error("Missing RPC_URL environment variable");
  }

  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_blockNumber",
      params: [],
      id: 1,
    }),
  });

  const data = await response.json();
  return parseInt(data.result, 16);
}

/**
 * Get block timestamp via RPC
 */
async function getBlockTimestamp(blockNumber: number): Promise<number> {
  if (!RPC_URL) {
    return Math.floor(Date.now() / 1000);
  }

  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: [`0x${blockNumber.toString(16)}`, false],
        id: 1,
      }),
    });

    const data = await response.json();
    return parseInt(data.result?.timestamp || "0x0", 16);
  } catch {
    return Math.floor(Date.now() / 1000);
  }
}

// ============================================================================
// HyperSync Queries
// ============================================================================

/**
 * Get current archive height from HyperSync
 */
export async function getArchiveHeight(): Promise<number> {
  if (!ENVIO_TOKEN) {
    throw new Error("Missing ENVIO_TOKEN_API environment variable");
  }

  const response = await fetch(HYPERSYNC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENVIO_TOKEN}`,
    },
    body: JSON.stringify({
      from_block: 0,
      to_block: 1,
      field_selection: {
        block: ["number"],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get archive height: ${response.status}`);
  }

  const result: HypersyncResponse = await response.json();
  return result.archive_height;
}

/**
 * Query RedeemedDelegation events for a smart account
 * This is the PRIMARY indicator of Pragma transactions
 *
 * RedeemedDelegation(address indexed rootDelegator, address redeemer, bytes32[] delegationHashes)
 * - topic0 = event signature
 * - topic1 = rootDelegator (indexed) = the smart account
 */
async function queryRedeemedDelegationEvents(
  smartAccount: Address,
  fromBlock: number,
  toBlock: number
): Promise<{ logs: HypersyncLog[]; blocks: HypersyncBlock[] }> {
  if (!ENVIO_TOKEN) {
    throw new Error("Missing ENVIO_TOKEN_API environment variable");
  }

  // Pad address for topic filtering (32 bytes)
  const paddedAddress =
    "0x000000000000000000000000" + smartAccount.slice(2).toLowerCase();

  const logs: HypersyncLog[] = [];
  const blocks: HypersyncBlock[] = [];

  // HyperSync paginates results - loop until we have all data
  let currentFromBlock = fromBlock;
  let pageCount = 0;
  const MAX_PAGES = 50; // Safety limit to prevent infinite loops

  while (currentFromBlock < toBlock && pageCount < MAX_PAGES) {
    pageCount++;

    const response = await fetch(HYPERSYNC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENVIO_TOKEN}`,
      },
      body: JSON.stringify({
        from_block: currentFromBlock,
        to_block: toBlock,
        logs: [
          {
            address: [CONTRACTS.DELEGATION_MANAGER],
            topics: [[TOPICS.REDEEMED_DELEGATION], [paddedAddress]],
          },
        ],
        field_selection: {
          log: [
            "block_number",
            "transaction_hash",
            "log_index",
            "topic0",
            "topic1",
            "topic2",
            "data",
            "address",
          ],
          block: ["number", "timestamp"],
        },
        include_all_blocks: false,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HyperSync query failed: ${response.status} - ${text}`);
    }

    const result: HypersyncResponse = await response.json();

    // Extract logs and blocks from this page
    for (const dataItem of result.data) {
      if (dataItem.logs) logs.push(...dataItem.logs);
      if (dataItem.blocks) blocks.push(...dataItem.blocks);
    }

    // Check if there are more pages
    // next_block indicates where to continue; if undefined or >= toBlock, we're done
    if (!result.next_block || result.next_block >= toBlock) {
      break;
    }

    // Continue from next_block
    currentFromBlock = result.next_block;
  }

  if (pageCount >= MAX_PAGES) {
    console.warn(`[queryRedeemedDelegationEvents] Hit max pages limit (${MAX_PAGES}), results may be incomplete`);
  }

  return { logs, blocks };
}

/**
 * Query incoming ERC20 Transfer events TO an address
 * This captures tokens received by the address from any source
 */
async function queryIncomingTransfers(
  address: Address,
  fromBlock: number,
  toBlock: number
): Promise<{ logs: HypersyncLog[]; blocks: HypersyncBlock[] }> {
  if (!ENVIO_TOKEN) {
    throw new Error("Missing ENVIO_TOKEN_API environment variable");
  }

  // Pad address for topic filtering (32 bytes) - this is the "to" field in Transfer
  const paddedAddress =
    "0x000000000000000000000000" + address.slice(2).toLowerCase();

  const logs: HypersyncLog[] = [];
  const blocks: HypersyncBlock[] = [];

  // HyperSync paginates results - loop until we have all data
  let currentFromBlock = fromBlock;
  let pageCount = 0;
  const MAX_PAGES = 50; // Safety limit to prevent infinite loops

  while (currentFromBlock < toBlock && pageCount < MAX_PAGES) {
    pageCount++;

    const response = await fetch(HYPERSYNC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENVIO_TOKEN}`,
      },
      body: JSON.stringify({
        from_block: currentFromBlock,
        to_block: toBlock,
        logs: [
          {
            // Query ERC20 Transfer events where topic2 (to) = user address
            topics: [
              [TOPICS.TRANSFER],
              [], // topic1 = from (any)
              [paddedAddress], // topic2 = to (user)
            ],
          },
        ],
        field_selection: {
          log: [
            "block_number",
            "transaction_hash",
            "log_index",
            "topic0",
            "topic1",
            "topic2",
            "topic3",
            "data",
            "address",
          ],
          block: ["number", "timestamp"],
        },
        include_all_blocks: false,
      }),
    });

    if (!response.ok) {
      console.error("[queryIncomingTransfers] HyperSync error:", response.status);
      return { logs, blocks }; // Return what we have so far
    }

    const result: HypersyncResponse = await response.json();

    // Extract logs and blocks from this page
    for (const dataItem of result.data) {
      if (dataItem.logs) logs.push(...dataItem.logs);
      if (dataItem.blocks) blocks.push(...dataItem.blocks);
    }

    // Check if there are more pages
    if (!result.next_block || result.next_block >= toBlock) {
      break;
    }

    // Continue from next_block
    currentFromBlock = result.next_block;
  }

  if (pageCount >= MAX_PAGES) {
    console.warn(`[queryIncomingTransfers] Hit max pages limit (${MAX_PAGES}), results may be incomplete`);
  }

  return { logs, blocks };
}

/**
 * Query all logs for a specific transaction
 * Used to classify the transaction type based on events
 */
async function queryTransactionLogs(
  txHash: string
): Promise<HypersyncLog[]> {
  if (!RPC_URL) {
    return [];
  }

  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [txHash],
        id: 1,
      }),
    });

    const data = await response.json();
    const receipt = data.result;

    if (!receipt || !receipt.logs) {
      return [];
    }

    return receipt.logs.map(
      (log: {
        blockNumber: string;
        transactionHash: string;
        logIndex: string;
        topics: string[];
        data: string;
        address: string;
      }) => ({
        block_number: parseInt(log.blockNumber, 16),
        transaction_hash: log.transactionHash,
        log_index: parseInt(log.logIndex, 16),
        topic0: log.topics[0] || "",
        topic1: log.topics[1],
        topic2: log.topics[2],
        topic3: log.topics[3],
        data: log.data,
        address: log.address.toLowerCase(),
      })
    );
  } catch {
    return [];
  }
}

/**
 * Fetch transaction input data by hash
 */
async function getTransactionInput(txHash: string): Promise<string | undefined> {
  if (!RPC_URL) {
    return undefined;
  }

  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionByHash",
        params: [txHash],
        id: 1,
      }),
    });

    const data = await response.json();
    return data.result?.input;
  } catch {
    return undefined;
  }
}

/**
 * Batch RPC calls - execute multiple JSON-RPC requests in chunked HTTP requests
 * Chunks requests to avoid RPC provider limits (response size, timeout)
 * Runs chunks in parallel for performance (Ankr limit: 1k req/s)
 */
const BATCH_CHUNK_SIZE = 50; // Safe limit to avoid response truncation

async function batchRpcCalls(
  requests: Array<{ method: string; params: unknown[] }>
): Promise<unknown[]> {
  if (!RPC_URL || requests.length === 0) {
    return requests.map(() => null);
  }

  // Chunk requests to avoid RPC provider limits
  const chunks: Array<Array<{ method: string; params: unknown[] }>> = [];
  for (let i = 0; i < requests.length; i += BATCH_CHUNK_SIZE) {
    chunks.push(requests.slice(i, i + BATCH_CHUNK_SIZE));
  }

  // Process all chunks in parallel
  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const batchBody = chunk.map((req, i) => ({
          jsonrpc: "2.0",
          method: req.method,
          params: req.params,
          id: i + 1,
        }));

        const response = await fetch(RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(batchBody),
        });

        const results = await response.json();

        // Handle both array response (batch) and single response
        if (!Array.isArray(results)) {
          return [results.result];
        }

        // Sort by ID and extract results
        return results
          .sort((a: { id: number }, b: { id: number }) => a.id - b.id)
          .map((r: { result: unknown }) => r.result);
      } catch (error) {
        console.error("[ActivityFetcher] Batch RPC chunk error:", error);
        // Fill this chunk with nulls so we don't lose position
        return chunk.map(() => null);
      }
    })
  );

  // Flatten all chunk results into single array
  return chunkResults.flat();
}

/**
 * Batch fetch transaction data (receipts + inputs) for multiple transactions
 * Returns a map of txHash -> { logs, input }
 */
async function batchFetchTransactionData(
  txHashes: string[]
): Promise<Map<string, { logs: HypersyncLog[]; input: string | undefined }>> {
  const dataMap = new Map<string, { logs: HypersyncLog[]; input: string | undefined }>();

  if (txHashes.length === 0) {
    return dataMap;
  }

  // Build batch requests: receipt + tx for each hash
  const requests = txHashes.flatMap((hash) => [
    { method: "eth_getTransactionReceipt", params: [hash] },
    { method: "eth_getTransactionByHash", params: [hash] },
  ]);

  const results = await batchRpcCalls(requests);

  // Parse results in pairs (receipt, tx)
  for (let i = 0; i < txHashes.length; i++) {
    const receipt = results[i * 2] as { logs?: Array<{
      blockNumber: string;
      transactionHash: string;
      logIndex: string;
      topics: string[];
      data: string;
      address: string;
    }> } | null;
    const tx = results[i * 2 + 1] as { input?: string } | null;

    // Parse logs from receipt
    const logs: HypersyncLog[] = receipt?.logs?.map((log) => ({
      block_number: parseInt(log.blockNumber, 16),
      transaction_hash: log.transactionHash,
      log_index: parseInt(log.logIndex, 16),
      topic0: log.topics[0] || "",
      topic1: log.topics[1],
      topic2: log.topics[2],
      topic3: log.topics[3],
      data: log.data,
      address: log.address.toLowerCase(),
    })) || [];

    dataMap.set(txHashes[i], {
      logs,
      input: tx?.input,
    });
  }

  return dataMap;
}

/**
 * Query transactions from an EOA
 */
async function queryEOATransactions(
  eoaAddress: Address,
  fromBlock: number,
  toBlock: number
): Promise<{ transactions: HypersyncTransaction[]; blocks: HypersyncBlock[] }> {
  if (!ENVIO_TOKEN) {
    throw new Error("Missing ENVIO_TOKEN_API environment variable");
  }

  const response = await fetch(HYPERSYNC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENVIO_TOKEN}`,
    },
    body: JSON.stringify({
      from_block: fromBlock,
      to_block: toBlock,
      transactions: [
        {
          from: [eoaAddress.toLowerCase()],
        },
      ],
      field_selection: {
        transaction: [
          "block_number",
          "transaction_index",
          "hash",
          "from",
          "to",
          "value",
          "input",
        ],
        block: ["number", "timestamp"],
      },
      include_all_blocks: false,
    }),
  });

  if (!response.ok) {
    return { transactions: [], blocks: [] };
  }

  const result: HypersyncResponse = await response.json();

  const transactions: HypersyncTransaction[] = [];
  const blocks: HypersyncBlock[] = [];

  for (const dataItem of result.data) {
    if (dataItem.transactions) transactions.push(...dataItem.transactions);
    if (dataItem.blocks) blocks.push(...dataItem.blocks);
  }

  return { transactions, blocks };
}

// ============================================================================
// Transaction Classification
// ============================================================================

/**
 * Classify a Pragma transaction based on its logs
 *
 * Classification order (CRITICAL - order matters!):
 * 1. NFT Purchase (OrderFulfilled or ERC721 Transfer)
 * 2. Stake (aPriori Deposit event)
 * 3. Unstake Request (aPriori RedeemRequest event)
 * 4. Swap - Monorail (ANY event from Monorail Router)
 * 5. Swap - 0x (2+ unique tokens transferred)
 * 6. Wrap (pure WMON Deposit event)
 * 7. Unwrap (pure WMON Withdrawal event)
 * 8. Transfer (single token outflow)
 * 9. Approve (approval without transfers)
 * 10. Native Transfer (IncreasedSpentMap event)
 */
async function classifyPragmaTransaction(
  logs: HypersyncLog[],
  smartAccount: string,
  txInput?: string
): Promise<{
  type: ActivityType;
  typeDescription: string;
  protocol?: string;
  tokenIn?: ActivityItem["tokenIn"];
  tokenOut?: ActivityItem["tokenOut"];
  counterparty?: string;
  from?: string;
  to?: string;
}> {
  const normalizedAccount = smartAccount.toLowerCase();

  // Helper: Check if a log is from a specific contract
  const hasLogFromContract = (contract: string) =>
    logs.some((l) => l.address.toLowerCase() === contract);

  // Helper: Check if a specific topic exists
  const hasEvent = (topic: string, contract?: string) =>
    logs.some(
      (l) =>
        l.topic0?.toLowerCase() === topic.toLowerCase() &&
        (!contract || l.address.toLowerCase() === contract)
    );

  // Helper: Get ERC20 transfers (topics.length === 3)
  const erc20Transfers = logs.filter(
    (l) =>
      l.topic0?.toLowerCase() === TOPICS.TRANSFER.toLowerCase() &&
      l.topic1 &&
      l.topic2 &&
      !l.topic3 // ERC20 has no topic3, ERC721 has tokenId in topic3
  );

  // Helper: Get unique tokens from transfers
  const uniqueTokens = new Set(erc20Transfers.map((t) => t.address.toLowerCase()));

  // =========================================================================
  // 1. NFT Detection - OrderFulfilled = Purchase, plain ERC721 = Transfer
  // =========================================================================
  const hasOrderFulfilled = hasEvent(TOPICS.ORDER_FULFILLED, CONTRACTS.SEAPORT);
  const erc721TransferLog = logs.find(
    (l) =>
      l.topic0?.toLowerCase() === TOPICS.TRANSFER.toLowerCase() &&
      l.topic1 &&
      l.topic2 &&
      l.topic3 // ERC721 has tokenId in topic3
  );
  const hasERC721Transfer = !!erc721TransferLog;

  // 1a. NFT Purchase (OrderFulfilled from Seaport = marketplace purchase)
  if (hasOrderFulfilled) {
    // Extract NFT details (contract + tokenId)
    const nftTransfer = erc721TransferLog;

    // Extract payment - check ERC20 transfers or WMON events
    let tokenIn: ActivityItem["tokenIn"] | undefined;

    // First check for ERC20 payment (USDC, WMON, etc.)
    if (erc20Transfers.length > 0) {
      // Find the payment token (typically the first ERC20 transfer or largest)
      const paymentTransfer = erc20Transfers[0];
      const paymentAmount = BigInt(
        paymentTransfer.data && paymentTransfer.data.length > 2
          ? paymentTransfer.data
          : "0x0"
      );
      const paymentInfo = await getTokenInfo(paymentTransfer.address);
      const paymentFormatted = formatUnits(paymentAmount, paymentInfo.decimals);

      tokenIn = {
        address: paymentTransfer.address,
        symbol: paymentInfo.symbol,
        amount: paymentAmount.toString(),
        amountFormatted: paymentFormatted,
        valueUsd:
          paymentInfo.priceUsd > 0
            ? (parseFloat(paymentFormatted) * paymentInfo.priceUsd).toFixed(2)
            : undefined,
      };
    }
    // Check for native MON payment via WMON deposit
    else if (hasEvent(TOPICS.WMON_DEPOSIT, CONTRACTS.WMON)) {
      const depositLog = logs.find(
        (l) =>
          l.topic0?.toLowerCase() === TOPICS.WMON_DEPOSIT.toLowerCase() &&
          l.address.toLowerCase() === CONTRACTS.WMON
      );
      if (depositLog && depositLog.data) {
        const amount = BigInt(depositLog.data);
        const amountFormatted = formatUnits(amount, 18);
        const monInfo = await getTokenInfo(CONTRACTS.WMON);

        tokenIn = {
          address: "0x0000000000000000000000000000000000000000",
          symbol: "MON",
          amount: amount.toString(),
          amountFormatted,
          valueUsd:
            monInfo.priceUsd > 0
              ? (parseFloat(amountFormatted) * monInfo.priceUsd).toFixed(2)
              : undefined,
        };
      }
    }

    // Extract NFT tokenId and get collection name from cache
    const tokenId = nftTransfer?.topic3
      ? BigInt(nftTransfer.topic3).toString()
      : undefined;

    // Get NFT display name (collection name from RPC cache + tokenId)
    let nftSymbol = "NFT";
    if (nftTransfer && tokenId) {
      const contractAddr = nftTransfer.address.toLowerCase();
      const collectionName = collectionNameCache.get(contractAddr);
      if (collectionName) {
        nftSymbol = `${collectionName} #${tokenId}`;
      } else {
        nftSymbol = `NFT #${tokenId}`;
      }
    }

    return {
      type: "nft_purchase",
      typeDescription: "NFT Purchase",
      protocol: "Seaport",
      tokenIn,
      tokenOut: nftTransfer
        ? {
            address: nftTransfer.address,
            symbol: nftSymbol,
            amount: "1",
            amountFormatted: "1",
          }
        : undefined,
    };
  }

  // 1b. NFT Transfer (ERC721 transfer WITHOUT OrderFulfilled = p2p transfer)
  if (hasERC721Transfer && erc721TransferLog) {
    const nftTransfer = erc721TransferLog;

    // Determine direction: is smart account sender or receiver?
    // Use slice(-40) for robustness - works with or without 0x prefix
    const nftFrom = nftTransfer.topic1
      ? ("0x" + nftTransfer.topic1.slice(-40)).toLowerCase()
      : "";
    const nftTo = nftTransfer.topic2
      ? ("0x" + nftTransfer.topic2.slice(-40)).toLowerCase()
      : "";
    const isOutgoing = nftFrom === normalizedAccount;
    const isIncoming = nftTo === normalizedAccount;

    // Extract NFT tokenId and get collection name from cache
    const tokenId = nftTransfer.topic3
      ? BigInt(nftTransfer.topic3).toString()
      : undefined;

    // Get NFT display name (collection name from RPC cache + tokenId)
    let nftSymbol = "NFT";
    if (tokenId) {
      const contractAddr = nftTransfer.address.toLowerCase();
      const collectionName = collectionNameCache.get(contractAddr);
      if (collectionName) {
        nftSymbol = `${collectionName} #${tokenId}`;
      } else {
        nftSymbol = `NFT #${tokenId}`;
      }
    }

    const nftInfo = {
      address: nftTransfer.address,
      symbol: nftSymbol,
      amount: "1",
      amountFormatted: "1",
    };

    return {
      type: "nft_transfer",
      typeDescription: isOutgoing ? "NFT Transfer Out" : isIncoming ? "NFT Transfer In" : "NFT Transfer",
      protocol: "ERC721",
      // For outgoing: tokenIn = NFT sent, for incoming: tokenOut = NFT received
      tokenIn: isOutgoing ? nftInfo : undefined,
      tokenOut: isIncoming ? nftInfo : undefined,
      from: nftFrom,
      to: nftTo,
      counterparty: isOutgoing ? nftTo : isIncoming ? nftFrom : undefined,
    };
  }

  // =========================================================================
  // 2. Stake (aPriori Deposit event)
  // =========================================================================
  if (hasEvent(TOPICS.DEPOSIT_APRIORI, CONTRACTS.APRIORI)) {
    const depositLog = logs.find(
      (l) =>
        l.topic0?.toLowerCase() === TOPICS.DEPOSIT_APRIORI.toLowerCase() &&
        l.address.toLowerCase() === CONTRACTS.APRIORI
    );

    if (depositLog && depositLog.data && depositLog.data.length >= 130) {
      const data = depositLog.data.slice(2);
      const assets = BigInt("0x" + (data.slice(0, 64).replace(/^0+/, "") || "0"));
      const shares = BigInt("0x" + (data.slice(64, 128).replace(/^0+/, "") || "0"));

      const assetsFormatted = formatUnits(assets, 18);
      const sharesFormatted = formatUnits(shares, 18);

      const monInfo = await getTokenInfo(CONTRACTS.WMON);
      const aprMonInfo = await getTokenInfo("0xb5a30b0fdc5ea94a52fdc42e3e9760cb8449fb37");

      return {
        type: "stake",
        typeDescription: "Stake MON",
        protocol: "aPriori",
        tokenIn: {
          address: "0x0000000000000000000000000000000000000000",
          symbol: "MON",
          amount: assets.toString(),
          amountFormatted: assetsFormatted,
          valueUsd:
            monInfo.priceUsd > 0
              ? (parseFloat(assetsFormatted) * monInfo.priceUsd).toFixed(2)
              : undefined,
        },
        tokenOut: {
          address: "0xb5a30b0fdc5ea94a52fdc42e3e9760cb8449fb37",
          symbol: "aprMON",
          amount: shares.toString(),
          amountFormatted: sharesFormatted,
          valueUsd:
            aprMonInfo.priceUsd > 0
              ? (parseFloat(sharesFormatted) * aprMonInfo.priceUsd).toFixed(2)
              : undefined,
        },
      };
    }
  }

  // =========================================================================
  // 3. Unstake Request (aPriori RedeemRequest event)
  // =========================================================================
  if (hasEvent(TOPICS.REDEEM_REQUEST, CONTRACTS.APRIORI)) {
    // Extract aprMON amount from transfer TO aPriori
    const APRMON_ADDRESS = "0xb5a30b0fdc5ea94a52fdc42e3e9760cb8449fb37";
    const aprMonTransfer = erc20Transfers.find(
      (t) =>
        t.address.toLowerCase() === APRMON_ADDRESS &&
        ("0x" + t.topic2?.slice(-40)).toLowerCase() === CONTRACTS.APRIORI
    );

    let tokenIn: ActivityItem["tokenIn"];
    if (aprMonTransfer) {
      const amount = BigInt(
        aprMonTransfer.data && aprMonTransfer.data.length > 2
          ? aprMonTransfer.data
          : "0x0"
      );
      const amountFormatted = formatUnits(amount, 18);
      const aprMonInfo = await getTokenInfo(APRMON_ADDRESS);

      tokenIn = {
        address: APRMON_ADDRESS,
        symbol: "aprMON",
        amount: amount.toString(),
        amountFormatted,
        valueUsd:
          aprMonInfo.priceUsd > 0
            ? (parseFloat(amountFormatted) * aprMonInfo.priceUsd).toFixed(2)
            : undefined,
      };
    }

    return {
      type: "unstake_request",
      typeDescription: "Unstake Request",
      protocol: "aPriori",
      tokenIn,
    };
  }

  // =========================================================================
  // 3b. Unstake Claim (aPriori Redeem event - claim after waiting period)
  // =========================================================================
  if (hasEvent(TOPICS.REDEEM_CLAIM, CONTRACTS.APRIORI)) {
    // Extract WMON/MON received from unstaking
    // Look for WMON transfer FROM aPriori or WMON withdrawal
    const wmonTransfer = erc20Transfers.find(
      (t) =>
        t.address.toLowerCase() === CONTRACTS.WMON &&
        ("0x" + t.topic1?.slice(-40)).toLowerCase() === CONTRACTS.APRIORI
    );

    let tokenOut: ActivityItem["tokenOut"];
    if (wmonTransfer) {
      const amount = BigInt(
        wmonTransfer.data && wmonTransfer.data.length > 2
          ? wmonTransfer.data
          : "0x0"
      );
      const amountFormatted = formatUnits(amount, 18);
      const wmonInfo = await getTokenInfo(CONTRACTS.WMON);

      tokenOut = {
        address: CONTRACTS.WMON,
        symbol: "WMON",
        amount: amount.toString(),
        amountFormatted,
        valueUsd:
          wmonInfo.priceUsd > 0
            ? (parseFloat(amountFormatted) * wmonInfo.priceUsd).toFixed(2)
            : undefined,
      };
    }

    return {
      type: "unstake_claim",
      typeDescription: "Unstake Claim",
      protocol: "aPriori",
      tokenOut,
    };
  }

  // =========================================================================
  // 4. Swap - Monorail (parse MonorailSwap event directly for accurate tokenIn/tokenOut)
  // =========================================================================
  if (hasLogFromContract(CONTRACTS.MONORAIL_ROUTER)) {
    // BEST APPROACH: Parse MonorailSwap event directly
    // MonorailSwap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, ...)
    // - topic2 = tokenIn address (0x0 = native MON)
    // - topic3 = tokenOut address (0x0 = native MON)
    // - data = amountIn (bytes 0-31), amountOut (bytes 32-63)
    const monorailSwapLog = logs.find(
      (l) =>
        l.topic0?.toLowerCase() === TOPICS.MONORAIL_SWAP.toLowerCase() &&
        l.address.toLowerCase() === CONTRACTS.MONORAIL_ROUTER
    );

    if (monorailSwapLog && monorailSwapLog.topic2 && monorailSwapLog.topic3 && monorailSwapLog.data) {
      // Extract tokenIn and tokenOut from indexed topics
      const tokenInAddress = "0x" + monorailSwapLog.topic2.slice(-40).toLowerCase();
      const tokenOutAddress = "0x" + monorailSwapLog.topic3.slice(-40).toLowerCase();

      // Extract amounts from data (each 32 bytes = 64 hex chars)
      const dataHex = monorailSwapLog.data.slice(2); // Remove 0x prefix
      const amountIn = BigInt("0x" + dataHex.slice(0, 64));
      const amountOut = BigInt("0x" + dataHex.slice(64, 128));

      // Determine if tokens are native MON (address 0x0)
      const isTokenInNative = tokenInAddress === "0x0000000000000000000000000000000000000000";
      const isTokenOutNative = tokenOutAddress === "0x0000000000000000000000000000000000000000";

      // Get token info (use WMON price for native MON)
      const tokenInInfo = await getTokenInfo(isTokenInNative ? CONTRACTS.WMON : tokenInAddress);
      const tokenOutInfo = await getTokenInfo(isTokenOutNative ? CONTRACTS.WMON : tokenOutAddress);

      const amountInFormatted = formatUnits(amountIn, tokenInInfo.decimals);
      const amountOutFormatted = formatUnits(amountOut, tokenOutInfo.decimals);

      return {
        type: "swap",
        typeDescription: "Swap",
        protocol: "Monorail",
        tokenIn: {
          address: tokenInAddress,
          symbol: isTokenInNative ? "MON" : tokenInInfo.symbol,
          amount: amountIn.toString(),
          amountFormatted: amountInFormatted,
          valueUsd:
            tokenInInfo.priceUsd > 0
              ? (parseFloat(amountInFormatted) * tokenInInfo.priceUsd).toFixed(2)
              : undefined,
        },
        tokenOut: {
          address: tokenOutAddress,
          symbol: isTokenOutNative ? "MON" : tokenOutInfo.symbol,
          amount: amountOut.toString(),
          amountFormatted: amountOutFormatted,
          valueUsd:
            tokenOutInfo.priceUsd > 0
              ? (parseFloat(amountOutFormatted) * tokenOutInfo.priceUsd).toFixed(2)
              : undefined,
        },
      };
    }

    // FALLBACK: Use ERC20 transfer order if MonorailSwap event not found
    if (erc20Transfers.length >= 1) {
      // Get unique tokens from transfers
      const tokenAddresses = [...new Set(erc20Transfers.map((t) => t.address.toLowerCase()))];

      // For each unique token, find the total amount transferred
      const tokenTotals = new Map<string, { amount: bigint; decimals: number }>();

      for (const transfer of erc20Transfers) {
        const tokenAddress = transfer.address.toLowerCase();
        const amount = BigInt(
          transfer.data && transfer.data.length > 2 ? transfer.data : "0x0"
        );

        if (!tokenTotals.has(tokenAddress)) {
          const info = await getTokenInfo(tokenAddress);
          tokenTotals.set(tokenAddress, { amount: 0n, decimals: info.decimals });
        }
        const total = tokenTotals.get(tokenAddress)!;
        total.amount += amount;
      }

      // Use transfer order: first token = input, last distinct token = output
      const firstTransfer = erc20Transfers[0];
      const firstTokenAddr = firstTransfer.address.toLowerCase();

      // Find last transfer with a DIFFERENT token
      let lastTransfer = erc20Transfers[erc20Transfers.length - 1];
      for (let i = erc20Transfers.length - 1; i >= 0; i--) {
        if (erc20Transfers[i].address.toLowerCase() !== firstTokenAddr) {
          lastTransfer = erc20Transfers[i];
          break;
        }
      }
      const lastTokenAddr = lastTransfer.address.toLowerCase();

      // Only if we have two different tokens
      if (firstTokenAddr !== lastTokenAddr) {
        const tokenInInfo = await getTokenInfo(firstTokenAddr);
        const tokenOutInfo = await getTokenInfo(lastTokenAddr);
        const tokenInTotal = tokenTotals.get(firstTokenAddr)!;
        const tokenOutTotal = tokenTotals.get(lastTokenAddr)!;

        const amountInFormatted = formatUnits(tokenInTotal.amount, tokenInTotal.decimals);
        const amountOutFormatted = formatUnits(tokenOutTotal.amount, tokenOutTotal.decimals);

        return {
          type: "swap",
          typeDescription: "Swap",
          protocol: "Monorail",
          tokenIn: {
            address: firstTokenAddr,
            symbol: tokenInInfo.symbol,
            amount: tokenInTotal.amount.toString(),
            amountFormatted: amountInFormatted,
            valueUsd:
              tokenInInfo.priceUsd > 0
                ? (parseFloat(amountInFormatted) * tokenInInfo.priceUsd).toFixed(2)
                : undefined,
          },
          tokenOut: {
            address: lastTokenAddr,
            symbol: tokenOutInfo.symbol,
            amount: tokenOutTotal.amount.toString(),
            amountFormatted: amountOutFormatted,
            valueUsd:
              tokenOutInfo.priceUsd > 0
                ? (parseFloat(amountOutFormatted) * tokenOutInfo.priceUsd).toFixed(2)
                : undefined,
          },
        };
      }

      // Single ERC20 token fallback - check WMON events for native MON
      const singleInfo = await getTokenInfo(firstTokenAddr);
      const singleTotal = tokenTotals.get(firstTokenAddr)!;
      const singleFormatted = formatUnits(singleTotal.amount, singleTotal.decimals);

      // Check for WMON withdrawal (unwrap to native MON) as output
      const hasWmonWithdrawal = hasEvent(TOPICS.WMON_WITHDRAWAL, CONTRACTS.WMON);
      if (hasWmonWithdrawal) {
        const withdrawalLog = logs.find(
          (l) =>
            l.topic0?.toLowerCase() === TOPICS.WMON_WITHDRAWAL.toLowerCase() &&
            l.address.toLowerCase() === CONTRACTS.WMON
        );

        if (withdrawalLog && withdrawalLog.data) {
          const monAmount = BigInt(withdrawalLog.data);
          const monFormatted = formatUnits(monAmount, 18);
          const monInfo = await getTokenInfo(CONTRACTS.WMON); // Use WMON price for MON

          return {
            type: "swap",
            typeDescription: "Swap",
            protocol: "Monorail",
            tokenIn: {
              address: firstTokenAddr,
              symbol: singleInfo.symbol,
              amount: singleTotal.amount.toString(),
              amountFormatted: singleFormatted,
              valueUsd:
                singleInfo.priceUsd > 0
                  ? (parseFloat(singleFormatted) * singleInfo.priceUsd).toFixed(2)
                  : undefined,
            },
            tokenOut: {
              address: "0x0000000000000000000000000000000000000000",
              symbol: "MON",
              amount: monAmount.toString(),
              amountFormatted: monFormatted,
              valueUsd:
                monInfo.priceUsd > 0
                  ? (parseFloat(monFormatted) * monInfo.priceUsd).toFixed(2)
                  : undefined,
            },
          };
        }
      }

      // Check for WMON deposit (wrap from native MON) as input
      const hasWmonDeposit = hasEvent(TOPICS.WMON_DEPOSIT, CONTRACTS.WMON);
      if (hasWmonDeposit) {
        const depositLog = logs.find(
          (l) =>
            l.topic0?.toLowerCase() === TOPICS.WMON_DEPOSIT.toLowerCase() &&
            l.address.toLowerCase() === CONTRACTS.WMON
        );

        if (depositLog && depositLog.data) {
          const monAmount = BigInt(depositLog.data);
          const monFormatted = formatUnits(monAmount, 18);
          const monInfo = await getTokenInfo(CONTRACTS.WMON);

          return {
            type: "swap",
            typeDescription: "Swap",
            protocol: "Monorail",
            tokenIn: {
              address: "0x0000000000000000000000000000000000000000",
              symbol: "MON",
              amount: monAmount.toString(),
              amountFormatted: monFormatted,
              valueUsd:
                monInfo.priceUsd > 0
                  ? (parseFloat(monFormatted) * monInfo.priceUsd).toFixed(2)
                  : undefined,
            },
            tokenOut: {
              address: firstTokenAddr,
              symbol: singleInfo.symbol,
              amount: singleTotal.amount.toString(),
              amountFormatted: singleFormatted,
              valueUsd:
                singleInfo.priceUsd > 0
                  ? (parseFloat(singleFormatted) * singleInfo.priceUsd).toFixed(2)
                  : undefined,
            },
          };
        }
      }

      // Truly single token swap (rare case)
      return {
        type: "swap",
        typeDescription: "Swap",
        protocol: "Monorail",
        tokenIn: {
          address: firstTokenAddr,
          symbol: singleInfo.symbol,
          amount: singleTotal.amount.toString(),
          amountFormatted: singleFormatted,
        },
      };
    }

    return {
      type: "swap",
      typeDescription: "Swap",
      protocol: "Monorail",
    };
  }

  // =========================================================================
  // 5. Swap - 0x (detect by ERC20 transfers FROM/TO user's smart account)
  // =========================================================================
  // For 0x swaps, we need to:
  // 1. Find ERC20 transfers FROM user (tokenIn)
  // 2. Find ERC20 transfers TO user (tokenOut)
  // 3. If no ERC20 TO user but WMON activity exists, output is native MON

  // Get user's smart account from RedeemedDelegation event
  const redeemedDelegationLog = logs.find(
    (l) => l.topic0?.toLowerCase() === TOPICS.REDEEMED_DELEGATION.toLowerCase()
  );
  const userSmartAccount = redeemedDelegationLog?.topic1
    ? ("0x" + redeemedDelegationLog.topic1.slice(-40)).toLowerCase()
    : null;

  if (userSmartAccount && erc20Transfers.length >= 1) {
    // Find ERC20 transfers FROM user (what user sent = tokenIn)
    const transfersFromUser = erc20Transfers.filter(
      (t) => t.topic1 && ("0x" + t.topic1.slice(-40)).toLowerCase() === userSmartAccount
    );

    // Find ERC20 transfers TO user (what user received = tokenOut)
    const transfersToUser = erc20Transfers.filter(
      (t) => t.topic2 && ("0x" + t.topic2.slice(-40)).toLowerCase() === userSmartAccount
    );

    // If user sent an ERC20 token
    if (transfersFromUser.length > 0) {
      // Get the first token sent by user (this is tokenIn)
      const tokenInTransfer = transfersFromUser[0];
      const tokenInAddr = tokenInTransfer.address.toLowerCase();
      const tokenInInfo = await getTokenInfo(tokenInAddr);

      // Sum all amounts of this token sent by user
      let tokenInAmount = 0n;
      for (const t of transfersFromUser.filter(t => t.address.toLowerCase() === tokenInAddr)) {
        const amt = BigInt(t.data && t.data.length > 2 ? t.data : "0x0");
        tokenInAmount += amt;
      }
      const tokenInFormatted = formatUnits(tokenInAmount, tokenInInfo.decimals);

      // Check if user received an ERC20 token (tokenOut)
      if (transfersToUser.length > 0) {
        // Get the token received by user
        const tokenOutTransfer = transfersToUser[0];
        const tokenOutAddr = tokenOutTransfer.address.toLowerCase();
        const tokenOutInfo = await getTokenInfo(tokenOutAddr);

        // Sum all amounts of this token received by user
        let tokenOutAmount = 0n;
        for (const t of transfersToUser.filter(t => t.address.toLowerCase() === tokenOutAddr)) {
          const amt = BigInt(t.data && t.data.length > 2 ? t.data : "0x0");
          tokenOutAmount += amt;
        }
        const tokenOutFormatted = formatUnits(tokenOutAmount, tokenOutInfo.decimals);

        return {
          type: "swap",
          typeDescription: "Swap",
          protocol: "0x",
          tokenIn: {
            address: tokenInAddr,
            symbol: tokenInInfo.symbol,
            amount: tokenInAmount.toString(),
            amountFormatted: tokenInFormatted,
            valueUsd:
              tokenInInfo.priceUsd > 0
                ? (parseFloat(tokenInFormatted) * tokenInInfo.priceUsd).toFixed(2)
                : undefined,
          },
          tokenOut: {
            address: tokenOutAddr,
            symbol: tokenOutInfo.symbol,
            amount: tokenOutAmount.toString(),
            amountFormatted: tokenOutFormatted,
            valueUsd:
              tokenOutInfo.priceUsd > 0
                ? (parseFloat(tokenOutFormatted) * tokenOutInfo.priceUsd).toFixed(2)
                : undefined,
          },
        };
      }

      // User sent ERC20 but received no ERC20 back
      // Check if there's WMON activity - if so, output is likely native MON
      const hasWmonActivity = hasEvent(TOPICS.WMON_DEPOSIT, CONTRACTS.WMON) ||
                              hasEvent(TOPICS.WMON_WITHDRAWAL, CONTRACTS.WMON);

      if (hasWmonActivity) {
        // Calculate approximate MON output from WMON Withdrawal events
        // Sum all WMON Withdrawal amounts (this is the total native MON produced)
        let totalWmonWithdrawn = 0n;
        for (const l of logs) {
          if (l.topic0?.toLowerCase() === TOPICS.WMON_WITHDRAWAL.toLowerCase() &&
              l.address.toLowerCase() === CONTRACTS.WMON &&
              l.data && l.data.length >= 66) {
            totalWmonWithdrawn += BigInt(l.data);
          }
        }

        // If we have WMON withdrawn, this is likely the native MON output
        if (totalWmonWithdrawn > 0n) {
          const monFormatted = formatUnits(totalWmonWithdrawn, 18);
          const monInfo = await getTokenInfo(CONTRACTS.WMON); // Use WMON price for MON

          return {
            type: "swap",
            typeDescription: "Swap",
            protocol: "0x",
            tokenIn: {
              address: tokenInAddr,
              symbol: tokenInInfo.symbol,
              amount: tokenInAmount.toString(),
              amountFormatted: tokenInFormatted,
              valueUsd:
                tokenInInfo.priceUsd > 0
                  ? (parseFloat(tokenInFormatted) * tokenInInfo.priceUsd).toFixed(2)
                  : undefined,
            },
            tokenOut: {
              address: "0x0000000000000000000000000000000000000000",
              symbol: "MON",
              amount: totalWmonWithdrawn.toString(),
              amountFormatted: monFormatted,
              valueUsd:
                monInfo.priceUsd > 0
                  ? (parseFloat(monFormatted) * monInfo.priceUsd).toFixed(2)
                  : undefined,
            },
          };
        }
      }
    }

    // 5.5. Swap - Native MON input via 0x (WMON Deposit + ERC20 transfer TO user)
    // When user swaps native MON, 0x wraps it internally:
    // - WMON_DEPOSIT event (user's MON wrapped by 0x)
    // - ERC20 Transfer TO user (output token)
    // This case: transfersFromUser.length === 0 (user sent native MON, not ERC20)
    //            transfersToUser.length >= 1 (user received ERC20 token)
    //            WMON_DEPOSIT event present (MON was wrapped internally)
    if (
      transfersFromUser.length === 0 &&
      transfersToUser.length >= 1 &&
      hasEvent(TOPICS.WMON_DEPOSIT, CONTRACTS.WMON)
    ) {
      // Calculate MON input from WMON Deposit events
      let monInputAmount = 0n;
      for (const l of logs) {
        if (
          l.topic0?.toLowerCase() === TOPICS.WMON_DEPOSIT.toLowerCase() &&
          l.address.toLowerCase() === CONTRACTS.WMON &&
          l.data &&
          l.data.length >= 66
        ) {
          monInputAmount += BigInt(l.data);
        }
      }

      if (monInputAmount > 0n) {
        const monInputFormatted = formatUnits(monInputAmount, 18);
        const monInfo = await getTokenInfo(CONTRACTS.WMON);

        // Get output token from transfers TO user
        const tokenOutTransfer = transfersToUser[0];
        const tokenOutAddr = tokenOutTransfer.address.toLowerCase();
        const tokenOutInfo = await getTokenInfo(tokenOutAddr);

        // Sum all amounts of output token received by user
        let tokenOutAmount = 0n;
        for (const t of transfersToUser.filter(
          (t) => t.address.toLowerCase() === tokenOutAddr
        )) {
          const amt = BigInt(t.data && t.data.length > 2 ? t.data : "0x0");
          tokenOutAmount += amt;
        }
        const tokenOutFormatted = formatUnits(
          tokenOutAmount,
          tokenOutInfo.decimals
        );

        return {
          type: "swap",
          typeDescription: "Swap",
          protocol: "0x",
          tokenIn: {
            address: "0x0000000000000000000000000000000000000000",
            symbol: "MON",
            amount: monInputAmount.toString(),
            amountFormatted: monInputFormatted,
            valueUsd:
              monInfo.priceUsd > 0
                ? (parseFloat(monInputFormatted) * monInfo.priceUsd).toFixed(2)
                : undefined,
          },
          tokenOut: {
            address: tokenOutAddr,
            symbol: tokenOutInfo.symbol,
            amount: tokenOutAmount.toString(),
            amountFormatted: tokenOutFormatted,
            valueUsd:
              tokenOutInfo.priceUsd > 0
                ? (parseFloat(tokenOutFormatted) * tokenOutInfo.priceUsd).toFixed(2)
                : undefined,
          },
        };
      }
    }
  }

  // Fallback: use transfer order if smart account detection failed
  if (uniqueTokens.size >= 2) {
    const tokenTotals = new Map<string, { amount: bigint; decimals: number }>();

    for (const transfer of erc20Transfers) {
      const tokenAddress = transfer.address.toLowerCase();
      const amount = BigInt(
        transfer.data && transfer.data.length > 2 ? transfer.data : "0x0"
      );

      if (!tokenTotals.has(tokenAddress)) {
        const info = await getTokenInfo(tokenAddress);
        tokenTotals.set(tokenAddress, { amount: 0n, decimals: info.decimals });
      }
      const total = tokenTotals.get(tokenAddress)!;
      total.amount += amount;
    }

    const firstTransfer = erc20Transfers[0];
    const firstTokenAddr = firstTransfer.address.toLowerCase();

    let lastTransfer = erc20Transfers[erc20Transfers.length - 1];
    for (let i = erc20Transfers.length - 1; i >= 0; i--) {
      if (erc20Transfers[i].address.toLowerCase() !== firstTokenAddr) {
        lastTransfer = erc20Transfers[i];
        break;
      }
    }
    const lastTokenAddr = lastTransfer.address.toLowerCase();

    if (firstTokenAddr !== lastTokenAddr) {
      const tokenInInfo = await getTokenInfo(firstTokenAddr);
      const tokenOutInfo = await getTokenInfo(lastTokenAddr);
      const tokenInTotal = tokenTotals.get(firstTokenAddr)!;
      const tokenOutTotal = tokenTotals.get(lastTokenAddr)!;

      const amountInFormatted = formatUnits(tokenInTotal.amount, tokenInTotal.decimals);
      const amountOutFormatted = formatUnits(tokenOutTotal.amount, tokenOutTotal.decimals);

      return {
        type: "swap",
        typeDescription: "Swap",
        protocol: "0x",
        tokenIn: {
          address: firstTokenAddr,
          symbol: tokenInInfo.symbol,
          amount: tokenInTotal.amount.toString(),
          amountFormatted: amountInFormatted,
          valueUsd:
            tokenInInfo.priceUsd > 0
              ? (parseFloat(amountInFormatted) * tokenInInfo.priceUsd).toFixed(2)
              : undefined,
        },
        tokenOut: {
          address: lastTokenAddr,
          symbol: tokenOutInfo.symbol,
          amount: tokenOutTotal.amount.toString(),
          amountFormatted: amountOutFormatted,
          valueUsd:
            tokenOutInfo.priceUsd > 0
              ? (parseFloat(amountOutFormatted) * tokenOutInfo.priceUsd).toFixed(2)
              : undefined,
        },
      };
    }
  }

  // =========================================================================
  // 6. Wrap (pure WMON Deposit event - without swap)
  // =========================================================================
  const hasWmonDeposit = hasEvent(TOPICS.WMON_DEPOSIT, CONTRACTS.WMON);
  const hasWmonWithdrawal = hasEvent(TOPICS.WMON_WITHDRAWAL, CONTRACTS.WMON);

  if (hasWmonDeposit && !hasWmonWithdrawal && uniqueTokens.size <= 1) {
    const depositLog = logs.find(
      (l) =>
        l.topic0?.toLowerCase() === TOPICS.WMON_DEPOSIT.toLowerCase() &&
        l.address.toLowerCase() === CONTRACTS.WMON
    );

    if (depositLog && depositLog.data && depositLog.data.length >= 66) {
      const amount = BigInt(depositLog.data);
      const amountFormatted = formatUnits(amount, 18);
      const wmonInfo = await getTokenInfo(CONTRACTS.WMON);

      return {
        type: "wrap",
        typeDescription: "Wrap MON",
        protocol: "WMON",
        tokenIn: {
          address: "0x0000000000000000000000000000000000000000",
          symbol: "MON",
          amount: amount.toString(),
          amountFormatted,
          valueUsd:
            wmonInfo.priceUsd > 0
              ? (parseFloat(amountFormatted) * wmonInfo.priceUsd).toFixed(2)
              : undefined,
        },
        tokenOut: {
          address: CONTRACTS.WMON,
          symbol: "WMON",
          amount: amount.toString(),
          amountFormatted,
          valueUsd:
            wmonInfo.priceUsd > 0
              ? (parseFloat(amountFormatted) * wmonInfo.priceUsd).toFixed(2)
              : undefined,
        },
      };
    }
  }

  // =========================================================================
  // 7. Unwrap (pure WMON Withdrawal event - without swap)
  // =========================================================================
  if (hasWmonWithdrawal && !hasWmonDeposit && uniqueTokens.size <= 1) {
    const withdrawalLog = logs.find(
      (l) =>
        l.topic0?.toLowerCase() === TOPICS.WMON_WITHDRAWAL.toLowerCase() &&
        l.address.toLowerCase() === CONTRACTS.WMON
    );

    if (withdrawalLog && withdrawalLog.data && withdrawalLog.data.length >= 66) {
      const amount = BigInt(withdrawalLog.data);
      const amountFormatted = formatUnits(amount, 18);
      const wmonInfo = await getTokenInfo(CONTRACTS.WMON);

      return {
        type: "unwrap",
        typeDescription: "Unwrap WMON",
        protocol: "WMON",
        tokenIn: {
          address: CONTRACTS.WMON,
          symbol: "WMON",
          amount: amount.toString(),
          amountFormatted,
          valueUsd:
            wmonInfo.priceUsd > 0
              ? (parseFloat(amountFormatted) * wmonInfo.priceUsd).toFixed(2)
              : undefined,
        },
        tokenOut: {
          address: "0x0000000000000000000000000000000000000000",
          symbol: "MON",
          amount: amount.toString(),
          amountFormatted,
          valueUsd:
            wmonInfo.priceUsd > 0
              ? (parseFloat(amountFormatted) * wmonInfo.priceUsd).toFixed(2)
              : undefined,
        },
      };
    }
  }

  // =========================================================================
  // 7.5. Unstake Request Fallback (aprMON transfer TO aPriori)
  // In case RedeemRequest event detection fails, detect via aprMON token flow
  // =========================================================================
  const APRMON_ADDRESS = "0xb5a30b0fdc5ea94a52fdc42e3e9760cb8449fb37";
  const aprMonTransferToApriori = erc20Transfers.find(
    (t) =>
      t.address.toLowerCase() === APRMON_ADDRESS &&
      // topic2 is 64 hex chars (32 bytes). Last 40 chars = 20 bytes = address
      ("0x" + t.topic2?.slice(-40)).toLowerCase() === CONTRACTS.APRIORI
  );
  if (aprMonTransferToApriori) {
    const amount = BigInt(
      aprMonTransferToApriori.data && aprMonTransferToApriori.data.length > 2
        ? aprMonTransferToApriori.data
        : "0x0"
    );
    const amountFormatted = formatUnits(amount, 18);
    const aprMonInfo = await getTokenInfo(APRMON_ADDRESS);

    return {
      type: "unstake_request",
      typeDescription: "Unstake Request",
      protocol: "aPriori",
      tokenIn: {
        address: APRMON_ADDRESS,
        symbol: "aprMON",
        amount: amount.toString(),
        amountFormatted,
        valueUsd:
          aprMonInfo.priceUsd > 0
            ? (parseFloat(amountFormatted) * aprMonInfo.priceUsd).toFixed(2)
            : undefined,
      },
    };
  }

  // =========================================================================
  // 8. Transfer (single token outflow)
  // =========================================================================
  if (erc20Transfers.length === 1) {
    const transfer = erc20Transfers[0];
    // Use slice(-40) for robustness - works with or without 0x prefix
    const from = "0x" + (transfer.topic1?.slice(-40) || "");
    const to = "0x" + (transfer.topic2?.slice(-40) || "");
    const amount = BigInt(
      transfer.data && transfer.data.length > 2 ? transfer.data : "0x0"
    );
    const tokenAddress = transfer.address.toLowerCase();

    const tokenInfo = await getTokenInfo(tokenAddress);
    const amountFormatted = formatUnits(amount, tokenInfo.decimals);

    const isOutgoing = from.toLowerCase() === normalizedAccount;

    return {
      type: isOutgoing ? "transfer_out" : "transfer_in",
      typeDescription: isOutgoing ? "Token Transfer" : "Token Received",
      protocol: "ERC20",
      from,  // Include sender
      to,    // Include receiver
      ...(isOutgoing
        ? {
            tokenOut: {
              address: tokenAddress,
              symbol: tokenInfo.symbol,
              amount: amount.toString(),
              amountFormatted,
              valueUsd:
                tokenInfo.priceUsd > 0
                  ? (parseFloat(amountFormatted) * tokenInfo.priceUsd).toFixed(2)
                  : undefined,
            },
            counterparty: to,
          }
        : {
            tokenIn: {
              address: tokenAddress,
              symbol: tokenInfo.symbol,
              amount: amount.toString(),
              amountFormatted,
              valueUsd:
                tokenInfo.priceUsd > 0
                  ? (parseFloat(amountFormatted) * tokenInfo.priceUsd).toFixed(2)
                  : undefined,
            },
            counterparty: from,
          }),
    };
  }

  // =========================================================================
  // 9. Approve (approval without transfers)
  // =========================================================================
  if (hasEvent(TOPICS.APPROVAL) && erc20Transfers.length === 0) {
    const approvalLog = logs.find(
      (l) => l.topic0?.toLowerCase() === TOPICS.APPROVAL.toLowerCase()
    );

    if (approvalLog) {
      const tokenInfo = await getTokenInfo(approvalLog.address);
      // Use slice(-40) for robustness
      const spender = "0x" + (approvalLog.topic2?.slice(-40) || "");

      return {
        type: "approve",
        typeDescription: "Token Approval",
        protocol: "ERC20",
        tokenOut: {
          address: approvalLog.address,
          symbol: tokenInfo.symbol,
          amount: "0",
          amountFormatted: "unlimited",
        },
        counterparty: spender,
      };
    }
  }

  // =========================================================================
  // 10. Native Transfer (IncreasedSpentMap event without token transfers)
  // =========================================================================
  if (
    hasEvent(TOPICS.INCREASED_SPENT_MAP) &&
    erc20Transfers.length === 0 &&
    !hasWmonDeposit &&
    !hasWmonWithdrawal
  ) {
    const spentLog = logs.find(
      (l) => l.topic0?.toLowerCase() === TOPICS.INCREASED_SPENT_MAP.toLowerCase()
    );

    if (spentLog && spentLog.data && spentLog.data.length >= 130) {
      const data = spentLog.data.slice(2);
      // IncreasedSpentMap data: newSpent (32 bytes), delta (32 bytes)
      const delta = BigInt("0x" + (data.slice(64, 128).replace(/^0+/, "") || "0"));
      const amountFormatted = formatUnits(delta, 18);
      const monInfo = await getTokenInfo("0x0000000000000000000000000000000000000000");

      // Extract the actual recipient from the transaction input
      // The IncreasedSpentMap topic1 is the delegation manager, not the recipient
      // The actual recipient is encoded in the execution tuple within redeemDelegations input
      const recipient = extractExecutionTarget(txInput, delta) ||
                        "0x" + (spentLog.topic1?.slice(-40) || "unknown");

      return {
        type: "native_transfer",
        typeDescription: "Native MON Transfer",
        protocol: "MON",
        tokenIn: {
          address: "0x0000000000000000000000000000000000000000",
          symbol: "MON",
          amount: delta.toString(),
          amountFormatted,
          valueUsd:
            monInfo.priceUsd > 0
              ? (parseFloat(amountFormatted) * monInfo.priceUsd).toFixed(2)
              : undefined,
        },
        counterparty: recipient,
      };
    }
  }

  // =========================================================================
  // Unknown
  // =========================================================================
  return {
    type: "unknown",
    typeDescription: "Unknown Transaction",
  };
}

// ============================================================================
// Main Fetch Function
// ============================================================================


/**
 * Fetch on-chain activity for an address (smart account or EOA)
 */
export async function fetchActivity(
  address: Address,
  timeRange: string,
  page: number = 1,
  pageSize: number = 20
): Promise<ActivityResponse> {
  // Step 1: Detect address type
  const addressType = await detectAddressType(address);

  // Step 2: Get current block height
  const currentBlock = await getCurrentBlock();

  // Step 3: Parse time range to block range
  const { fromBlock, toBlock } = parseTimeRange(timeRange, currentBlock);

  const activities: ActivityItem[] = [];

  if (addressType === "smart_account") {
    // Step 4: HyperSync queries (parallel)
    const [pragmaResult, incomingResult] = await Promise.all([
      queryRedeemedDelegationEvents(address, fromBlock, toBlock),
      queryIncomingTransfers(address, fromBlock, toBlock),
    ]);

    // Build block timestamp map from both queries
    const blockMap = new Map<number, number>();
    for (const block of pragmaResult.blocks) {
      blockMap.set(block.number, block.timestamp);
    }
    for (const block of incomingResult.blocks) {
      blockMap.set(block.number, block.timestamp);
    }

    // Step 5: Collect all tx hashes and batch fetch RPC data
    const pragmaTxHashes = [...new Set(pragmaResult.logs.map((l) => l.transaction_hash))];
    const processedTxHashes = new Set(pragmaTxHashes);
    const incomingTxHashes = [...new Set(
      incomingResult.logs
        .map((l) => l.transaction_hash)
        .filter((h) => !processedTxHashes.has(h))
    )];

    // Batch fetch all transaction data in a single RPC call
    const allTxHashes = [...pragmaTxHashes, ...incomingTxHashes];
    const txDataMap = await batchFetchTransactionData(allTxHashes);

    // Step 5b: Pre-fetch token info to warm cache before parallel processing
    const allLogs = [...txDataMap.values()].flatMap((v) => v.logs);
    const tokenAddresses = extractTokenAddresses(allLogs);
    await prefetchTokenInfo(tokenAddresses);

    // Step 5c: Pre-fetch NFT collection names via RPC (fast, no external API)
    const nftContracts = extractNFTContracts(allLogs, address);
    if (nftContracts.size > 0) {
      await batchFetchCollectionNames([...nftContracts]);
    }

    // Step 6: Process Pragma transactions IN PARALLEL (using cached data)
    const pragmaActivities = await Promise.all(
      pragmaTxHashes.map(async (txHash) => {
        const logEntry = pragmaResult.logs.find((l) => l.transaction_hash === txHash);
        if (!logEntry) return null;

        const blockNumber = logEntry.block_number;
        const timestamp = blockMap.get(blockNumber) || await getBlockTimestamp(blockNumber);

        // Use batch-fetched data instead of individual RPC calls
        const txData = txDataMap.get(txHash);
        const txLogs = txData?.logs || [];
        const txInput = txData?.input;

        const classification = await classifyPragmaTransaction(txLogs, address, txInput);

        return {
          txHash,
          blockNumber,
          timestamp,
          type: classification.type,
          typeDescription: classification.typeDescription,
          tokenIn: classification.tokenIn,
          tokenOut: classification.tokenOut,
          protocol: classification.protocol,
          counterparty: classification.counterparty,
          from: classification.from,
          to: classification.to,
          isPragma: true,
        };
      })
    );

    // Filter out nulls and add to activities
    activities.push(...pragmaActivities.filter((a): a is NonNullable<typeof a> => a !== null));

    // Step 7: Process incoming transfers IN PARALLEL (using cached data)

    const incomingActivities = await Promise.all(
      incomingTxHashes.map(async (txHash) => {
        const logEntry = incomingResult.logs.find((l) => l.transaction_hash === txHash);
        if (!logEntry) return null;

        const blockNumber = logEntry.block_number;
        const timestamp = blockMap.get(blockNumber) || await getBlockTimestamp(blockNumber);

        // Use batch-fetched data instead of individual RPC calls
        const txData = txDataMap.get(txHash);
        const txLogs = txData?.logs || [];
        const txInput = txData?.input;

        const classification = await classifyPragmaTransaction(txLogs, address, txInput);

        return {
          txHash,
          blockNumber,
          timestamp,
          type: classification.type,
          typeDescription: classification.typeDescription,
          tokenIn: classification.tokenIn,
          tokenOut: classification.tokenOut,
          protocol: classification.protocol,
          counterparty: classification.counterparty,
          from: classification.from,
          to: classification.to,
          isPragma: false, // Incoming transfers are not Pragma txs
        };
      })
    );

    // Filter out nulls and add to activities
    activities.push(...incomingActivities.filter((a): a is NonNullable<typeof a> => a !== null));
  } else {
    // EOA branch - Query transactions
    const { transactions, blocks } = await queryEOATransactions(
      address,
      fromBlock,
      toBlock
    );

    // Build block timestamp map
    const blockMap = new Map<number, number>();
    for (const block of blocks) {
      blockMap.set(block.number, block.timestamp);
    }

    // Batch fetch all transaction data in a single RPC call
    const txHashes = transactions.map((tx) => tx.hash);
    const txDataMap = await batchFetchTransactionData(txHashes);

    // Pre-fetch token info to warm cache before parallel processing
    const allLogs = [...txDataMap.values()].flatMap((v) => v.logs);
    const tokenAddresses = extractTokenAddresses(allLogs);
    await prefetchTokenInfo(tokenAddresses);

    // Pre-fetch NFT collection names via RPC (fast, no external API)
    const nftContracts = extractNFTContracts(allLogs, address);
    if (nftContracts.size > 0) {
      await batchFetchCollectionNames([...nftContracts]);
    }

    // Process each transaction IN PARALLEL (using cached data)
    const eoaActivities = await Promise.all(
      transactions.map(async (tx) => {
        const blockNumber = tx.block_number;
        const timestamp = blockMap.get(blockNumber) || await getBlockTimestamp(blockNumber);

        // Use batch-fetched data instead of individual RPC calls
        const txData = txDataMap.get(tx.hash);
        const txLogs = txData?.logs || [];
        const txInput = txData?.input;

        // Classify based on logs
        const classification = await classifyPragmaTransaction(
          txLogs,
          address,
          txInput
        );

        return {
          txHash: tx.hash,
          blockNumber,
          timestamp,
          type: classification.type,
          typeDescription: classification.typeDescription,
          tokenIn: classification.tokenIn,
          tokenOut: classification.tokenOut,
          protocol: classification.protocol,
          counterparty: classification.counterparty,
          from: classification.from,
          to: classification.to,
          isPragma: false,
        };
      })
    );

    activities.push(...eoaActivities);
  }

  // Step 8: Sort and deduplicate
  activities.sort((a, b) => b.timestamp - a.timestamp);

  const seen = new Set<string>();
  const uniqueActivities = activities.filter((a) => {
    if (seen.has(a.txHash)) return false;
    seen.add(a.txHash);
    return true;
  });

  // Return ALL activities - UI table handles its own pagination
  const totalCount = uniqueActivities.length;

  return {
    activities: uniqueActivities, // Return ALL, not paginated
    totalCount,
    page: 1, // Always page 1 since we return all
    pageSize: totalCount, // Page size = total
    totalPages: 1, // All in one "page"
    fromBlock,
    toBlock,
    timeRange,
  };
}

/**
 * Fetch a specific number of recent transactions (expanding time ranges as needed)
 */
export async function fetchRecentActivity(
  address: Address,
  count: number = 10
): Promise<ActivityItem[]> {
  const addressType = await detectAddressType(address);
  const currentBlock = await getCurrentBlock();

  const activities: ActivityItem[] = [];

  // Try expanding time ranges until we have enough transactions
  for (const range of TIME_RANGE_STEPS) {
    const fromBlock = Math.max(0, currentBlock - range.blocks);

    if (addressType === "smart_account") {
      const { logs, blocks } = await queryRedeemedDelegationEvents(
        address,
        fromBlock,
        currentBlock
      );

      const blockMap = new Map<number, number>();
      for (const block of blocks) {
        blockMap.set(block.number, block.timestamp);
      }

      const uniqueTxHashes = [...new Set(logs.map((l) => l.transaction_hash))];

      for (const txHash of uniqueTxHashes) {
        // Skip if we already have this tx
        if (activities.some((a) => a.txHash === txHash)) continue;

        const logEntry = logs.find((l) => l.transaction_hash === txHash);
        if (!logEntry) continue;

        const blockNumber = logEntry.block_number;
        let timestamp = blockMap.get(blockNumber);
        if (!timestamp) {
          timestamp = await getBlockTimestamp(blockNumber);
        }

        const [txLogs, txInput] = await Promise.all([
          queryTransactionLogs(txHash),
          getTransactionInput(txHash),
        ]);
        const classification = await classifyPragmaTransaction(txLogs, address, txInput);

        activities.push({
          txHash,
          blockNumber,
          timestamp,
          type: classification.type,
          typeDescription: classification.typeDescription,
          tokenIn: classification.tokenIn,
          tokenOut: classification.tokenOut,
          protocol: classification.protocol,
          counterparty: classification.counterparty,
          from: classification.from,
          to: classification.to,
          isPragma: true,
        });
      }
    }

    // Check if we have enough
    if (activities.length >= count) {
      break;
    }
  }

  // Sort and limit
  activities.sort((a, b) => b.timestamp - a.timestamp);
  return activities.slice(0, count);
}
