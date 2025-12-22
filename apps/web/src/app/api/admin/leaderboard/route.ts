/**
 * Admin Leaderboard API
 *
 * GET: Get leaderboard data with projected rewards
 *
 * Reward multiplier is calculated from active campaign:
 *   multiplier = (pool_total_usd × pool_cashback_pct%) / (target_volume_usd × 1% fee)
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/admin/auth";
import { getLeaderboard, getActiveCampaign } from "@/lib/admin/queries";

// Default multiplier if no campaign is active
const DEFAULT_MULTIPLIER = 2.45;

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
    // Fetch leaderboard and active campaign in parallel
    const [result, campaign] = await Promise.all([
      getLeaderboard(),
      getActiveCampaign(),
    ]);

    // Calculate multiplier from campaign settings
    let multiplier = DEFAULT_MULTIPLIER;
    if (campaign) {
      const cashbackPool = Number(campaign.pool_total_usd) * (campaign.pool_cashback_pct / 100);
      const expectedFees = Number(campaign.target_volume_usd) * 0.01; // 1% fee
      if (expectedFees > 0) {
        multiplier = cashbackPool / expectedFees;
      }
    }

    // Recalculate projected rewards with campaign multiplier
    const entriesWithRewards = result.entries.map((entry) => ({
      ...entry,
      projected_reward_usd: Number(entry.total_fees_usd) * multiplier,
    }));

    return NextResponse.json({
      ...result,
      entries: entriesWithRewards,
      campaign: campaign ? {
        name: campaign.name,
        multiplier: multiplier.toFixed(2),
        pool_total_usd: campaign.pool_total_usd,
        pool_cashback_pct: campaign.pool_cashback_pct,
        pool_prizes_pct: campaign.pool_prizes_pct,
        target_volume_usd: campaign.target_volume_usd,
      } : null,
    });
  } catch (error) {
    console.error("[Admin Leaderboard] Error:", error);

    if (String(error).includes("Missing SUPABASE")) {
      return NextResponse.json({
        entries: [],
        total: 0,
        eligibleCount: 0,
        _mock: true,
      });
    }

    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}
