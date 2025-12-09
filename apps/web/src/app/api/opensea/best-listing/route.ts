/**
 * OpenSea Best Listing API Proxy
 *
 * Get the best (lowest price) listing for a specific NFT.
 * Endpoint: GET /api/opensea/best-listing?collection=slug&tokenId=42
 */

import { NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/authMiddleware";

const OPENSEA_API_BASE_URL = "https://api.opensea.io/api/v2";

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
  const collection = searchParams.get("collection");
  const tokenId = searchParams.get("tokenId");

  if (!collection || !tokenId) {
    return NextResponse.json(
      { error: "Missing required collection or tokenId parameter" },
      { status: 400 }
    );
  }

  // Build OpenSea API URL for best listing
  const url = `${OPENSEA_API_BASE_URL}/listings/collection/${collection}/nfts/${tokenId}/best`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-API-KEY": apiKey,
      },
    });

    if (response.status === 404) {
      return NextResponse.json(
        { error: "No listing found for this NFT" },
        { status: 404 }
      );
    }

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
