/**
 * HyperSync Activity API Route
 *
 * Fetches on-chain activity history for a smart account.
 * Uses HyperSync for efficient indexed blockchain queries.
 *
 * GET /api/hypersync/activity?address=0x...&timeRange=2 days&page=1&limit=20
 */

import { NextResponse } from "next/server";
import { getAddress, type Address } from "viem";
import { authMiddleware } from "@/lib/auth/authMiddleware";
import { fetchActivity } from "@/lib/hypersync/activityFetcher";

export async function GET(request: Request) {
  // Authenticate request
  const authError = await authMiddleware(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const timeRange = searchParams.get("timeRange") || "7 days";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  // Validate address
  if (!address) {
    return NextResponse.json(
      { error: "Missing required address parameter" },
      { status: 400 }
    );
  }

  let checksummedAddress: Address;
  try {
    checksummedAddress = getAddress(address);
  } catch {
    return NextResponse.json(
      { error: "Invalid address format" },
      { status: 400 }
    );
  }

  // Validate pagination
  if (page < 1 || limit < 1 || limit > 100) {
    return NextResponse.json(
      { error: "Invalid pagination parameters (page >= 1, 1 <= limit <= 100)" },
      { status: 400 }
    );
  }

  try {
    const result = await fetchActivity(
      checksummedAddress,
      timeRange,
      page,
      limit
    );

    // Serialize BigInt values to strings for JSON
    const serialized = JSON.parse(
      JSON.stringify(result, (_, value) =>
        typeof value === "bigint" ? value.toString() : value
      )
    );

    return NextResponse.json(serialized);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[HyperSync Activity] Error:", message);

    // Handle specific errors
    if (message.includes("ENVIO_TOKEN_API")) {
      return NextResponse.json(
        { error: "HyperSync configuration error" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 502 }
    );
  }
}
