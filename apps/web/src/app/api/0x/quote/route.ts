/**
 * 0x Quote API Proxy Route
 *
 * Proxies quote requests to 0x API, adding API key server-side.
 * Requires authenticated request via authMiddleware.
 */

import { NextResponse } from "next/server";
import { getAddress, type Address } from "viem";
import { authMiddleware } from "@/lib/auth/authMiddleware";

const ZERO_X_API_KEY = process.env.ZERO_X_API_KEY;
const ZERO_X_BASE_URL = "https://api.0x.org/swap/allowance-holder/quote";
const MONAD_CHAIN_ID = 143;

interface ZeroXQuoteRequest {
  fromToken: Address;
  toToken: Address;
  amountWei: string;
  sender: Address;
  slippageBps: number;
}

export async function POST(request: Request) {
  // ✅ SECURITY: Authenticate request
  const authError = await authMiddleware(request);
  if (authError) return authError;

  if (!ZERO_X_API_KEY) {
    return NextResponse.json(
      { error: "0x API key is not configured" },
      { status: 500 }
    );
  }

  let body: ZeroXQuoteRequest;
  try {
    body = (await request.json()) as ZeroXQuoteRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!body?.fromToken || !body?.toToken || !body?.amountWei || !body?.sender) {
    return NextResponse.json(
      { error: "Missing required quote parameters" },
      { status: 400 }
    );
  }

  // Convert slippage from bps to decimal (100 bps = 0.01)
  const slippageDecimal = (body.slippageBps ?? 100) / 10000;

  const url = new URL(ZERO_X_BASE_URL);
  url.searchParams.set("chainId", MONAD_CHAIN_ID.toString());
  url.searchParams.set("sellToken", getAddress(body.fromToken));
  url.searchParams.set("buyToken", getAddress(body.toToken));
  url.searchParams.set("sellAmount", body.amountWei);
  url.searchParams.set("taker", getAddress(body.sender));
  url.searchParams.set("slippagePercentage", slippageDecimal.toString());

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "0x-api-key": ZERO_X_API_KEY,
        "0x-version": "v2",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[0x API] Quote failed (${response.status}):`, errorText);
      return NextResponse.json(
        { error: `0x quote request failed: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Return the raw 0x response - client will parse it
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[0x API] Quote error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
