"use client";

/**
 * Admin Leaderboard Page
 *
 * Bento-box layout showing ranked users with projected rewards.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Users, Award, Download, Percent } from "lucide-react";
import {
  AdminShell,
  DataTable,
  BentoGrid,
  BentoCard,
  InsightsCard,
} from "@/components/admin";

interface LeaderboardEntry {
  address: string;
  eoa_address: string | null;
  tx_count: number;
  total_volume_usd: number;
  total_fees_usd: number;
  active_days: number;
  is_flagged: boolean;
  flag_status: string | null;
  projected_reward_usd: number;
  status: "eligible" | "review" | "excluded";
}

interface CampaignInfo {
  name: string;
  multiplier: string;
  pool_total_usd: number;
  pool_cashback_pct: number;
  pool_prizes_pct: number;
  target_volume_usd: number;
}

interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
  eligibleCount: number;
  campaign?: CampaignInfo | null;
  _mock?: boolean;
}

export default function AdminLeaderboardPage() {
  const router = useRouter();
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/admin/leaderboard");
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const formatCurrency = (value: number, decimals: number = 0) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };

  const getRankEmoji = (index: number) => {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return `${index + 1}`;
  };

  const exportToCSV = () => {
    if (!data?.entries || data.entries.length === 0) return;

    // Filter only eligible users for export (Merkl-compatible format)
    const eligibleEntries = data.entries.filter((e) => e.status === "eligible");

    // CSV header
    const headers = ["rank", "address", "volume_usd", "fees_usd", "reward_usd", "tx_count", "active_days"];
    const rows = eligibleEntries.map((entry, index) => [
      index + 1,
      entry.address,
      entry.total_volume_usd.toFixed(2),
      entry.total_fees_usd.toFixed(4),
      entry.projected_reward_usd.toFixed(4),
      entry.tx_count,
      entry.active_days,
    ]);

    // Build CSV content
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `pragma-leaderboard-${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const columns = [
    {
      key: "rank",
      label: "Rank",
      width: "60px",
      render: (_: unknown, row: LeaderboardEntry) => {
        const index = data?.entries.findIndex((e) => e.address === row.address) ?? 0;
        return <span className="font-medium">{getRankEmoji(index)}</span>;
      },
    },
    {
      key: "address",
      label: "Address",
      render: (value: unknown) => (
        <span className="font-mono text-xs">{String(value)}</span>
      ),
    },
    {
      key: "total_volume_usd",
      label: "Volume",
      sortable: true,
      align: "right" as const,
      render: (value: unknown) => formatCurrency(Number(value) || 0),
    },
    {
      key: "total_fees_usd",
      label: "Fees",
      sortable: true,
      align: "right" as const,
      render: (value: unknown) => formatCurrency(Number(value) || 0, 2),
    },
    {
      key: "projected_reward_usd",
      label: "Reward",
      align: "right" as const,
      render: (value: unknown) => (
        <span className="text-green-600 dark:text-green-400 font-medium">
          {formatCurrency(Number(value) || 0, 2)}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      align: "center" as const,
      render: (value: unknown) => {
        const status = String(value);
        if (status === "eligible") {
          return <span className="text-green-600 dark:text-green-400">✓</span>;
        }
        if (status === "review") {
          return <span className="text-amber-600 dark:text-amber-400">⚠</span>;
        }
        return <span className="text-red-600 dark:text-red-400">✗</span>;
      },
    },
  ];

  // Calculate total projected rewards
  const totalRewards = (data?.entries || [])
    .filter((e) => e.status === "eligible")
    .reduce((sum, e) => sum + e.projected_reward_usd, 0);

  return (
    <AdminShell title="Leaderboard" description="Top users ranked by volume" onSyncComplete={fetchLeaderboard}>
      <BentoGrid>
        {/* Row 1: Stats */}
        <BentoCard>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400 font-raleway">
                Active Users
              </p>
              <p className="text-2xl font-semibold mt-1 tabular-nums text-gray-900 dark:text-white font-cal">
                {data?.total ?? 0}
              </p>
              <p className="text-xs mt-1 text-gray-500 dark:text-gray-400 font-raleway">On leaderboard</p>
            </div>
            <Users className="w-5 h-5 text-[#3D405B] dark:text-gray-400" />
          </div>
        </BentoCard>

        <BentoCard>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400 font-raleway">
                Eligible
              </p>
              <p className="text-2xl font-semibold mt-1 tabular-nums text-green-600 dark:text-green-400 font-cal">
                {data?.eligibleCount ?? 0}
              </p>
              <p className="text-xs mt-1 text-gray-500 dark:text-gray-400 font-raleway">For rewards</p>
            </div>
            <Award className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
        </BentoCard>

        <BentoCard variant="dark">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium tracking-wide text-white/70 font-raleway">
                Reward Multiplier
              </p>
              <p className="text-2xl font-semibold mt-1 tabular-nums text-white font-cal">
                {data?.campaign?.multiplier ?? "2.45"}x
              </p>
              <p className="text-xs mt-1 text-white/70 font-raleway">Current campaign</p>
            </div>
            <Percent className="w-5 h-5 text-white" />
          </div>
        </BentoCard>

        {/* Row 2: Pool Split + Insights (span-2 on right) */}
        <BentoCard>
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 font-raleway">
            Pool Split
          </p>
          {data?.campaign ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400 font-raleway">Cashback</span>
                <span className="text-lg font-semibold text-gray-900 dark:text-white font-cal">
                  {data.campaign.pool_cashback_pct}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400 font-raleway">Prizes</span>
                <span className="text-lg font-semibold text-gray-900 dark:text-white font-cal">
                  {data.campaign.pool_prizes_pct}%
                </span>
              </div>
              <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400 font-raleway">Total Pool</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white font-cal">
                    {formatCurrency(data.campaign.pool_total_usd)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 font-raleway">No active campaign</p>
          )}
        </BentoCard>

        <InsightsCard
          span={2}
          title="Leaderboard Insights"
          insights={[
            data?.entries?.[0]
              ? `Top trader: ${data.entries[0].address}`
              : "Collecting data...",
            totalRewards > 0
              ? `Total rewards: ${formatCurrency(totalRewards, 2)}`
              : "Calculating rewards...",
            data?.eligibleCount
              ? `${data.eligibleCount} users qualify`
              : "Checking eligibility...",
          ]}
          isLoading={isLoading}
        />

        {/* Row 3: Leaderboard Table (span-3) */}
        <BentoCard span={3}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white font-cal tracking-wide">
              Rankings
            </h2>
            <button
              onClick={exportToCSV}
              disabled={!data?.entries || data.entries.length === 0}
              className="flex items-center gap-2 px-4 py-2 border border-[#E07A5F] dark:border-[#c96b52] text-[#E07A5F] dark:text-[#c96b52] rounded-xl hover:bg-[#E07A5F] dark:hover:bg-[#c96b52] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-raleway text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
          <DataTable
            data={data?.entries || []}
            columns={columns}
            keyExtractor={(entry) => entry.address}
            onRowClick={(entry) => router.push(`/admin/users/${entry.address}`)}
            isLoading={isLoading}
            bare
            maxHeight="calc(100vh - 520px)"
            emptyMessage={
              data?._mock
                ? "Supabase not configured. Add env vars to see leaderboard."
                : "No users on leaderboard"
            }
          />
        </BentoCard>
      </BentoGrid>
    </AdminShell>
  );
}
