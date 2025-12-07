/**
 * Get NFT Activity Tool
 *
 * Fetch NFT transaction history from OpenSea Events API.
 * Supports querying by NFT, collection, or account.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getAddress, formatUnits, type Address } from "viem";
import { emitProgress } from "../progress/emitter.js";
import { getMonUsdPrice, formatMonWithUsd } from "./helpers/monPrice.js";

// ============================================================================
// Types
// ============================================================================

interface PaymentInfo {
  quantity: string;
  token_address: string;
  decimals: number;
  symbol: string;
}

interface NFTInfo {
  identifier: string;
  collection: string;
  contract: string;
  name?: string;
  image_url?: string;
}

interface BaseEvent {
  event_type: string;
  event_timestamp: number;
  transaction?: string;
  chain: string;
}

interface OrderEvent extends BaseEvent {
  order_hash: string;
  maker: string;
  taker?: string;
  asset?: NFTInfo;
  payment?: PaymentInfo;
}

interface SaleEvent extends BaseEvent {
  seller: string;
  buyer: string;
  nft: NFTInfo;
  payment: PaymentInfo;
  closing_date: number;
}

interface TransferEvent extends BaseEvent {
  from_address: string;
  to_address: string;
  nft: NFTInfo;
  quantity: number;
}

type AssetEvent = OrderEvent | SaleEvent | TransferEvent;

interface EventsResponse {
  asset_events: AssetEvent[];
  next?: string;
}

// ============================================================================
// Tool Schema
// ============================================================================

const getNFTActivitySchema = z.object({
  mode: z
    .enum(["nft", "collection", "account"])
    .describe("Query mode: 'nft' (contract+tokenId), 'collection' (slug), 'account' (address)"),
  contract: z
    .string()
    .optional()
    .describe("NFT contract address. Required for mode='nft'. Example: '0x6919...'"),
  tokenId: z
    .string()
    .optional()
    .describe("Token ID. Required for mode='nft'. Example: '123'"),
  collection: z
    .string()
    .optional()
    .describe("Collection slug. Required for mode='collection'. Example: 'monad-punks'"),
  account: z
    .string()
    .optional()
    .describe("Account address. For mode='account'. Defaults to user's address if omitted."),
  eventTypes: z
    .array(z.enum(["sale", "transfer", "listing", "offer", "cancel"]))
    .optional()
    .describe("Filter by event types. Default: all types"),
  limit: z
    .number()
    .optional()
    .describe("Max events to return. Default: 20, max: 50"),
});

// ============================================================================
// Helper Functions
// ============================================================================

function formatPrice(payment: PaymentInfo | undefined, monUsdPrice?: number): string {
  if (!payment) return "";
  try {
    const amount = formatUnits(BigInt(payment.quantity), payment.decimals);
    const numAmount = parseFloat(amount);

    // Use USD formatting for MON/WMON
    if (payment.symbol === "MON" || payment.symbol === "WMON") {
      return formatMonWithUsd(numAmount, monUsdPrice);
    }

    return `${numAmount.toFixed(4)} ${payment.symbol}`;
  } catch {
    return "";
  }
}

function formatAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr || "Unknown";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Collect all unique addresses from events for the JSON metadata block
 */
function collectAddresses(events: AssetEvent[]): Record<string, string> {
  const addresses: Record<string, string> = {};

  for (const event of events) {
    // Sale event
    if ("seller" in event && "buyer" in event) {
      if (event.seller) addresses[formatAddress(event.seller)] = event.seller;
      if (event.buyer) addresses[formatAddress(event.buyer)] = event.buyer;
    }
    // Transfer event
    if ("from_address" in event && "to_address" in event) {
      if (event.from_address) addresses[formatAddress(event.from_address)] = event.from_address;
      if (event.to_address) addresses[formatAddress(event.to_address)] = event.to_address;
    }
    // Order event
    if ("maker" in event) {
      const orderEvent = event as OrderEvent;
      if (orderEvent.maker) addresses[formatAddress(orderEvent.maker)] = orderEvent.maker;
      if (orderEvent.taker) addresses[formatAddress(orderEvent.taker)] = orderEvent.taker;
    }
  }

  return addresses;
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts * 1000);
  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleDateString();
}

function formatEvent(event: AssetEvent, monUsdPrice?: number): string {
  const time = formatTimestamp(event.event_timestamp);

  // Sale event
  if ("seller" in event && "buyer" in event) {
    const nftName = event.nft?.name || `#${event.nft?.identifier}`;
    const price = formatPrice(event.payment, monUsdPrice);
    return `**Sale** ${time}\n   ${nftName} sold for ${price}\n   ${formatAddress(event.seller)} -> ${formatAddress(event.buyer)}`;
  }

  // Transfer event
  if ("from_address" in event && "to_address" in event) {
    const nftName = event.nft?.name || `#${event.nft?.identifier}`;
    return `**Transfer** ${time}\n   ${nftName}\n   ${formatAddress(event.from_address)} -> ${formatAddress(event.to_address)}`;
  }

  // Order event (listing/offer/cancel) - this is the last case
  const orderEvent = event as OrderEvent;
  const type = orderEvent.event_type;
  const typeName = type.charAt(0).toUpperCase() + type.slice(1);
  const price = formatPrice(orderEvent.payment, monUsdPrice);
  const nftName = orderEvent.asset?.name || `#${orderEvent.asset?.identifier || "?"}`;
  return `**${typeName}** ${time}\n   ${nftName}${price ? ` for ${price}` : ""}\n   by ${formatAddress(orderEvent.maker)}`;
}

// ============================================================================
// Tool Implementation
// ============================================================================

export const getNFTActivityTool = tool(
  async (input, config) => {
    try {
      const fetchFn = (config?.configurable?.fetch as typeof fetch) || fetch;
      const origin = (config?.configurable?.origin as string) || "";
      const userAddress = config?.configurable?.userAddress as Address | undefined;

      const { mode, contract, tokenId, collection, account, eventTypes, limit = 20 } = input;

      // Validate mode-specific params
      if (mode === "nft" && (!contract || !tokenId)) {
        return "Error: mode='nft' requires contract and tokenId parameters.";
      }
      if (mode === "collection" && !collection) {
        return "Error: mode='collection' requires collection parameter.";
      }

      // For account mode, default to user's address
      let accountAddress: string | undefined;
      if (mode === "account") {
        accountAddress = account || userAddress;
        if (!accountAddress) {
          return "Error: mode='account' requires account parameter or connected wallet.";
        }
      }

      // Build query params
      const params = new URLSearchParams();
      params.set("limit", String(Math.min(limit, 50)));

      if (mode === "nft") {
        try {
          params.set("contract", getAddress(contract as Address));
        } catch {
          return `Error: Invalid contract address format: ${contract}`;
        }
        params.set("tokenId", tokenId!);
      } else if (mode === "collection") {
        params.set("collection", collection!);
      } else if (mode === "account") {
        try {
          params.set("account", getAddress(accountAddress as Address));
        } catch {
          return `Error: Invalid account address format: ${accountAddress}`;
        }
      }

      if (eventTypes && eventTypes.length > 0) {
        params.set("event_type", eventTypes.join(","));
      }

      // Emit progress
      const description =
        mode === "nft"
          ? `Fetching activity for NFT #${tokenId}`
          : mode === "collection"
            ? `Fetching activity for ${collection}`
            : `Fetching your NFT activity`;
      const toolSignature = `getNFTActivity:${mode}:${contract?.slice(0, 10) || collection || accountAddress?.slice(0, 10)}`;
      emitProgress(description, "getNFTActivity", toolSignature, "Getting NFT Activity");

      // Fetch events
      const response = await fetchFn(`${origin}/api/opensea/events?${params.toString()}`);

      if (!response.ok) {
        const error = await response.text().catch(() => response.statusText);
        return `Error fetching activity: ${error}`;
      }

      const data = (await response.json()) as EventsResponse;
      const events = data.asset_events || [];

      if (events.length === 0) {
        return `No activity found for this ${mode}.`;
      }

      // Fetch MON/USD price for formatting
      const monUsdPrice = await getMonUsdPrice(fetchFn, origin);

      // Format output
      const lines: string[] = [];

      if (mode === "nft") {
        lines.push(`**Activity for NFT #${tokenId}**\n`);
      } else if (mode === "collection") {
        lines.push(`**Recent Activity: ${collection}**\n`);
      } else {
        lines.push(`**Your NFT Activity**\n`);
      }

      for (const event of events.slice(0, limit)) {
        lines.push(formatEvent(event, monUsdPrice));
        lines.push(""); // blank line between events
      }

      if (data.next) {
        lines.push(`_Showing ${Math.min(events.length, limit)} most recent events_`);
      }

      // Collect full addresses for agent to use in lookups
      const addressMap = collectAddresses(events.slice(0, limit));

      // Add JSON metadata block with full addresses (hidden from user display)
      const metadata = {
        addressLookup: addressMap,
        note: "Use addressLookup to get full addresses from truncated ones shown above"
      };

      return `${lines.join("\n").trim()}\n\n<!--ACTIVITY_METADATA:${JSON.stringify(metadata)}-->`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[getNFTActivityTool] Error:", errorMessage);
      return `Error fetching NFT activity: ${errorMessage}`;
    }
  },
  {
    name: "getNFTActivity",
    description:
      "Get NFT activity history (sales, transfers, listings). Query by NFT, collection, or account.",
    schema: getNFTActivitySchema,
  }
);
