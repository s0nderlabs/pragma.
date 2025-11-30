/**
 * GET /api/monorail/price
 *
 * Proxy endpoint for MON/USD price from Monorail Data API.
 * Used as fallback when portfolio API returns $0.00 for MON balance.
 *
 * v2 Migration: /symbol/MONUSD removed, now uses /token/{native} endpoint
 */

import { NextResponse } from "next/server";

const MONORAIL_DATA_API_URL =
  process.env.NEXT_PUBLIC_MONORAIL_DATA_API_URL ?? "https://api.monorail.xyz/v2";

// Native MON token address (zero address)
const NATIVE_MON_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function GET() {
  try {
    // v2: Use /token/{address} endpoint instead of /symbol/MONUSD
    const response = await fetch(`${MONORAIL_DATA_API_URL}/token/${NATIVE_MON_ADDRESS}`, {
      headers: {
        "Content-Type": "application/json",
      },
      // Cache for 30 seconds to avoid hammering the API
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { price: "0", error: `Monorail API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    // v2: Return usd_per_token as price for compatibility
    return NextResponse.json({
      price: data.usd_per_token ?? "0",
      usd_per_token: data.usd_per_token,
      mon_per_token: data.mon_per_token,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { price: "0", error: message },
      { status: 500 }
    );
  }
}
