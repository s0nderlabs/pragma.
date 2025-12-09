/**
 * OpenSea NFTs API Proxy
 *
 * Proxies requests to OpenSea API to:
 * 1. Add API key authentication
 * 2. Avoid CORS issues in browser
 * 3. Rate limit and cache responses
 *
 * Endpoint: GET /api/opensea/nfts?address=0x...&collection=...&limit=20
 */

import { NextResponse } from "next/server";
import { getAddress, type Address } from "viem";
import { authMiddleware } from "@/lib/auth/authMiddleware";

const OPENSEA_API_BASE_URL = "https://api.opensea.io/api/v2";
const OPENSEA_CHAIN = "monad";

export async function GET(request: Request) {
  // ✅ SECURITY: Authenticate request
  const authError = await authMiddleware(request);
  if (authError) return authError;

  // Get API key from environment
  const apiKey = process.env.OPENSEA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenSea API key not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const collection = searchParams.get("collection");
  const limit = searchParams.get("limit") || "20";
  const next = searchParams.get("next");

  if (!address) {
    return NextResponse.json(
      { error: "Missing required address parameter" },
      { status: 400 }
    );
  }

  // Validate address format
  let checksummedAddress: Address;
  try {
    checksummedAddress = getAddress(address);
  } catch {
    return NextResponse.json({ error: "Invalid address format" }, { status: 400 });
  }

  // Build OpenSea API URL
  const params = new URLSearchParams();
  if (collection) params.set("collection", collection);
  if (limit) params.set("limit", Math.min(parseInt(limit, 10), 200).toString());
  if (next) params.set("next", next);

  const queryString = params.toString();
  const url = `${OPENSEA_API_BASE_URL}/chain/${OPENSEA_CHAIN}/account/${checksummedAddress}/nfts${
    queryString ? `?${queryString}` : ""
  }`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-API-KEY": apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      return NextResponse.json(
        { error: `OpenSea API error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
