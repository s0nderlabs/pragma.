import { NextResponse } from "next/server";
import { getAddress, type Address } from "viem";
import { fetchSingleTokenFromMonorail } from "@pragma/core/monorail/tokens";
import { authMiddleware } from "@/lib/auth/authMiddleware";

import {
  MONORAIL_DATA_API_URL,
} from "../../../../lib/config";

const config = {
  dataApiUrl: MONORAIL_DATA_API_URL,
};

/**
 * GET /api/monorail/token?address=0x...
 *
 * Proxies single token lookup to Monorail Data API.
 * Used by getTokenInfoTool for Tier 2 token resolution.
 */
export async function GET(request: Request) {
  // ✅ SECURITY: Authenticate request
  const authError = await authMiddleware(request);
  if (authError) return authError;

  if (!config.dataApiUrl) {
    return NextResponse.json({ error: "Monorail Data API configuration is missing" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Missing required address parameter" }, { status: 400 });
  }

  let checksummedAddress: Address;
  try {
    checksummedAddress = getAddress(address);
  } catch {
    return NextResponse.json({ error: "Invalid address format" }, { status: 400 });
  }

  try {
    const token = await fetchSingleTokenFromMonorail(checksummedAddress, config);

    if (!token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    return NextResponse.json(token);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[/api/monorail/token] Error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
