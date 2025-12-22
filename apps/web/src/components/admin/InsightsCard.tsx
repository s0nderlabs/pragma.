"use client";

/**
 * Insights Card Component
 *
 * Terracotta accent card for AI-generated insights.
 * Currently a placeholder - will be wired to AI in Phase 5.
 */

import { motion } from "framer-motion";
import { Sparkles, RefreshCw } from "lucide-react";
import { useState } from "react";

interface InsightsCardProps {
  title?: string;
  insights?: string[];
  isLoading?: boolean;
  onRefresh?: () => void;
  className?: string;
  span?: 1 | 2 | 3;
}

const placeholderInsights = [
  "Volume up 23% from last week",
  "5 new high-value users joined",
  "Peak activity at 2-4 PM UTC",
];

const spanClasses = {
  1: "",
  2: "md:col-span-2",
  3: "md:col-span-2 lg:col-span-3",
};

export function InsightsCard({
  title = "AI Insights",
  insights = placeholderInsights,
  isLoading = false,
  onRefresh,
  className = "",
  span = 1,
}: InsightsCardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      await onRefresh();
      setTimeout(() => setIsRefreshing(false), 1000);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className={`bg-[#E07A5F] dark:bg-[#c96b52] rounded-3xl p-6 text-white h-full ${spanClasses[span]} ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          <h3 className="text-sm font-semibold tracking-wide font-raleway">
            {title}
          </h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
          title="Refresh insights"
        >
          <RefreshCw
            className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {/* Insights */}
      <div className="space-y-3">
        {isLoading ? (
          <>
            {[85, 72, 90].map((width, i) => (
              <div
                key={i}
                className="h-4 bg-white/20 rounded animate-pulse"
                style={{ width: `${width}%` }}
              />
            ))}
          </>
        ) : (
          insights.map((insight, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: index * 0.1 }}
              className="flex items-start gap-2"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white/60 mt-1.5 flex-shrink-0" />
              <p className="text-sm leading-relaxed font-raleway opacity-95">
                {insight}
              </p>
            </motion.div>
          ))
        )}
      </div>

      {/* Placeholder note */}
      <div className="mt-4 pt-3 border-t border-white/20">
        <p className="text-xs opacity-60 font-raleway">
          AI-powered analysis coming soon
        </p>
      </div>
    </motion.div>
  );
}
