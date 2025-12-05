/**
 * OpenSea Events API Proxy
 *
 * Fetch NFT activity history by NFT, collection, or account.
 *
 * Endpoints:
 * - GET /api/opensea/events?contract=0x...&tokenId=123 - Events by NFT
 * - GET /api/opensea/events?collection=slug - Events by collection
 * - GET /api/opensea/events?account=0x... - Events by account
 *
 * Common query params:
 * - event_type: comma-separated list (sale,transfer,listing,offer,cancel)
 * - limit: 1-200 (default: 50)
 * - next: pagination cursor
 */

import { NextResponse } from "next/server";
import { getAddress, type Address } from "viem";
import { authMiddleware } from "@/lib/auth/authMiddleware";

const OPENSEA_API_BASE_URL = "https://api.opensea.io/api/v2";
const OPENSEA_CHAIN = "monad";

export async function GET(request: Request) {
  // Authenticate request
  const authError = await authMiddleware(request);
  if (authError) return authError;

  const apiKey = process.env.OPENSEA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenSea API key not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const contract = searchParams.get("contract");
  const tokenId = searchParams.get("tokenId");
  const collection = searchParams.get("collection");
  const account = searchParams.get("account");
  const eventTypes = searchParams.get("event_type"); // comma-separated
  const limit = searchParams.get("limit") || "50";
  const next = searchParams.get("next");

  // Build URL based on mode
  let url: string;

  if (contract && tokenId) {
    // Mode: By NFT
    let checksummed: Address;
    try {
      checksummed = getAddress(contract);
    } catch {
      return NextResponse.json(
        { error: "Invalid contract address format" },
        { status: 400 }
      );
    }
    url = `${OPENSEA_API_BASE_URL}/events/chain/${OPENSEA_CHAIN}/contract/${checksummed}/nfts/${tokenId}`;
  } else if (collection) {
    // Mode: By Collection
    url = `${OPENSEA_API_BASE_URL}/events/collection/${collection}`;
  } else if (account) {
    // Mode: By Account
    let checksummed: Address;
    try {
      checksummed = getAddress(account);
    } catch {
      return NextResponse.json(
        { error: "Invalid account address format" },
        { status: 400 }
      );
    }
    url = `${OPENSEA_API_BASE_URL}/events/accounts/${checksummed}`;
  } else {
    return NextResponse.json(
      { error: "Missing required params: (contract + tokenId), collection, or account" },
      { status: 400 }
    );
  }

  // Add query params
  const params = new URLSearchParams({ limit });
  if (eventTypes) {
    eventTypes.split(",").forEach((type) => params.append("event_type", type.trim()));
  }
  if (next) params.set("next", next);
  // Account endpoint supports chain filter
  if (account) params.set("chain", OPENSEA_CHAIN);

  try {
    const response = await fetch(`${url}?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        "X-API-KEY": apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      return NextResponse.json({ error }, { status: response.status });
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
