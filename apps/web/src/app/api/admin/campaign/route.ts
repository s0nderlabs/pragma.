/**
 * Admin Campaign API
 *
 * GET: Get active campaign with KPIs
 * POST: Create new campaign
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/admin/auth";
import { getActiveCampaign, createCampaign, getOverviewStats } from "@/lib/admin/queries";

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
    const campaign = await getActiveCampaign();
    const stats = await getOverviewStats();

    if (!campaign) {
      return NextResponse.json({
        campaign: null,
        stats,
        _message: "No active campaign",
      });
    }

    // Calculate progress and projections
    const now = new Date();
    const startDate = new Date(campaign.start_date);
    const endDate = new Date(campaign.end_date);
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const elapsedDays = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const remainingDays = Math.max(0, totalDays - elapsedDays);

    // Calculate projections based on current trajectory
    const dailyRate = {
      users: stats.totalUsers / elapsedDays,
      volume: stats.totalVolume / elapsedDays,
      transactions: stats.totalTransactions / elapsedDays,
    };

    const projected = {
      users: Math.round(stats.totalUsers + dailyRate.users * remainingDays),
      volume: stats.totalVolume + dailyRate.volume * remainingDays,
      transactions: Math.round(stats.totalTransactions + dailyRate.transactions * remainingDays),
    };

    return NextResponse.json({
      campaign,
      stats,
      progress: {
        currentDay: elapsedDays,
        totalDays,
        remainingDays,
        usersProgress: (stats.totalUsers / campaign.target_users) * 100,
        volumeProgress: (stats.totalVolume / Number(campaign.target_volume_usd)) * 100,
        transactionsProgress: (stats.totalTransactions / campaign.target_transactions) * 100,
      },
      projected,
    });
  } catch (error) {
    console.error("[Admin Campaign] Error:", error);

    if (String(error).includes("Missing SUPABASE")) {
      return NextResponse.json({
        campaign: null,
        stats: {
          totalUsers: 0,
          totalVolume: 0,
          totalRevenue: 0,
          totalTransactions: 0,
        },
        _mock: true,
      });
    }

    return NextResponse.json(
      { error: "Failed to fetch campaign" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
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
    const body = await request.json();

    const campaign = await createCampaign({
      name: body.name,
      start_date: body.start_date,
      end_date: body.end_date,
      target_users: body.target_users || 500,
      target_volume_usd: body.target_volume_usd || 275000,
      target_transactions: body.target_transactions || 5000,
      target_retention_pct: body.target_retention_pct || 60,
      pool_total_usd: body.pool_total_usd || 9000,
      pool_cashback_pct: body.pool_cashback_pct || 75,
      pool_prizes_pct: body.pool_prizes_pct || 25,
      is_active: true,
    });

    return NextResponse.json(campaign);
  } catch (error) {
    console.error("[Admin Campaign] Create error:", error);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }
}
