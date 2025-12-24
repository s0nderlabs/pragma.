/**
 * HyperSync Transaction API Route
 *
 * Fetches and explains a single transaction in detail.
 * Returns comprehensive breakdown of what happened.
 *
 * GET /api/hypersync/transaction?hash=0x...
 */

import { NextResponse } from "next/server";
import { isHex, type Hex } from "viem";
import { authMiddleware } from "@/lib/auth/authMiddleware";
import { explainTransaction } from "@/lib/hypersync/transactionFetcher";

export async function GET(request: Request) {
  // Authenticate request
  const authError = await authMiddleware(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const hash = searchParams.get("hash");

  // Validate hash
  if (!hash) {
    return NextResponse.json(
      { error: "Missing required hash parameter" },
      { status: 400 }
    );
  }

  if (!isHex(hash) || hash.length !== 66) {
    return NextResponse.json(
      { error: "Invalid transaction hash format (expected 0x + 64 hex chars)" },
      { status: 400 }
    );
  }

  try {
    const explanation = await explainTransaction(hash as Hex);

    // Serialize BigInt values to strings for JSON
    const serialized = JSON.parse(
      JSON.stringify(explanation, (_, value) =>
        typeof value === "bigint" ? value.toString() : value
      )
    );

    return NextResponse.json(serialized);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[HyperSync Transaction] Error:", message);

    if (message.includes("not found")) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

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
