"use client";

/**
 * Admin Campaign Page
 *
 * Bento-box layout showing campaign KPIs, progress, and projections.
 */

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Calendar, Target, Users, TrendingUp, DollarSign, Award, AlertTriangle } from "lucide-react";
import { AdminShell, BentoGrid, BentoCard } from "@/components/admin";

interface Campaign {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  target_users: number;
  target_volume_usd: number;
  target_transactions: number;
  target_retention_pct: number;
  pool_total_usd: number;
  pool_cashback_pct: number;
  pool_prizes_pct: number;
  is_active: boolean;
}

interface CampaignResponse {
  campaign: Campaign | null;
  stats: {
    totalUsers: number;
    totalVolume: number;
    totalRevenue: number;
    totalTransactions: number;
  };
  progress?: {
    currentDay: number;
    totalDays: number;
    remainingDays: number;
    usersProgress: number;
    volumeProgress: number;
    transactionsProgress: number;
  };
  projected?: {
    users: number;
    volume: number;
    transactions: number;
  };
  _mock?: boolean;
  _message?: string;
}

export default function AdminCampaignPage() {
  const [data, setData] = useState<CampaignResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCampaign = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/admin/campaign");
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Failed to fetch campaign:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatCompact = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const campaign = data?.campaign;
  const progress = data?.progress;
  const projected = data?.projected;
  const stats = data?.stats;

  // No Campaign State
  if (!isLoading && !campaign) {
    return (
      <AdminShell title="Campaign" description="Track campaign progress and KPIs" onSyncComplete={fetchCampaign}>
        <BentoGrid>
          <BentoCard span={3}>
            <div className="flex flex-col items-center justify-center py-12">
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 mb-4">
                <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 font-cal">
                No Active Campaign
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6 text-center max-w-md font-raleway">
                {data?._message || data?._mock
                  ? "Supabase not configured. Add env vars to manage campaigns."
                  : "Create a new campaign to start tracking KPIs."}
              </p>
              {!data?._mock && (
                <button className="px-6 py-3 bg-[#E07A5F] dark:bg-[#c96b52] text-white rounded-xl hover:bg-[#d06a4f] dark:hover:bg-[#b45e47] transition-colors font-raleway font-medium">
                  Create Campaign
                </button>
              )}
            </div>
          </BentoCard>
        </BentoGrid>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Campaign" description="Track campaign progress and KPIs" onSyncComplete={fetchCampaign}>
      <BentoGrid>
        {/* Row 1: Campaign Header + Progress Overview */}
        <BentoCard>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 font-raleway">
                Campaign
              </p>
              <h2 className="text-xl font-semibold mt-1 text-gray-900 dark:text-white font-cal">
                {campaign?.name || "Loading..."}
              </h2>
            </div>
            {campaign?.is_active && (
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-raleway">
                Active
              </span>
            )}
          </div>
          {campaign && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 font-raleway">
              <Calendar className="w-4 h-4" />
              {formatDate(campaign.start_date)} - {formatDate(campaign.end_date)}
            </div>
          )}
          {progress && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 dark:text-gray-400 font-raleway">Progress</span>
                <span className="font-medium text-gray-900 dark:text-white font-cal">
                  Day {progress.currentDay} of {progress.totalDays}
                </span>
              </div>
              <div className="mt-2 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(progress.currentDay / progress.totalDays) * 100}%`,
                  }}
                  transition={{ duration: 0.6 }}
                  className="h-full bg-[#E07A5F] dark:bg-[#c96b52] rounded-full"
                />
              </div>
            </div>
          )}
        </BentoCard>

        <BentoCard span={2} variant="accent">
          <div className="grid grid-cols-3 gap-4 h-full">
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-white/70 font-raleway">
                Users
              </p>
              <p className="text-2xl font-semibold mt-1 text-white font-cal tabular-nums">
                {progress?.usersProgress.toFixed(0) ?? 0}%
              </p>
              <p className="text-xs text-white/70 font-raleway mt-1">
                {stats?.totalUsers ?? 0} / {campaign?.target_users ?? 0}
              </p>
            </div>
            <div className="text-center border-x border-white/20 px-4">
              <p className="text-xs uppercase tracking-wider text-white/70 font-raleway">
                Volume
              </p>
              <p className="text-2xl font-semibold mt-1 text-white font-cal tabular-nums">
                {progress?.volumeProgress.toFixed(0) ?? 0}%
              </p>
              <p className="text-xs text-white/70 font-raleway mt-1">
                {formatCompact(stats?.totalVolume ?? 0)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-white/70 font-raleway">
                TXs
              </p>
              <p className="text-2xl font-semibold mt-1 text-white font-cal tabular-nums">
                {progress?.transactionsProgress.toFixed(0) ?? 0}%
              </p>
              <p className="text-xs text-white/70 font-raleway mt-1">
                {(stats?.totalTransactions ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </BentoCard>

        {/* Row 2: KPI Progress Cards */}
        <BentoCard>
          <KPIProgress
            icon={<Users className="w-5 h-5 text-[#3D405B] dark:text-gray-400" />}
            label="Active Users"
            current={stats?.totalUsers ?? 0}
            target={campaign?.target_users ?? 0}
            projected={projected?.users ?? 0}
            progress={progress?.usersProgress ?? 0}
          />
        </BentoCard>

        <BentoCard>
          <KPIProgress
            icon={<TrendingUp className="w-5 h-5 text-[#E07A5F] dark:text-[#c96b52]" />}
            label="Volume"
            current={stats?.totalVolume ?? 0}
            target={Number(campaign?.target_volume_usd) ?? 0}
            projected={projected?.volume ?? 0}
            progress={progress?.volumeProgress ?? 0}
            format="currency"
          />
        </BentoCard>

        <BentoCard>
          <KPIProgress
            icon={<Target className="w-5 h-5 text-[#81B29A] dark:text-[#6a9a82]" />}
            label="Transactions"
            current={stats?.totalTransactions ?? 0}
            target={campaign?.target_transactions ?? 0}
            projected={projected?.transactions ?? 0}
            progress={progress?.transactionsProgress ?? 0}
          />
        </BentoCard>

        {/* Row 3: Pool Allocation */}
        <BentoCard>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 font-raleway">
                Total Pool
              </p>
              <p className="text-2xl font-semibold mt-1 tabular-nums text-gray-900 dark:text-white font-cal">
                {formatCurrency(Number(campaign?.pool_total_usd) ?? 0)}
              </p>
            </div>
            <DollarSign className="w-5 h-5 text-[#3D405B] dark:text-gray-400" />
          </div>
        </BentoCard>

        <BentoCard>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 font-raleway">
                Cashback Pool
              </p>
              <p className="text-2xl font-semibold mt-1 tabular-nums text-gray-900 dark:text-white font-cal">
                {formatCurrency(
                  ((Number(campaign?.pool_total_usd) ?? 0) * (campaign?.pool_cashback_pct ?? 0)) / 100
                )}
              </p>
              <p className="text-xs mt-1 text-gray-500 dark:text-gray-400 font-raleway">
                {campaign?.pool_cashback_pct ?? 0}% of pool
              </p>
            </div>
            <Award className="w-5 h-5 text-[#E07A5F] dark:text-[#c96b52]" />
          </div>
        </BentoCard>

        <BentoCard variant="dark">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-white/70 font-raleway">
                Prizes Pool
              </p>
              <p className="text-2xl font-semibold mt-1 tabular-nums text-white font-cal">
                {formatCurrency(
                  ((Number(campaign?.pool_total_usd) ?? 0) * (campaign?.pool_prizes_pct ?? 0)) / 100
                )}
              </p>
              <p className="text-xs mt-1 text-white/70 font-raleway">
                {campaign?.pool_prizes_pct ?? 0}% of pool
              </p>
            </div>
            <Award className="w-5 h-5 text-white" />
          </div>
        </BentoCard>
      </BentoGrid>
    </AdminShell>
  );
}

// KPI Progress Component
interface KPIProgressProps {
  icon: React.ReactNode;
  label: string;
  current: number;
  target: number;
  projected: number;
  progress: number;
  format?: "number" | "currency";
}

function KPIProgress({
  icon,
  label,
  current,
  target,
  projected,
  progress,
  format = "number",
}: KPIProgressProps) {
  const formatValue = (value: number) => {
    if (format === "currency") {
      if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
      return `$${value.toFixed(0)}`;
    }
    return value.toLocaleString();
  };

  const clampedProgress = Math.min(100, Math.max(0, progress));
  const isOnTrack = projected >= target;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-sm font-medium text-gray-900 dark:text-white font-cal">{label}</span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400 font-raleway">{formatValue(current)}</span>
          <span className="text-gray-900 dark:text-white font-medium font-cal">{formatValue(target)}</span>
        </div>

        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${clampedProgress}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="h-full bg-[#E07A5F] dark:bg-[#c96b52] rounded-full"
          />
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400 font-raleway">{clampedProgress.toFixed(0)}%</span>
          <span
            className={`font-raleway ${isOnTrack ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}
          >
            Proj: {formatValue(projected)}
          </span>
        </div>
      </div>
    </div>
  );
}
