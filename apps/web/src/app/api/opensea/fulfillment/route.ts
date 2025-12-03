/**
 * OpenSea Fulfillment API Proxy
 *
 * Get fulfillment data for executing an NFT purchase via Seaport.
 * Endpoint: POST /api/opensea/fulfillment
 *
 * Returns encoded calldata ready for transaction execution.
 */

import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { authMiddleware } from "@/lib/auth/authMiddleware";
import { transformFulfillmentResponse } from "@pragma/core";

const OPENSEA_API_BASE_URL = "https://api.opensea.io/api/v2";

interface FulfillmentRequestBody {
  orderHash: string;
  chain: string;
  protocolAddress: string;
  fulfillerAddress: string;
  recipient?: string;
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

  let body: FulfillmentRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { orderHash, chain, protocolAddress, fulfillerAddress, recipient } = body;

  if (!orderHash || !chain || !protocolAddress || !fulfillerAddress) {
    return NextResponse.json(
      { error: "Missing required parameters: orderHash, chain, protocolAddress, fulfillerAddress" },
      { status: 400 }
    );
  }

  // Validate addresses
  let validatedProtocolAddress: string;
  let validatedFulfillerAddress: string;
  let validatedRecipient: string | undefined;

  try {
    validatedProtocolAddress = getAddress(protocolAddress);
    validatedFulfillerAddress = getAddress(fulfillerAddress);
    if (recipient) {
      validatedRecipient = getAddress(recipient);
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid address format" },
      { status: 400 }
    );
  }

  // Build fulfillment request
  const fulfillmentRequest = {
    listing: {
      hash: orderHash,
      chain,
      protocol_address: validatedProtocolAddress,
    },
    fulfiller: {
      address: validatedFulfillerAddress,
    },
    ...(validatedRecipient && {
      consideration: {
        recipient: validatedRecipient,
      },
    }),
  };

  try {
    const response = await fetch(`${OPENSEA_API_BASE_URL}/listings/fulfillment_data`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify(fulfillmentRequest),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      return NextResponse.json(
        { error: `OpenSea API error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Transform OpenSea response to encoded calldata
    // The tool expects { calldata: Hex, value: string }
    try {
      const { calldata, value } = transformFulfillmentResponse(data.fulfillment_data);
      return NextResponse.json({ calldata, value });
    } catch (encodeError) {
      const encodeMessage = encodeError instanceof Error ? encodeError.message : String(encodeError);
      return NextResponse.json(
        { error: `Failed to encode Seaport transaction: ${encodeMessage}` },
        { status: 500 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
