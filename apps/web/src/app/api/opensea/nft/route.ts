/**
 * OpenSea NFT Details API Proxy
 *
 * Get details for a specific NFT by contract and tokenId.
 * Supports BOTH contract address and collection slug for agent compatibility.
 *
 * Endpoints:
 * - GET /api/opensea/nft?contract=0x...&tokenId=42
 * - GET /api/opensea/nft?collection=slug&tokenId=42 (auto-resolves to contract)
 */

import { NextResponse } from "next/server";
import { type Address } from "viem";
import { authMiddleware } from "@/lib/auth/authMiddleware";
import {
  isContractAddress,
  resolveToContractAddress,
} from "@/lib/opensea/resolveCollection";

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

  // Accept either contract address or collection slug
  const identifier = contract || collection;
  if (!identifier) {
    return NextResponse.json(
      { error: "Missing required contract or collection parameter" },
      { status: 400 }
    );
  }

  // Resolve identifier to contract address (handles both formats)
  let contractAddress: Address | null;

  if (isContractAddress(identifier)) {
    // Already a contract address - resolve validates it
    contractAddress = await resolveToContractAddress(identifier, apiKey);
    if (!contractAddress) {
      return NextResponse.json(
        { error: "Invalid contract address format" },
        { status: 400 }
      );
    }
  } else {
    // It's a collection slug - resolve to contract via OpenSea
    contractAddress = await resolveToContractAddress(identifier, apiKey);
    if (!contractAddress) {
      return NextResponse.json(
        { error: `Collection not found: "${identifier}". Check the slug or use contract address.` },
        { status: 404 }
      );
    }
  }

  // Build OpenSea API URL
  const url = `${OPENSEA_API_BASE_URL}/chain/${OPENSEA_CHAIN}/contract/${contractAddress}/nfts/${tokenId}`;

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
