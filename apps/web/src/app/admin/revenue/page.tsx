"use client";

/**
 * Admin Revenue Page
 *
 * Bento-box layout showing revenue breakdown by source and token.
 */

import { useEffect, useState, useCallback } from "react";
import { DollarSign, Percent, TrendingUp } from "lucide-react";
import {
  AdminShell,
  DataTable,
  VolumeChart,
  BentoGrid,
  BentoCard,
  InsightsCard,
  SourcePieChart,
} from "@/components/admin";

interface AggregatorStats {
  date: string;
  aggregator: string;
  tx_count: number;
  volume_usd: number;
  fees_usd: number;
}

interface TokenStats {
  date: string;
  token_address: string;
  token_symbol: string | null;
  tx_count: number;
  volume_usd: number;
  fees_usd: number;
}

interface DailyStats {
  date: string;
  fees_usd: number;
  volume_usd: number;
}

interface RevenueResponse {
  totalRevenue: number;
  pragmaFees: number;
  aggregatorRevenue: number;
  byAggregator: AggregatorStats[];
  byToken: TokenStats[];
  dailyStats: DailyStats[];
  _mock?: boolean;
}

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRevenue = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/admin/revenue");
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Failed to fetch revenue:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRevenue();
  }, [fetchRevenue]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatCompact = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  };

  const formatAddress = (address: string) => {
    return address; // Show full address
  };

  // Aggregate by aggregator
  const aggregatorTotals = (data?.byAggregator || []).reduce(
    (acc, stat) => {
      if (!acc[stat.aggregator]) {
        acc[stat.aggregator] = { tx_count: 0, volume_usd: 0, fees_usd: 0 };
      }
      acc[stat.aggregator].tx_count += stat.tx_count;
      acc[stat.aggregator].volume_usd += Number(stat.volume_usd);
      acc[stat.aggregator].fees_usd += Number(stat.fees_usd);
      return acc;
    },
    {} as Record<string, { tx_count: number; volume_usd: number; fees_usd: number }>
  );

  const aggregatorData = Object.entries(aggregatorTotals).map(([name, stats]) => ({
    name,
    ...stats,
  }));

  // Aggregate by token
  interface TokenAggregate {
    token_address: string;
    token_symbol: string | null;
    tx_count: number;
    volume_usd: number;
    fees_usd: number;
  }

  const tokenTotals = (data?.byToken || []).reduce(
    (acc, stat) => {
      const key = stat.token_address;
      if (!acc[key]) {
        acc[key] = {
          token_address: stat.token_address,
          token_symbol: stat.token_symbol,
          tx_count: 0,
          volume_usd: 0,
          fees_usd: 0,
        };
      }
      acc[key].tx_count += stat.tx_count;
      acc[key].volume_usd += Number(stat.volume_usd);
      acc[key].fees_usd += Number(stat.fees_usd);
      return acc;
    },
    {} as Record<string, TokenAggregate>
  );

  const tokenData = Object.values(tokenTotals).sort(
    (a, b) => b.fees_usd - a.fees_usd
  );

  // Calculate 7-day revenue
  const last7DaysRevenue = (data?.dailyStats || [])
    .slice(-7)
    .reduce((sum, d) => sum + (Number(d.fees_usd) || 0), 0);

  return (
    <AdminShell title="Revenue" description="Revenue breakdown by source and token" onSyncComplete={fetchRevenue}>
      <BentoGrid>
        {/* Row 1: 3 stat cards */}
        <BentoCard>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400 font-raleway">
                Total Revenue
              </p>
              <p className="text-2xl font-semibold mt-1 tabular-nums text-gray-900 dark:text-white font-cal">
                {isLoading ? "..." : formatCompact(data?.totalRevenue ?? 0)}
              </p>
              <p className="text-xs mt-1 text-gray-500 dark:text-gray-400 font-raleway">All time</p>
            </div>
            <DollarSign className="w-5 h-5 text-[#81B29A] dark:text-[#6a9a82]" />
          </div>
        </BentoCard>

        <BentoCard>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400 font-raleway">
                Pragma Fees (1%)
              </p>
              <p className="text-2xl font-semibold mt-1 tabular-nums text-gray-900 dark:text-white font-cal">
                {isLoading ? "..." : formatCompact(data?.pragmaFees ?? 0)}
              </p>
              <p className="text-xs mt-1 text-gray-500 dark:text-gray-400 font-raleway">Protocol revenue</p>
            </div>
            <Percent className="w-5 h-5 text-[#E07A5F] dark:text-[#c96b52]" />
          </div>
        </BentoCard>

        <BentoCard variant="green">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium tracking-wide text-white/70 font-raleway">
                Last 7 Days
              </p>
              <p className="text-2xl font-semibold mt-1 tabular-nums text-white font-cal">
                {isLoading ? "..." : formatCurrency(last7DaysRevenue)}
              </p>
              <p className="text-xs mt-1 text-white/70 font-raleway">Recent revenue</p>
            </div>
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
        </BentoCard>

        {/* Row 2: Revenue Chart (span-2) + Insights */}
        <BentoCard span={2} className="min-h-[320px]">
          <VolumeChart
            title="Fees Over Time (30 Days)"
            data={(data?.dailyStats || []).map((d) => ({
              date: d.date,
              value: Number(d.fees_usd) || 0,
            }))}
            valuePrefix="$"
            color="#81B29A"
            height={260}
            bare
          />
        </BentoCard>

        <InsightsCard
          title="Revenue Insights"
          insights={[
            data?.totalRevenue
              ? `Total earnings: ${formatCurrency(data.totalRevenue)}`
              : "Collecting data...",
            aggregatorData.length > 0
              ? `${aggregatorData[0]?.name || "Primary"} source leads`
              : "No source data yet",
            tokenData.length > 0
              ? `Top token: ${tokenData[0]?.token_symbol || "Unknown"}`
              : "Analyzing tokens...",
          ]}
          isLoading={isLoading}
        />

        {/* Row 3: By Source + By Token (span-2) */}
        <BentoCard>
          <SourcePieChart
            title="By Source"
            data={aggregatorData.map((d) => ({
              name: d.name,
              value: d.fees_usd,
              txCount: d.tx_count,
            }))}
            valuePrefix="$"
            height={180}
          />
        </BentoCard>

        <BentoCard span={2}>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 font-cal tracking-wide">
            By Token
          </h2>
          <DataTable
            maxHeight="calc(100vh - 600px)"
            data={tokenData.slice(0, 10)}
            columns={[
              {
                key: "token_symbol",
                label: "Token",
                render: (value: unknown, row: typeof tokenData[0]) =>
                  value ? (
                    <span className="font-medium">{String(value)}</span>
                  ) : (
                    <span className="font-mono text-xs">{formatAddress(row.token_address)}</span>
                  ),
              },
              {
                key: "tx_count",
                label: "Transactions",
                align: "right" as const,
              },
              {
                key: "volume_usd",
                label: "Volume",
                align: "right" as const,
                render: (value: unknown) => formatCurrency(Number(value) || 0),
              },
              {
                key: "fees_usd",
                label: "Fees",
                align: "right" as const,
                render: (value: unknown) => formatCurrency(Number(value) || 0),
              },
            ]}
            keyExtractor={(row) => row.token_address}
            bare
            emptyMessage={data?._mock ? "Supabase not configured" : "No token data"}
          />
        </BentoCard>
      </BentoGrid>
    </AdminShell>
  );
}
