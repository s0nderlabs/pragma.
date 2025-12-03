/**
 * OpenSea NFT Details API Proxy
 *
 * Get details for a specific NFT by contract and tokenId.
 * Endpoint: GET /api/opensea/nft?contract=0x...&tokenId=42
 * Alternative: GET /api/opensea/nft?collection=slug&tokenId=42
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
  const contract = searchParams.get("contract");
  const collection = searchParams.get("collection");
  const tokenId = searchParams.get("tokenId");

  if (!tokenId) {
    return NextResponse.json(
      { error: "Missing required tokenId parameter" },
      { status: 400 }
    );
  }

  if (!contract && !collection) {
    return NextResponse.json(
      { error: "Missing required contract or collection parameter" },
      { status: 400 }
    );
  }

  let url: string;

  if (contract) {
    // Validate contract address format
    let checksummedAddress: Address;
    try {
      checksummedAddress = getAddress(contract);
    } catch {
      return NextResponse.json({ error: "Invalid contract address format" }, { status: 400 });
    }
    // Use metadata endpoint for single NFT: GET /api/v2/metadata/{chain}/{contractAddress}/{tokenId}
    url = `${OPENSEA_API_BASE_URL}/metadata/${OPENSEA_CHAIN}/${checksummedAddress}/${tokenId}`;
  } else {
    // Collection slug lookup not supported for single NFT - return error
    return NextResponse.json(
      { error: "Collection slug not supported. Use contract address instead." },
      { status: 400 }
    );
  }

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
