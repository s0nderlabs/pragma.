/**
 * OpenSea Collections API Proxy
 *
 * List NFT collections on Monad chain.
 *
 * Query params:
 * - limit: 1-100 (default: 50)
 * - next: pagination cursor
 * - order_by: ordering field
 * - include_stats: if "true", fetch stats for each collection (volume, floor_price)
 */

import { NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/authMiddleware";

const OPENSEA_API_BASE_URL = "https://api.opensea.io/api/v2";
const OPENSEA_CHAIN = "monad";
const MONORAIL_DATA_API_URL = "https://api.monorail.xyz/v2";
const WETH_ADDRESS = "0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242";

// ============================================================================
// Types
// ============================================================================

interface CollectionStats {
  total: { volume: number; floor_price: number; market_cap: number };
  intervals: Array<{ interval: string; volume: number; sales: number }>;
}

interface CollectionBasic {
  collection: string;
  name: string;
  description?: string;
  image_url?: string;
  opensea_url: string;
  safelist_status: string;
  contracts: Array<{ address: string; chain: string }>;
}

// ============================================================================
// Helpers
// ============================================================================

async function fetchStats(slug: string, apiKey: string): Promise<CollectionStats | null> {
  try {
    const response = await fetch(`${OPENSEA_API_BASE_URL}/collections/${slug}/stats`, {
      headers: { Accept: "application/json", "X-API-KEY": apiKey },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Fetch WETH/MON exchange rate from Monorail
 * Returns MON per 1 ETH (e.g., ~115,000)
 */
async function fetchEthToMonRate(): Promise<number> {
  try {
    const response = await fetch(`${MONORAIL_DATA_API_URL}/token/${WETH_ADDRESS}`);
    if (!response.ok) return 115000; // Fallback rate
    const data = await response.json();
    return parseFloat(data.mon_per_token) || 115000;
  } catch {
    return 115000; // Fallback rate
  }
}

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: Request) {
  // ✅ SECURITY: Authenticate request
  const authError = await authMiddleware(request);
  if (authError) return authError;

  const apiKey = process.env.OPENSEA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OpenSea API key not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit") || "50";
  const next = searchParams.get("next");
  const orderBy = searchParams.get("order_by");
  const includeStats = searchParams.get("include_stats") === "true";

  const params = new URLSearchParams({
    chain: OPENSEA_CHAIN,
    limit,
    order_by: orderBy || "market_cap", // Default to market_cap for top collections
  });
  if (next) params.set("next", next);

  const response = await fetch(`${OPENSEA_API_BASE_URL}/collections?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "X-API-KEY": apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.text().catch(() => response.statusText);
    return NextResponse.json({ error }, { status: response.status });
  }

  const data = (await response.json()) as { collections: CollectionBasic[]; next?: string };

  // If stats not requested, return as-is
  if (!includeStats) {
    return NextResponse.json(data);
  }

  // Fetch WETH/MON rate for accurate volume conversion
  const ethToMonRate = await fetchEthToMonRate();

  // Fetch stats for each collection in parallel
  const collectionsWithStats = await Promise.all(
    data.collections.map(async (coll) => {
      const stats = await fetchStats(coll.collection, apiKey);
      if (!stats) {
        return { ...coll, stats: null };
      }

      const floorPrice = stats.total?.floor_price || 0;
      const marketCap = stats.total?.market_cap || 0;
      const oneDayInterval = stats.intervals?.find((i) => i.interval === "one_day");
      const sales1d = oneDayInterval?.sales || 0;
      const volumeEth = oneDayInterval?.volume || 0;

      // Convert ETH volume to MON using Monorail exchange rate
      const volume1dMon = volumeEth * ethToMonRate;

      return {
        ...coll,
        stats: {
          floor_price: floorPrice,
          market_cap: marketCap,
          sales_1d: sales1d,
          volume_1d: volume1dMon, // Actual volume in MON (converted from ETH)
        },
      };
    })
  );

  return NextResponse.json({ collections: collectionsWithStats, next: data.next });
}
