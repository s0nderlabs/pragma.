/**
 * OpenSea Listings API Proxy
 *
 * Get NFT listings for a collection via OpenSea API.
 * Endpoint: GET /api/opensea/listings?collection=slug&limit=20&maxPrice=10
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
  const limit = searchParams.get("limit") || "20";
  const next = searchParams.get("next");

  if (!collection) {
    return NextResponse.json(
      { error: "Missing required collection parameter" },
      { status: 400 }
    );
  }

  // Build OpenSea API URL for collection listings
  const params = new URLSearchParams();
  params.set("limit", Math.min(parseInt(limit, 10), 100).toString());
  if (next) params.set("next", next);

  const queryString = params.toString();
  const url = `${OPENSEA_API_BASE_URL}/listings/collection/${collection}/all${
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

    // Also fetch NFT details for the listed items
    const listings = data.listings || [];
    const nfts: unknown[] = [];

    // Fetch NFT details for each listing (up to 10 to avoid rate limits)
    const fetchPromises = listings.slice(0, 10).map(async (listing: { protocol_data: { parameters: { offer: Array<{ token: string; identifierOrCriteria: string }> } } }) => {
      try {
        const offer = listing.protocol_data.parameters.offer[0];
        if (!offer) return null;

        // Use metadata endpoint: GET /api/v2/metadata/{chain}/{contractAddress}/{tokenId}
        const nftUrl = `${OPENSEA_API_BASE_URL}/metadata/monad/${offer.token}/${offer.identifierOrCriteria}`;
        const nftResponse = await fetch(nftUrl, {
          headers: {
            Accept: "application/json",
            "X-API-KEY": apiKey,
          },
        });

        if (nftResponse.ok) {
          // Metadata endpoint returns { name, description, image, ... } directly
          const nftData = await nftResponse.json();
          return {
            ...nftData,
            contract: offer.token,
            identifier: offer.identifierOrCriteria,
          };
        }
        return null;
      } catch {
        return null;
      }
    });

    const fetchedNfts = await Promise.all(fetchPromises);
    nfts.push(...fetchedNfts.filter(Boolean));

    return NextResponse.json({
      listings: data.listings || [],
      nfts,
      next: data.next,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
