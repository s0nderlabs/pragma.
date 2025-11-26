/**
 * GET /api/monorail/price
 *
 * Proxy endpoint for MON/USD price from Monorail Data API.
 * Used as fallback when portfolio API returns $0.00 for MON balance.
 */

import { NextResponse } from "next/server";

const MONORAIL_DATA_API_URL =
  process.env.NEXT_PUBLIC_MONORAIL_DATA_API_URL ?? "https://testnet-api.monorail.xyz/v1";

export async function GET() {
  try {
    const response = await fetch(`${MONORAIL_DATA_API_URL}/symbol/MONUSD`, {
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
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { price: "0", error: message },
      { status: 500 }
    );
  }
}
