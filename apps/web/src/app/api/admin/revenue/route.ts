/**
 * Admin Revenue API
 *
 * GET: Get revenue statistics
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/admin/auth";
import { getRevenueStats, getDailyStats } from "@/lib/admin/queries";

export async function GET(request: Request) {
  // Verify admin token
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get("days") || "30");

    // Fetch revenue stats and daily stats in parallel
    const [result, dailyStats] = await Promise.all([
      getRevenueStats(days),
      getDailyStats(days),
    ]);

    return NextResponse.json({
      ...result,
      dailyStats,
    });
  } catch (error) {
    console.error("[Admin Revenue] Error:", error);

    if (String(error).includes("Missing SUPABASE")) {
      return NextResponse.json({
        totalRevenue: 0,
        pragmaFees: 0,
        aggregatorRevenue: 0,
        byAggregator: [],
        byToken: [],
        dailyStats: [],
        _mock: true,
      });
    }

    return NextResponse.json(
      { error: "Failed to fetch revenue" },
      { status: 500 }
    );
  }
}
