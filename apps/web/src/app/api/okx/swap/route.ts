/**
 * OKX Swap API Proxy Route
 *
 * Proxies swap requests to OKX DEX API, handling HMAC authentication server-side.
 * Requires authenticated request via authMiddleware.
 */

import crypto from "crypto";
import { NextResponse } from "next/server";
import { getAddress, type Address } from "viem";
import { authMiddleware } from "@/lib/auth/authMiddleware";

const OKX_API_KEY = process.env.OKX_API_KEY;
const OKX_SECRET_KEY = process.env.OKX_SECRET_KEY;
const OKX_PASSPHRASE = process.env.OKX_PASSPHRASE;
const OKX_BASE_URL = "https://web3.okx.com";
const MONAD_CHAIN_INDEX = "143";

interface OkxSwapRequest {
  fromToken: Address;
  toToken: Address;
  amountWei: string;
  sender: Address;
  slippageBps: number;
}

/**
 * Generate HMAC-SHA256 signature for OKX API authentication
 */
function generateSignature(
  timestamp: string,
  method: string,
  requestPath: string,
  query: string
): string {
  const stringToSign = `${timestamp}${method}${requestPath}${query}`;
  return crypto
    .createHmac("sha256", OKX_SECRET_KEY!)
    .update(stringToSign)
    .digest("base64");
}

export async function POST(request: Request) {
  // ✅ SECURITY: Authenticate request
  const authError = await authMiddleware(request);
  if (authError) return authError;

  if (!OKX_API_KEY || !OKX_SECRET_KEY || !OKX_PASSPHRASE) {
    return NextResponse.json(
      { error: "OKX API credentials are not configured" },
      { status: 500 }
    );
  }

  let body: OkxSwapRequest;
  try {
    body = (await request.json()) as OkxSwapRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!body?.fromToken || !body?.toToken || !body?.amountWei || !body?.sender) {
    return NextResponse.json(
      { error: "Missing required swap parameters" },
      { status: 400 }
    );
  }

  // Convert slippage from bps to percentage (100 bps = 1%)
  const slippagePercent = (body.slippageBps ?? 100) / 100;

  const timestamp = new Date().toISOString();
  const requestPath = "/api/v6/dex/aggregator/swap";
  const query = `?chainIndex=${MONAD_CHAIN_INDEX}&fromTokenAddress=${getAddress(body.fromToken)}&toTokenAddress=${getAddress(body.toToken)}&amount=${body.amountWei}&slippagePercent=${slippagePercent}&userWalletAddress=${getAddress(body.sender)}`;

  const signature = generateSignature(timestamp, "GET", requestPath, query);

  try {
    const response = await fetch(`${OKX_BASE_URL}${requestPath}${query}`, {
      method: "GET",
      headers: {
        "OK-ACCESS-KEY": OKX_API_KEY,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": OKX_PASSPHRASE,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OKX API] Swap failed (${response.status}):`, errorText);
      return NextResponse.json(
        { error: `OKX swap request failed: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Check OKX error code
    if (data.code !== "0") {
      console.error(`[OKX API] Error (${data.code}):`, data.msg);
      return NextResponse.json(
        { error: `OKX error: ${data.msg}` },
        { status: 400 }
      );
    }

    // Return the raw OKX response - client will parse it
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[OKX API] Swap error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
