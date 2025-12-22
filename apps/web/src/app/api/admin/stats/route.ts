/**
 * Admin Stats API
 *
 * Returns overview statistics for the admin dashboard.
 * Includes daily stats for charts and recent payments for activity.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/admin/auth";
import { getOverviewStats, getDailyStats, getPayments } from "@/lib/admin/queries";

export async function GET() {
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
    // Fetch all data in parallel
    const [stats, dailyStats, recentPayments] = await Promise.all([
      getOverviewStats(),
      getDailyStats(30),
      getPayments({ limit: 10 }),
    ]);

    return NextResponse.json({
      ...stats,
      dailyStats,
      recentPayments: recentPayments.payments,
    });
  } catch (error) {
    console.error("[Admin Stats] Error:", error);

    // If Supabase is not configured, return mock data for development
    if (String(error).includes("Missing SUPABASE")) {
      return NextResponse.json({
        totalUsers: 0,
        totalVolume: 0,
        totalRevenue: 0,
        totalTransactions: 0,
        users24h: 0,
        volume24h: 0,
        revenue24h: 0,
        dailyStats: [],
        recentPayments: [],
        _mock: true,
        _message: "Supabase not configured. Run the schema and add env vars.",
      });
    }

    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
