"use client";

/**
 * Admin Dashboard Overview Page
 *
 * Bento-box layout with key metrics, charts, insights, and recent activity.
 */

import { useEffect, useState, useCallback } from "react";
import { TrendingUp, Users, DollarSign, Activity } from "lucide-react";
import {
  AdminShell,
  DataTable,
  VolumeChart,
  BentoGrid,
  BentoCard,
  InsightsCard,
  MiniChart,
  TreasuryCard,
} from "@/components/admin";

interface DailyStats {
  date: string;
  new_accounts: number;
  new_transactors: number;
  active_users: number;
  tx_count: number;
  volume_usd: number;
  fees_usd: number;
}

interface RecentPayment {
  id: number;
  tx_hash: string;
  delegator: string;
  token: string;
  volume_usd: number | null;
  fee_usd: number | null;
  timestamp: string;
  source?: "monorail" | "0x" | "apriori" | "opensea" | "pragma";
  action_type?: "swap" | "stake" | "unstake_request" | "unstake_claim" | "transfer" | "wrap" | "unwrap" | "nft_buy";
}

interface OverviewStats {
  totalUsers: number;
  totalDeployed: number;
  totalVolume: number;
  totalRevenue: number;
  totalTransactions: number;
  users24h: number;
  deployed24h: number;
  volume24h: number;
  revenue24h: number;
  dailyStats: DailyStats[];
  recentPayments: RecentPayment[];
  _mock?: boolean;
  _message?: string;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/admin/stats");
      if (!response.ok) {
        throw new Error("Failed to fetch stats");
      }
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Format small fees with more precision (shows "<$0.01" or actual value)
  const formatFee = (value: number) => {
    if (value === 0) return "$0.00";
    if (value > 0 && value < 0.01) {
      // Show 4 decimal places for tiny fees
      return `$${value.toFixed(4)}`;
    }
    return formatCurrency(value);
  };

  const formatCompact = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  };

  // Format action type for display
  const formatActionType = (actionType?: string): string => {
    const actionMap: Record<string, string> = {
      swap: "Swap",
      stake: "Stake",
      unstake_request: "Unstake Request",
      unstake_claim: "Unstake Claim",
      transfer: "Transfer",
      wrap: "Wrap",
      unwrap: "Unwrap",
      nft_buy: "NFT Buy",
    };
    return actionMap[actionType || "swap"] || "Swap";
  };

  // Prepare mini chart data
  const volumeChartData = (stats?.dailyStats || []).slice(-7).map((d) => ({
    value: Number(d.volume_usd) || 0,
    label: d.date,
  }));

  const feesChartData = (stats?.dailyStats || []).slice(-7).map((d) => ({
    value: Number(d.fees_usd) || 0,
    label: d.date,
  }));

  return (
    <AdminShell title="Overview" description="Key metrics and activity for Pragma" onSyncComplete={fetchStats}>
      {/* Setup Notice */}
      {stats?._mock && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-3xl">
          <p className="text-sm text-amber-800 dark:text-amber-200 font-raleway">
            {stats._message || "Database not configured. Showing placeholder data."}
          </p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-3xl">
          <p className="text-sm text-red-800 dark:text-red-200 font-raleway">{error}</p>
        </div>
      )}

      {/* Bento Grid Layout */}
      <BentoGrid className="mb-6" cols={4}>
        {/* Row 1: 3 stat cards */}
        <BentoCard>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400 font-raleway">
                Total Volume
              </p>
              <p className="text-2xl font-semibold mt-1 tabular-nums text-gray-900 dark:text-white font-cal">
                {isLoading ? "..." : formatCompact(stats?.totalVolume ?? 0)}
              </p>
              {stats?.volume24h ? (
                <p className="text-xs mt-1 text-green-500 dark:text-green-400 font-raleway">
                  +{formatCurrency(stats.volume24h)} (24h)
                </p>
              ) : null}
            </div>
            <TrendingUp className="w-5 h-5 text-[#E07A5F] dark:text-[#c96b52]" />
          </div>
        </BentoCard>

        <BentoCard>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400 font-raleway">
                Total Trades
              </p>
              <p className="text-2xl font-semibold mt-1 tabular-nums text-gray-900 dark:text-white font-cal">
                {isLoading ? "..." : (stats?.totalTransactions ?? 0).toLocaleString()}
              </p>
              <p className="text-xs mt-1 text-gray-500 dark:text-gray-400 font-raleway">All time</p>
            </div>
            <Activity className="w-5 h-5 text-[#3D405B] dark:text-gray-400" />
          </div>
        </BentoCard>

        <BentoCard>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400 font-raleway">
                Active Users
              </p>
              <p className="text-2xl font-semibold mt-1 tabular-nums text-gray-900 dark:text-white font-cal">
                {isLoading ? "..." : (stats?.totalUsers ?? 0).toLocaleString()}
              </p>
              {stats?.users24h ? (
                <p className="text-xs mt-1 text-green-500 dark:text-green-400 font-raleway">
                  +{stats.users24h} active (24h)
                </p>
              ) : null}
              <p className="text-xs mt-1 text-gray-400 dark:text-gray-500 font-raleway">
                {isLoading ? "" : `${stats?.totalDeployed ?? 0} onboarded`}
                {stats?.deployed24h ? ` (+${stats.deployed24h} 24h)` : ""}
              </p>
            </div>
            <Users className="w-5 h-5 text-[#81B29A] dark:text-[#6a9a82]" />
          </div>
        </BentoCard>

        {/* Total Revenue */}
        <BentoCard variant="dark">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium tracking-wide text-white/70 font-raleway">
                Total Revenue
              </p>
              <p className="text-2xl font-semibold mt-1 tabular-nums text-white font-cal">
                {isLoading ? "..." : formatCurrency(stats?.totalRevenue ?? 0)}
              </p>
              {stats?.revenue24h ? (
                <p className="text-xs mt-1 text-green-400 font-raleway">
                  +{formatCurrency(stats.revenue24h)} (24h)
                </p>
              ) : null}
            </div>
            <DollarSign className="w-5 h-5 text-white" />
          </div>
        </BentoCard>

        {/* Row 2: Volume Chart (span-3) + Insights Card */}
        <BentoCard span={3} className="h-[292px]">
          <VolumeChart
            title="Volume Over Time (30 Days)"
            data={(stats?.dailyStats || []).map((d) => ({
              date: d.date,
              value: Number(d.volume_usd) || 0,
            }))}
            valuePrefix="$"
            height={220}
            bare
          />
        </BentoCard>

        {/* Treasury Balance */}
        <TreasuryCard onRefresh={fetchStats} />

        {/* Row 3: TX Chart + Revenue Card + Quick Stats */}
        <BentoCard>
          <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400 mb-2 font-raleway">
            Transactions (7d)
          </p>
          <div className="mt-2">
            <MiniChart
              data={(stats?.dailyStats || []).slice(-7).map((d) => ({
                value: d.tx_count || 0,
                label: d.date,
              }))}
              color="#3D405B"
              height={80}
            />
          </div>
          <p className="text-lg font-semibold mt-2 tabular-nums text-gray-900 dark:text-white font-cal">
            {(stats?.dailyStats || [])
              .slice(-7)
              .reduce((sum, d) => sum + (d.tx_count || 0), 0)
              .toLocaleString()}{" "}
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">txs</span>
          </p>
        </BentoCard>

        <BentoCard>
          <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400 mb-2 font-raleway">
            Revenue (7d)
          </p>
          <div className="mt-2">
            <MiniChart data={feesChartData} color="#E07A5F" height={80} valuePrefix="$" />
          </div>
          <p className="text-lg font-semibold mt-2 tabular-nums text-gray-900 dark:text-white font-cal">
            {formatCurrency(
              (stats?.dailyStats || [])
                .slice(-7)
                .reduce((sum, d) => sum + (Number(d.fees_usd) || 0), 0)
            )}
          </p>
        </BentoCard>

        {/* AI Insights */}
        <InsightsCard
          span={2}
          title="AI Insights"
          insights={[
            stats?.volume24h
              ? `Volume up ${formatCurrency(stats.volume24h)} today`
              : "Collecting data...",
            stats?.users24h
              ? `${stats.users24h} new users joined today`
              : "No new users today",
            "Peak activity typically 2-4 PM UTC",
          ]}
          isLoading={isLoading}
        />

        {/* Row 4: Recent Activity (span-4) */}
        <BentoCard span={4}>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 font-cal tracking-wide">
            Recent Activity
          </h2>
          <DataTable
            maxHeight="calc(100vh - 680px)"
            data={(stats?.recentPayments || []).map((p) => ({
              id: p.id,
              timestamp: new Date(p.timestamp).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }),
              address: p.delegator,
              fullAddress: p.delegator,
              action: formatActionType(p.action_type),
              volume: formatCurrency(Number(p.volume_usd) || 0),
              fee: formatFee(Number(p.fee_usd) || 0),
              tx_hash: p.tx_hash,
              source: p.source,
            }))}
            columns={[
              { key: "timestamp", label: "Time" },
              {
                key: "address",
                label: "Address",
                render: (value: unknown) => (
                  <span className="font-mono text-xs">{String(value)}</span>
                ),
              },
              { key: "action", label: "Action" },
              { key: "volume", label: "Volume", align: "right" as const },
              { key: "fee", label: "Fee", align: "right" as const },
            ]}
            keyExtractor={(row: Record<string, unknown>) => String(row.id)}
            bare
            emptyMessage={
              stats?._mock
                ? "Supabase not configured. Run the schema and add env vars."
                : "No recent activity"
            }
          />
        </BentoCard>
      </BentoGrid>
    </AdminShell>
  );
}
