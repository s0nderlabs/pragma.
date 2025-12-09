/**
 * OpenSea Create Listing API Proxy
 *
 * Submit a signed Seaport order to create an NFT listing.
 * Endpoint: POST /api/opensea/create-listing
 *
 * Body: { parameters: SeaportOrderParameters, signature: Hex, protocolAddress: Address }
 * Returns: { order_hash, ... } or error
 */

import { NextResponse } from "next/server";
import { getAddress, type Address, type Hex } from "viem";
import { authMiddleware } from "@/lib/auth/authMiddleware";

const OPENSEA_API_BASE_URL = "https://api.opensea.io/api/v2";
const OPENSEA_CHAIN = "monad";

interface SeaportOfferItem {
  itemType: number;
  token: string;
  identifierOrCriteria: string;
  startAmount: string;
  endAmount: string;
}

interface SeaportConsiderationItem extends SeaportOfferItem {
  recipient: string;
}

interface SeaportOrderParameters {
  offerer: string;
  zone: string;
  offer: SeaportOfferItem[];
  consideration: SeaportConsiderationItem[];
  orderType: number;
  startTime: string;
  endTime: string;
  zoneHash: string;
  salt: string;
  conduitKey: string;
  totalOriginalConsiderationItems: number;
}

interface CreateListingRequestBody {
  parameters: SeaportOrderParameters;
  signature: string;
  protocolAddress: string;
}

export async function POST(request: Request) {
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

  let body: CreateListingRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { parameters, signature, protocolAddress } = body;

  // Validate required fields
  if (!parameters || !signature || !protocolAddress) {
    return NextResponse.json(
      { error: "Missing required parameters: parameters, signature, protocolAddress" },
      { status: 400 }
    );
  }

  // Validate order structure
  if (
    !parameters.offerer ||
    !parameters.offer ||
    !parameters.consideration ||
    parameters.orderType === undefined ||
    !parameters.startTime ||
    !parameters.endTime ||
    !parameters.salt ||
    !parameters.conduitKey
  ) {
    return NextResponse.json(
      { error: "Invalid order parameters structure" },
      { status: 400 }
    );
  }

  // Validate addresses
  let validatedProtocolAddress: Address;
  let validatedOfferer: Address;

  try {
    validatedProtocolAddress = getAddress(protocolAddress);
    validatedOfferer = getAddress(parameters.offerer);
  } catch {
    return NextResponse.json(
      { error: "Invalid address format" },
      { status: 400 }
    );
  }

  // Build OpenSea createListing request
  const createListingRequest = {
    parameters: {
      ...parameters,
      offerer: validatedOfferer,
    },
    signature: signature as Hex,
    protocol_address: validatedProtocolAddress,
  };

  try {
    const url = `${OPENSEA_API_BASE_URL}/orders/${OPENSEA_CHAIN}/seaport/listings`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify(createListingRequest),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      console.error("[create-listing] OpenSea API error:", response.status, errorText);
      return NextResponse.json(
        { error: `OpenSea API error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // OpenSea returns { order: { order_hash, chain, protocol_data, protocol_address } }
    return NextResponse.json({
      success: true,
      order_hash: data.order?.order_hash,
      chain: data.order?.chain,
      protocol_address: data.order?.protocol_address,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[create-listing] Error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
