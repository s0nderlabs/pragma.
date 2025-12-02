import { NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/authMiddleware";

import { MONORAIL_DATA_API_URL } from "../../../../lib/config";

/**
 * GET /api/monorail/search?q=ALLOCA
 *
 * Search tokens by symbol/name using Monorail /tokens?find= endpoint.
 * Returns matching tokens (verified + unverified).
 *
 * Used by getSwapQuoteTool for Tier 3 token resolution (symbol search).
 */
export async function GET(request: Request) {
  // ✅ SECURITY: Authenticate request
  const authError = await authMiddleware(request);
  if (authError) return authError;

  if (!MONORAIL_DATA_API_URL) {
    return NextResponse.json(
      { error: "Monorail Data API configuration is missing" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query || query.length < 2) {
    return NextResponse.json(
      { error: "Query too short (minimum 2 characters)" },
      { status: 400 }
    );
  }

  try {
    // Call Monorail /tokens?find=QUERY
    const response = await fetch(
      `${MONORAIL_DATA_API_URL}/tokens?find=${encodeURIComponent(query)}`,
      { headers: { "content-type": "application/json" } }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      console.error("[/api/monorail/search] Monorail API error:", errorText);
      return NextResponse.json(
        { error: "Token search failed" },
        { status: 502 }
      );
    }

    const tokens = await response.json();
    return NextResponse.json(tokens);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[/api/monorail/search] Error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
