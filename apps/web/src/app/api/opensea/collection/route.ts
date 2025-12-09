/**
 * OpenSea Collection API Proxy
 *
 * Get collection info and stats by slug or contract address.
 *
 * Endpoints:
 * - GET /api/opensea/collection?slug=xxx - Get collection by slug
 * - GET /api/opensea/collection?contract=0x... - Get collection by contract (auto-resolves slug)
 */

import { NextResponse } from "next/server";
import { getAddress, type Address } from "viem";
import { authMiddleware } from "@/lib/auth/authMiddleware";

const OPENSEA_API_BASE_URL = "https://api.opensea.io/api/v2";
const OPENSEA_CHAIN = "monad";

interface CollectionStats {
  total_supply: number;
  total_listings: number;
  total_owners: number;
  average_price: number;
  num_reports?: number;
  market_cap?: number;
  floor_price?: number;
  floor_price_symbol?: string;
}

interface Collection {
  collection: string;
  name: string;
  description?: string;
  image_url?: string;
  banner_image_url?: string;
  owner: Address;
  category?: string;
  is_disabled: boolean;
  is_nsfw: boolean;
  opensea_url: string;
  project_url?: string;
  discord_url?: string;
  twitter_username?: string;
  contracts: Array<{
    address: Address;
    chain: string;
  }>;
}

async function fetchOpenSea<T>(endpoint: string, apiKey: string): Promise<T | null> {
  try {
    const response = await fetch(`${OPENSEA_API_BASE_URL}${endpoint}`, {
      headers: {
        Accept: "application/json",
        "X-API-KEY": apiKey,
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  // ✅ SECURITY: Authenticate request
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
  const slug = searchParams.get("slug");
  const contract = searchParams.get("contract");

  if (!slug && !contract) {
    return NextResponse.json(
      { error: "Missing required parameter: slug or contract" },
      { status: 400 }
    );
  }

  let collectionSlug = slug;

  // If contract provided, resolve to slug first
  if (contract && !slug) {
    let checksummedAddress: Address;
    try {
      checksummedAddress = getAddress(contract);
    } catch {
      return NextResponse.json({ error: "Invalid contract address format" }, { status: 400 });
    }

    // Fetch any NFT from the contract to get the collection slug
    const nftEndpoint = `/chain/${OPENSEA_CHAIN}/contract/${checksummedAddress}/nfts/1`;
    const nftData = await fetchOpenSea<{ nft: { collection: string } }>(nftEndpoint, apiKey);

    if (!nftData?.nft?.collection) {
      return NextResponse.json(
        { error: "Collection not found for this contract" },
        { status: 404 }
      );
    }

    collectionSlug = nftData.nft.collection;
  }

  if (!collectionSlug) {
    return NextResponse.json({ error: "Could not resolve collection slug" }, { status: 400 });
  }

  // Fetch collection info and stats in parallel
  const [collection, stats] = await Promise.all([
    fetchOpenSea<Collection>(`/collections/${collectionSlug}`, apiKey),
    fetchOpenSea<CollectionStats>(`/collections/${collectionSlug}/stats`, apiKey),
  ]);

  if (!collection) {
    return NextResponse.json(
      { error: `Collection not found: ${collectionSlug}` },
      { status: 404 }
    );
  }

  // Return combined response
  return NextResponse.json({
    collection: {
      slug: collection.collection,
      name: collection.name,
      description: collection.description,
      image_url: collection.image_url,
      banner_image_url: collection.banner_image_url,
      opensea_url: collection.opensea_url,
      project_url: collection.project_url,
      discord_url: collection.discord_url,
      twitter_username: collection.twitter_username,
      contracts: collection.contracts,
      is_disabled: collection.is_disabled,
      is_nsfw: collection.is_nsfw,
    },
    stats: stats
      ? {
          total_supply: stats.total_supply,
          total_listings: stats.total_listings,
          total_owners: stats.total_owners,
          floor_price: stats.floor_price,
          floor_price_symbol: stats.floor_price_symbol || "MON",
          average_price: stats.average_price,
          market_cap: stats.market_cap,
        }
      : null,
  });
}
