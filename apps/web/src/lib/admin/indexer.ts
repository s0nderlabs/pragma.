/**
 * Admin Indexer - HyperSync Payment Event Indexer
 *
 * Fetches ValidatedPayment events from blockchain via Envio HyperSync
 * and inserts them into Supabase. Designed to be called from API routes.
 *
 * Based on: dev-scripts/admin-indexer/index-payments.ts
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { keccak256, toBytes } from "viem";

// ============================================================================
// Configuration
// ============================================================================

const PRAGMA_FEE_ENFORCER = "0xC0060a7411b5a66ffF4285BEf32e02eCd1Ba9D92".toLowerCase();
const ZERO_X_FEE_ADDRESS = "0x1727568c43303abCcE381B9A873B8913b5F966Ec".toLowerCase();
const APRIORI_ADDRESS = "0x0c65a0bc65a5d819235b71f554d210d3f80e0852".toLowerCase();
const MONORAIL_ROUTER = "0xa68a7f0601effdc65c64d9c47ca1b18d96b4352c".toLowerCase();
const PRAGMA_TREASURY_ADDRESS = (process.env.PRAGMA_TREASURY_ADDRESS || "").toLowerCase();
const HYPERSYNC_URL = process.env.MONAD_HYPERSYNC_URL || "https://monad.hypersync.xyz/query";
const ENVIO_TOKEN = process.env.ENVIO_TOKEN_API;
const MONORAIL_DATA_API_URL = process.env.NEXT_PUBLIC_MONORAIL_DATA_API_URL || "https://api.monorail.xyz/v2";
const ZERO_X_API_KEY = process.env.ZERO_X_API_KEY;
const MONAD_CHAIN_ID = 143;

// Event signatures
const VALIDATED_PAYMENT_SIGNATURE = "ValidatedPayment(address,bytes32,bool,address,address,address,uint256,uint256,uint256,uint256)";
const TRANSFER_SIGNATURE = "Transfer(address,address,uint256)";
const DEPOSIT_SIGNATURE = "Deposit(address,address,uint256,uint256)"; // aPriori stake event
// Seaport OrderFulfilled - for NFT purchase detection (both Seaport 1.5 and 1.6)
const ORDER_FULFILLED_SIGNATURE = "OrderFulfilled(bytes32,address,address,address,(uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256,address)[])";
// Monorail AggregatedTrade - for detecting Monorail swaps vs 0x swaps
const AGGREGATED_TRADE_SIGNATURE = "AggregatedTrade(address,address,address,uint256,uint256)";

// ============================================================================
// Supabase Client
// ============================================================================

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
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

// Hardcoded decimals for known tokens (fallback when API fails)
// This ensures stablecoins don't get calculated with wrong decimals
const KNOWN_TOKEN_DECIMALS: Record<string, number> = {
  // Native/wrapped
  "0x0000000000000000000000000000000000000000": 18, // Native MON
  "0x3bd359c1119da7da1d913d1c4d2b7c461115433a": 18, // WMON
  // Stablecoins (6 decimals)
  "0xe7cd86e13ac4309349f30b3435a9d337750fc82d": 6,  // USDT0
  "0x00000000efe302beaa2b3e6e1b18d08d69a9012a": 6,  // AUSD
  "0xf817257fed379853cde0fa4f97ab987181b1e5ea": 6,  // USDC
  "0x0f0bdebf0f83cd1ee3974779bcb7315f9808c714": 6,  // USDC (alternate)
  // Other known tokens
  "0xee8c0e9f1bffb4eb878d8f15f368a02a35481242": 18, // WETH
};

async function getTokenPrice(tokenAddress: string): Promise<TokenPrice | null> {
  const normalized = tokenAddress.toLowerCase();
  const cached = priceCache.get(normalized);

  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL) {
    return cached;
  }

  try {
    // Native token (MON) - use WMON address for price
    const queryAddress = normalized === "0x0000000000000000000000000000000000000000"
      ? "0x3bd359c1119da7da1d913d1c4d2b7c461115433a" // WMON
      : normalized;

    const response = await fetch(`${MONORAIL_DATA_API_URL}/token/${queryAddress}`);
    if (!response.ok) {
      console.warn(`[Indexer] Failed to fetch price for ${tokenAddress}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const price: TokenPrice = {
      address: normalized,
      symbol: data.symbol || "UNKNOWN",
      decimals: data.decimals ?? 18, // Default to 18 if not provided
      priceUsd: data.usd_per_token || 0,
      fetchedAt: Date.now(),
    };

    priceCache.set(normalized, price);
    return price;
  } catch (error) {
    console.error(`[Indexer] Error fetching price for ${tokenAddress}:`, error);
    return null;
  }
}

// ============================================================================
// HyperSync API
// ============================================================================

interface HypersyncLog {
  block_number: number;
  transaction_hash: string;
  log_index: number;
  topic0: string;
  topic1: string;
  topic2: string;
  topic3: string;
  data: string;
  address?: string; // Token address for Transfer events
}

interface HypersyncBlock {
  number: number;
  timestamp: number;
}

interface HypersyncTrace {
  block_number: number;
  transaction_hash: string;
  trace_index?: number;
  from: string;
  to: string;
  value: string; // hex string of wei amount
}

interface HypersyncResponse {
  data: Array<{
    logs?: HypersyncLog[];
    blocks?: HypersyncBlock[];
    traces?: HypersyncTrace[];
  }>;
  archive_height: number;
  next_block: number;
}

async function queryHypersync(
  fromBlock: number,
  toBlock: number,
  topic0: string
): Promise<{ logs: HypersyncLog[]; blocks: HypersyncBlock[]; nextBlock: number; archiveHeight: number }> {
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
      logs: [
        {
          address: [PRAGMA_FEE_ENFORCER],
          topics: [[topic0]],
        },
      ],
      field_selection: {
        log: ["block_number", "transaction_hash", "log_index", "topic0", "topic1", "topic2", "topic3", "data"],
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

  const logs: HypersyncLog[] = [];
  const blocks: HypersyncBlock[] = [];

  for (const dataItem of result.data) {
    if (dataItem.logs) logs.push(...dataItem.logs);
    if (dataItem.blocks) blocks.push(...dataItem.blocks);
  }

  return {
    logs,
    blocks,
    nextBlock: result.next_block,
    archiveHeight: result.archive_height,
  };
}

async function getArchiveHeight(): Promise<number> {
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
 * Query HyperSync for 0x affiliate Transfer events (from 0x fee address to treasury)
 */
async function query0xTransfers(
  fromBlock: number,
  toBlock: number
): Promise<{ logs: HypersyncLog[]; blocks: HypersyncBlock[] }> {
  if (!ENVIO_TOKEN || !PRAGMA_TREASURY_ADDRESS) {
    return { logs: [], blocks: [] };
  }

  const topic0 = keccak256(toBytes(TRANSFER_SIGNATURE));
  // topic1 = from (0x fee address), topic2 = to (treasury)
  const topic1 = "0x000000000000000000000000" + ZERO_X_FEE_ADDRESS.slice(2);
  const topic2 = "0x000000000000000000000000" + PRAGMA_TREASURY_ADDRESS.slice(2);

  const response = await fetch(HYPERSYNC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENVIO_TOKEN}`,
    },
    body: JSON.stringify({
      from_block: fromBlock,
      to_block: toBlock,
      logs: [
        {
          topics: [[topic0], [topic1], [topic2]],
        },
      ],
      field_selection: {
        log: ["block_number", "transaction_hash", "log_index", "topic0", "topic1", "topic2", "topic3", "data", "address"],
        block: ["number", "timestamp"],
      },
      include_all_blocks: false,
    }),
  });

  if (!response.ok) {
    console.warn(`[Indexer] 0x Transfer query failed: ${response.status}`);
    return { logs: [], blocks: [] };
  }

  const result: HypersyncResponse = await response.json();

  const logs: HypersyncLog[] = [];
  const blocks: HypersyncBlock[] = [];

  for (const dataItem of result.data) {
    if (dataItem.logs) logs.push(...dataItem.logs);
    if (dataItem.blocks) blocks.push(...dataItem.blocks);
  }

  return { logs, blocks };
}

/**
 * Query 0x Trade Analytics API for affiliate fee transactions
 * This is the authoritative source for 0x affiliate revenue data
 */
interface ZeroXTrade {
  transactionHash: string;
  blockNumber: string;
  chainId: number;
  timestamp: number;
  volumeUsd: string;
  taker: string;
  fees: {
    integratorFee: {
      token: string;
      amount: string;
      amountUsd: string;
    } | null;
    zeroExFee: {
      token: string;
      amount: string;
      amountUsd: string | null;
    } | null;
  };
  sellToken: string;
  buyToken: string;
}

interface ZeroXTradeResponse {
  nextCursor: string | null;
  trades: ZeroXTrade[];
}

async function query0xTradeAnalytics(
  startTimestamp?: number,
  endTimestamp?: number
): Promise<ZeroXTrade[]> {
  if (!ZERO_X_API_KEY) {
    console.warn("[Indexer] Missing ZERO_X_API_KEY - skipping 0x Trade Analytics");
    return [];
  }

  const allTrades: ZeroXTrade[] = [];
  let cursor: string | null = null;
  let pageCount = 0;
  const maxPages = 50; // Safety limit

  try {
    do {
      const params = new URLSearchParams();
      params.set("chainId", MONAD_CHAIN_ID.toString());
      if (startTimestamp) params.set("startTimestamp", startTimestamp.toString());
      if (endTimestamp) params.set("endTimestamp", endTimestamp.toString());
      if (cursor) params.set("cursor", cursor);

      const url = `https://api.0x.org/trade-analytics/swap?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          "0x-api-key": ZERO_X_API_KEY,
          "0x-version": "v2",
        },
      });

      if (!response.ok) {
        console.warn(`[Indexer] 0x Trade Analytics failed: ${response.status}`);
        break;
      }

      const data: ZeroXTradeResponse = await response.json();

      // Filter for trades with integrator fees (our affiliate fees)
      const tradesWithFees = data.trades.filter(t => t.fees?.integratorFee);
      allTrades.push(...tradesWithFees);

      cursor = data.nextCursor;
      pageCount++;

      // Small delay to avoid rate limiting
      if (cursor) await new Promise(r => setTimeout(r, 100));

    } while (cursor && pageCount < maxPages);

    console.log(`[Indexer] Fetched ${allTrades.length} 0x trades with affiliate fees`);
    return allTrades;

  } catch (error) {
    console.error("[Indexer] Error querying 0x Trade Analytics:", error);
    return [];
  }
}

/**
 * Query for aPriori Deposit events to detect stake actions
 * Returns a Set of transaction hashes that contain stake events
 */
async function queryStakeEvents(
  fromBlock: number,
  toBlock: number
): Promise<Set<string>> {
  if (!ENVIO_TOKEN) {
    return new Set();
  }

  const topic0 = keccak256(toBytes(DEPOSIT_SIGNATURE));

  const response = await fetch(HYPERSYNC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENVIO_TOKEN}`,
    },
    body: JSON.stringify({
      from_block: fromBlock,
      to_block: toBlock,
      logs: [
        {
          address: [APRIORI_ADDRESS],
          topics: [[topic0]],
        },
      ],
      field_selection: {
        log: ["transaction_hash"],
      },
      include_all_blocks: false,
    }),
  });

  if (!response.ok) {
    console.warn(`[Indexer] Stake events query failed: ${response.status}`);
    return new Set();
  }

  const result: HypersyncResponse = await response.json();

  const stakeTxHashes = new Set<string>();
  for (const dataItem of result.data) {
    if (dataItem.logs) {
      for (const log of dataItem.logs) {
        stakeTxHashes.add(log.transaction_hash.toLowerCase());
      }
    }
  }

  return stakeTxHashes;
}

/**
 * Query HyperSync for Seaport OrderFulfilled events to detect NFT purchases.
 * Returns Set of tx hashes that contain NFT marketplace transactions.
 * Covers both Seaport 1.5 and 1.6 since we don't filter by address.
 */
async function queryNFTPurchaseEvents(
  fromBlock: number,
  toBlock: number
): Promise<Set<string>> {
  if (!ENVIO_TOKEN) {
    return new Set();
  }

  const topic0 = keccak256(toBytes(ORDER_FULFILLED_SIGNATURE));
  const nftTxHashes = new Set<string>();

  // HyperSync returns partial results for large block ranges
  // Chunk into smaller ranges (50k blocks) to ensure complete results
  const CHUNK_SIZE = 50000;
  const totalBlocks = toBlock - fromBlock;
  const numChunks = Math.ceil(totalBlocks / CHUNK_SIZE);

  for (let i = 0; i < numChunks; i++) {
    const chunkFrom = fromBlock + i * CHUNK_SIZE;
    const chunkTo = Math.min(chunkFrom + CHUNK_SIZE - 1, toBlock);

    const response = await fetch(HYPERSYNC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENVIO_TOKEN}`,
      },
      body: JSON.stringify({
        from_block: chunkFrom,
        to_block: chunkTo,
        logs: [
          {
            // Don't filter by address - catch all Seaport versions (1.5, 1.6, etc.)
            topics: [[topic0]],
          },
        ],
        field_selection: {
          log: ["transaction_hash"],
        },
        include_all_blocks: false,
      }),
    });

    if (!response.ok) {
      console.warn(`[Indexer] NFT purchase events query failed for chunk ${i + 1}/${numChunks}: ${response.status}`);
      continue;
    }

    const result: HypersyncResponse = await response.json();

    for (const dataItem of result.data) {
      if (dataItem.logs) {
        for (const log of dataItem.logs) {
          nftTxHashes.add(log.transaction_hash.toLowerCase());
        }
      }
    }
  }

  console.log(`[Indexer] Found ${nftTxHashes.size} NFT purchase transactions (${numChunks} chunks)`);
  return nftTxHashes;
}

/**
 * Query HyperSync for Monorail AggregatedTrade events to detect Monorail swaps.
 * Returns Set of tx hashes that used Monorail router.
 * Swaps WITHOUT this event are classified as 0x swaps.
 */
async function queryMonorailTradeEvents(
  fromBlock: number,
  toBlock: number
): Promise<Set<string>> {
  if (!ENVIO_TOKEN) {
    return new Set();
  }

  const topic0 = keccak256(toBytes(AGGREGATED_TRADE_SIGNATURE));

  const response = await fetch(HYPERSYNC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENVIO_TOKEN}`,
    },
    body: JSON.stringify({
      from_block: fromBlock,
      to_block: toBlock,
      logs: [
        {
          address: [MONORAIL_ROUTER],
          topics: [[topic0]],
        },
      ],
      field_selection: {
        log: ["transaction_hash"],
      },
      include_all_blocks: false,
    }),
  });

  if (!response.ok) {
    console.warn(`[Indexer] Monorail trade events query failed: ${response.status}`);
    return new Set();
  }

  const result: HypersyncResponse = await response.json();

  const monorailTxHashes = new Set<string>();
  for (const dataItem of result.data) {
    if (dataItem.logs) {
      for (const log of dataItem.logs) {
        monorailTxHashes.add(log.transaction_hash.toLowerCase());
      }
    }
  }

  console.log(`[Indexer] Found ${monorailTxHashes.size} Monorail swap transactions`);
  return monorailTxHashes;
}

// ============================================================================
// Event Decoder
// ============================================================================

interface ValidatedPaymentEvent {
  txHash: string;
  blockNumber: number;
  logIndex: number;
  timestamp: Date;
  sender: string;
  delegationHash: string;
  isNative: boolean;
  token: string;
  delegator: string;
  redeemer: string;
  expectedAmount: bigint;
  actualAmount: bigint;
  balanceBefore: bigint;
  balanceAfter: bigint;
}

function decodeValidatedPaymentLog(log: HypersyncLog, blockTimestamp: number): ValidatedPaymentEvent | null {
  try {
    if (!log.topic1 || !log.topic2 || !log.topic3) {
      console.warn(`[Indexer] Missing required topics`);
      return null;
    }

    // Decode indexed params from topics
    const sender = "0x" + log.topic1.slice(26);
    const delegationHash = log.topic2;
    const isNative = log.topic3 !== "0x0000000000000000000000000000000000000000000000000000000000000000";

    // Decode non-indexed params from data
    const data = log.data;
    const dataWithoutPrefix = data.startsWith("0x") ? data.slice(2) : data;
    const chunks: string[] = [];
    for (let i = 0; i < dataWithoutPrefix.length; i += 64) {
      chunks.push(dataWithoutPrefix.slice(i, i + 64));
    }

    if (chunks.length < 7) {
      console.warn(`[Indexer] Invalid data chunks: ${chunks.length}`);
      return null;
    }

    const token = "0x" + chunks[0].slice(24);
    const delegator = "0x" + chunks[1].slice(24);
    const redeemer = "0x" + chunks[2].slice(24);
    const expectedAmount = BigInt("0x" + chunks[3]);
    const actualAmount = BigInt("0x" + chunks[4]);
    const balanceBefore = BigInt("0x" + chunks[5]);
    const balanceAfter = BigInt("0x" + chunks[6]);

    return {
      txHash: log.transaction_hash,
      blockNumber: log.block_number,
      logIndex: log.log_index,
      timestamp: new Date(blockTimestamp * 1000),
      sender,
      delegationHash,
      isNative,
      token,
      delegator,
      redeemer,
      expectedAmount,
      actualAmount,
      balanceBefore,
      balanceAfter,
    };
  } catch (error) {
    console.error(`[Indexer] Error decoding log:`, error);
    return null;
  }
}

/**
 * Decode ERC20 Transfer event for 0x affiliate fees
 */
interface TransferEvent {
  txHash: string;
  blockNumber: number;
  logIndex: number;
  timestamp: Date;
  token: string;
  from: string;
  to: string;
  amount: bigint;
}

function decodeTransferLog(log: HypersyncLog, blockTimestamp: number): TransferEvent | null {
  try {
    if (!log.topic1 || !log.topic2) {
      return null;
    }

    const from = "0x" + log.topic1.slice(26);
    const to = "0x" + log.topic2.slice(26);
    const dataWithoutPrefix = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
    const amount = BigInt("0x" + (dataWithoutPrefix || "0"));

    return {
      txHash: log.transaction_hash,
      blockNumber: log.block_number,
      logIndex: log.log_index,
      timestamp: new Date(blockTimestamp * 1000),
      token: (log.address || "").toLowerCase(),
      from: from.toLowerCase(),
      to: to.toLowerCase(),
      amount,
    };
  } catch (error) {
    console.error(`[Indexer] Error decoding Transfer log:`, error);
    return null;
  }
}

// ============================================================================
// Database Operations
// ============================================================================

interface PaymentRecord {
  tx_hash: string;
  block_number: number;
  log_index: number;
  delegator: string;
  token: string;
  amount_wei: string;
  is_native: boolean;
  timestamp: string;
  token_price_usd: number | null;
  fee_usd: number | null;
  volume_usd: number | null;
  source: "pragma" | "0x" | "monorail" | "apriori" | "opensea";
  action_type: "swap" | "stake" | "unstake_request" | "unstake_claim" | "transfer" | "wrap" | "unwrap" | "nft_buy";
}

async function insertPayments(supabase: SupabaseClient, payments: PaymentRecord[]): Promise<number> {
  if (payments.length === 0) return 0;

  const { data, error } = await supabase
    .from("validated_payments")
    .upsert(payments, { onConflict: "tx_hash,log_index", ignoreDuplicates: false })
    .select();

  if (error) {
    console.error(`[Indexer] Insert error:`, error);
    throw error;
  }

  return data?.length || 0;
}

async function getLastIndexedBlock(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from("validated_payments")
    .select("block_number")
    .order("block_number", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error(`[Indexer] Error getting last block:`, error);
    throw error;
  }

  return data?.block_number || 0;
}

// ============================================================================
// Public API
// ============================================================================

export interface IndexResult {
  success: boolean;
  indexed: number;
  fromBlock: number;
  toBlock: number;
  lastBlock: number;
  duration: number;
  error?: string;
}

/**
 * Run the indexer to fetch and store payment events.
 * Includes:
 * - ValidatedPayment events from PragmaFeeEnforcer
 * - Transfer events from 0x fee address to treasury
 * - Action type detection via aPriori stake events
 *
 * Automatically resumes from the last indexed block.
 */
export async function runIndexer(options: {
  maxBlocks?: number; // Limit blocks per run (default: 500000)
  fromBlock?: number; // Force start from specific block (for re-indexing)
} = {}): Promise<IndexResult> {
  const startTime = Date.now();
  const maxBlocks = options.maxBlocks || 500000;

  try {
    if (!ENVIO_TOKEN) {
      throw new Error("Missing ENVIO_TOKEN_API - required for HyperSync authentication");
    }

    const supabase = getSupabaseAdmin();

    // Determine start block (use provided fromBlock or resume from last indexed)
    let fromBlock: number;
    if (options.fromBlock !== undefined) {
      fromBlock = options.fromBlock;
      console.log(`[Indexer] Force re-indexing from block ${fromBlock}`);
    } else {
      fromBlock = await getLastIndexedBlock(supabase);
      if (fromBlock > 0) {
        fromBlock += 1; // Start from next block
      }
    }

    // Get current chain height
    const archiveHeight = await getArchiveHeight();
    const toBlock = Math.min(fromBlock + maxBlocks, archiveHeight);

    console.log(`[Indexer] Indexing from block ${fromBlock} to ${toBlock}`);

    if (fromBlock >= toBlock) {
      // Log sync even when no blocks to process
      await logSyncOperation(supabase, 0, fromBlock, fromBlock);
      return {
        success: true,
        indexed: 0,
        fromBlock,
        toBlock,
        lastBlock: fromBlock,
        duration: Date.now() - startTime,
      };
    }

    // Query all event types in parallel
    const topic0 = keccak256(toBytes(VALIDATED_PAYMENT_SIGNATURE));

    // Query Pragma events from HyperSync + event detection for classification
    // Also query 0x fee data for integrator fee tracking
    const [pragmaResult, stakeTxHashes, nftTxHashes, monorailTxHashes, zeroXTransfers, zeroXApiTrades] = await Promise.all([
      queryHypersync(fromBlock, toBlock, topic0),
      queryStakeEvents(fromBlock, toBlock),
      queryNFTPurchaseEvents(fromBlock, toBlock), // Seaport OrderFulfilled events
      queryMonorailTradeEvents(fromBlock, toBlock), // Monorail AggregatedTrade events
      query0xTransfers(fromBlock, toBlock), // 0x ERC20 affiliate fee Transfer events
      query0xTradeAnalytics(), // 0x API for native MON fees (paginated, no block filter)
    ]);

    const totalEvents = pragmaResult.logs.length;

    if (totalEvents === 0) {
      // Log sync even when no events found
      await logSyncOperation(supabase, 0, fromBlock, toBlock);
      return {
        success: true,
        indexed: 0,
        fromBlock,
        toBlock,
        lastBlock: toBlock,
        duration: Date.now() - startTime,
      };
    }

    // Filter 0x API trades to only those within our block range
    const zeroXApiTradesInRange = zeroXApiTrades.filter(t => {
      const blockNum = parseInt(t.blockNumber);
      return blockNum >= fromBlock && blockNum <= toBlock;
    });

    console.log(`[Indexer] Found ${pragmaResult.logs.length} ValidatedPayment, ${zeroXTransfers.logs.length} 0x ERC20 transfers, ${zeroXApiTradesInRange.length} 0x API trades, ${stakeTxHashes.size} stake, ${nftTxHashes.size} NFT, ${monorailTxHashes.size} Monorail`);

    // Build block timestamp map from Pragma events
    const blockTimestamps = new Map<number, number>();
    for (const block of pragmaResult.blocks) {
      blockTimestamps.set(block.number, block.timestamp);
    }

    const payments: PaymentRecord[] = [];

    // Process Pragma ValidatedPayment events
    for (const log of pragmaResult.logs) {
      const timestamp = blockTimestamps.get(log.block_number) || Math.floor(Date.now() / 1000);
      const event = decodeValidatedPaymentLog(log, timestamp);

      if (!event) continue;

      // Determine action type based on events in same tx
      // Priority: nft_buy > stake > swap
      const txHashLower = event.txHash.toLowerCase();
      const actionType = nftTxHashes.has(txHashLower)
        ? "nft_buy"
        : stakeTxHashes.has(txHashLower)
          ? "stake"
          : "swap";

      // Source is always "pragma" for ValidatedPayment events
      // 0x integrator fees are tracked separately via 0x Trade Analytics API
      const source = "pragma";

      // Get token price (includes decimals)
      const tokenPrice = await getTokenPrice(event.token);

      // Calculate USD values - use known decimals fallback for stablecoins
      const tokenLower = event.token.toLowerCase();
      const decimals = tokenPrice?.decimals ?? KNOWN_TOKEN_DECIMALS[tokenLower] ?? 18;
      const amountFloat = Number(event.actualAmount) / Math.pow(10, decimals);
      const priceUsd = tokenPrice?.priceUsd || 0;
      const feeUsd = amountFloat * priceUsd;
      // ASSUMPTION: Fee is 1% of trade volume. Update this if fee rate changes.
      // This derives volume from fee: volume = fee / 0.01
      const FEE_RATE = 0.01; // 1% fee
      const volumeUsd = feeUsd / FEE_RATE;

      payments.push({
        tx_hash: event.txHash,
        block_number: event.blockNumber,
        log_index: event.logIndex,
        delegator: event.delegator.toLowerCase(),
        token: event.token.toLowerCase(),
        amount_wei: event.actualAmount.toString(),
        is_native: event.isNative,
        timestamp: event.timestamp.toISOString(),
        token_price_usd: priceUsd > 0 ? priceUsd : null,
        fee_usd: feeUsd > 0 ? feeUsd : null,
        volume_usd: volumeUsd > 0 ? volumeUsd : null,
        source,
        action_type: actionType,
      });
    }

    // =========================================================================
    // Process 0x Integrator Fee Records
    // =========================================================================

    // Build tx_hash → {delegator, action_type} map from pragma payments for 0x fee lookups
    const pragmaRecordByTxHash = new Map<string, { delegator: string; action_type: string }>();
    for (const p of payments) {
      pragmaRecordByTxHash.set(p.tx_hash.toLowerCase(), {
        delegator: p.delegator,
        action_type: p.action_type,
      });
    }

    // Add block timestamps from 0x transfers
    for (const block of zeroXTransfers.blocks) {
      if (!blockTimestamps.has(block.number)) {
        blockTimestamps.set(block.number, block.timestamp);
      }
    }

    // Process 0x ERC20 fee Transfer events
    let zeroXErc20Count = 0;
    for (const log of zeroXTransfers.logs) {
      const timestamp = blockTimestamps.get(log.block_number) || Math.floor(Date.now() / 1000);
      const transfer = decodeTransferLog(log, timestamp);
      if (!transfer) continue;

      // Get pragma record info (delegator + action_type) from same tx
      const pragmaRecord = pragmaRecordByTxHash.get(transfer.txHash.toLowerCase());
      if (!pragmaRecord) {
        console.warn(`[Indexer] No pragma record for 0x transfer: ${transfer.txHash}`);
        continue;
      }

      // Get token price for USD value - use known decimals fallback for stablecoins
      const tokenPrice = await getTokenPrice(transfer.token);
      const transferTokenLower = transfer.token.toLowerCase();
      const decimals = tokenPrice?.decimals ?? KNOWN_TOKEN_DECIMALS[transferTokenLower] ?? 18;
      const amountFloat = Number(transfer.amount) / Math.pow(10, decimals);
      const priceUsd = tokenPrice?.priceUsd || 0;
      const feeUsd = amountFloat * priceUsd;

      payments.push({
        tx_hash: transfer.txHash,
        block_number: transfer.blockNumber,
        log_index: transfer.logIndex, // Use actual log_index from Transfer event
        delegator: pragmaRecord.delegator,
        token: transfer.token.toLowerCase(),
        amount_wei: transfer.amount.toString(),
        is_native: false,
        timestamp: transfer.timestamp.toISOString(),
        token_price_usd: priceUsd > 0 ? priceUsd : null,
        fee_usd: feeUsd > 0 ? feeUsd : null,
        volume_usd: null, // Don't count volume (already counted in pragma record)
        source: "0x",
        action_type: pragmaRecord.action_type as PaymentRecord["action_type"], // Match pragma record's action_type
      });
      zeroXErc20Count++;
    }

    // Process 0x Native MON fee trades (from API)
    const NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    let zeroXNativeCount = 0;
    for (const trade of zeroXApiTradesInRange) {
      // Only process native MON fees (ERC20 fees are handled via HyperSync above)
      const feeToken = trade.fees?.integratorFee?.token?.toLowerCase();
      if (feeToken !== NATIVE_TOKEN) continue;

      // Get pragma record info (delegator + action_type) from same tx
      const pragmaRecord = pragmaRecordByTxHash.get(trade.transactionHash.toLowerCase());
      if (!pragmaRecord) {
        console.warn(`[Indexer] No pragma record for 0x native trade: ${trade.transactionHash}`);
        continue;
      }

      const feeUsd = parseFloat(trade.fees.integratorFee?.amountUsd || "0");

      payments.push({
        tx_hash: trade.transactionHash,
        block_number: parseInt(trade.blockNumber),
        log_index: -1, // Special marker for native fees (no on-chain event)
        delegator: pragmaRecord.delegator,
        token: NATIVE_TOKEN,
        amount_wei: trade.fees.integratorFee?.amount || "0",
        is_native: true,
        timestamp: new Date(trade.timestamp * 1000).toISOString(),
        token_price_usd: null,
        fee_usd: feeUsd > 0 ? feeUsd : null,
        volume_usd: null, // Don't count volume (already counted in pragma record)
        source: "0x",
        action_type: pragmaRecord.action_type as PaymentRecord["action_type"], // Match pragma record's action_type
      });
      zeroXNativeCount++;
    }

    if (zeroXErc20Count > 0 || zeroXNativeCount > 0) {
      console.log(`[Indexer] Added ${zeroXErc20Count} 0x ERC20 fee records, ${zeroXNativeCount} 0x native fee records`);
    }

    // Insert to database
    const inserted = await insertPayments(supabase, payments);

    console.log(`[Indexer] Indexed ${inserted} payments (${pragmaResult.logs.length} pragma + ${zeroXErc20Count} 0x ERC20 + ${zeroXNativeCount} 0x native)`);

    // Log sync operation for accurate timestamp tracking
    await logSyncOperation(supabase, inserted, fromBlock, toBlock);

    return {
      success: true,
      indexed: inserted,
      fromBlock,
      toBlock,
      lastBlock: toBlock,
      duration: Date.now() - startTime,
    };

  } catch (error) {
    console.error(`[Indexer] Error:`, error);
    return {
      success: false,
      indexed: 0,
      fromBlock: 0,
      toBlock: 0,
      lastBlock: 0,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Log a sync operation to the indexer_syncs table.
 */
async function logSyncOperation(
  supabase: SupabaseClient,
  indexedCount: number,
  fromBlock: number,
  toBlock: number
): Promise<void> {
  try {
    const { error } = await supabase
      .from("indexer_syncs")
      .insert({
        synced_at: new Date().toISOString(),
        indexed_count: indexedCount,
        from_block: fromBlock,
        to_block: toBlock,
      });

    if (error) {
      // Table might not exist yet - log warning but don't fail
      console.warn(`[Indexer] Could not log sync operation:`, error.message);
    }
  } catch (error) {
    console.warn(`[Indexer] Error logging sync:`, error);
  }
}

/**
 * Get the last sync timestamp from the database.
 * Queries the indexer_syncs table for accurate sync times.
 * Falls back to validated_payments if indexer_syncs doesn't exist.
 */
export async function getLastSyncTime(): Promise<{ timestamp: string | null; blockNumber: number }> {
  try {
    const supabase = getSupabaseAdmin();

    // Try to get from indexer_syncs first (accurate sync time)
    const { data: syncData, error: syncError } = await supabase
      .from("indexer_syncs")
      .select("synced_at, to_block")
      .order("synced_at", { ascending: false })
      .limit(1)
      .single();

    // If we got a result from indexer_syncs, use it
    if (syncData && !syncError) {
      return {
        timestamp: syncData.synced_at,
        blockNumber: syncData.to_block || 0,
      };
    }

    // Fallback to validated_payments (for backwards compatibility)
    const { data, error } = await supabase
      .from("validated_payments")
      .select("timestamp, block_number")
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return {
      timestamp: data?.timestamp || null,
      blockNumber: data?.block_number || 0,
    };
  } catch (error) {
    console.error(`[Indexer] Error getting last sync time:`, error);
    return { timestamp: null, blockNumber: 0 };
  }
}
