"use client";

/**
 * Distribution Chart Component
 *
 * Horizontal bar chart for showing distribution of values.
 * Used for user segments, token breakdown, etc.
 *
 * Uses next-themes for shared theme with main app.
 */

import { useState, useEffect } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface DistributionItem {
  name: string;
  value: number;
  color?: string;
}

interface DistributionChartProps {
  data: DistributionItem[];
  title: string;
  valuePrefix?: string;
  valueSuffix?: string;
  color?: string;
  height?: number;
  showLegend?: boolean;
}

// Color palette for distribution charts
const COLORS = [
  "#E07A5F", // terracotta
  "#3D405B", // dark slate
  "#81B29A", // sage green
  "#F2CC8F", // sandy
  "#6B7280", // gray
];

export function DistributionChart({
  data,
  title,
  valuePrefix = "",
  valueSuffix = "",
  color = "#E07A5F",
  height = 200,
}: DistributionChartProps) {
  const { theme: pragmaTheme } = useThemeStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && pragmaTheme === "pragma-dark";

  // Chart colors based on theme
  const gridColor = isDark ? "#374151" : "#E5E7EB";
  const tickColor = isDark ? "#9CA3AF" : "#6B7280";
  const textColor = isDark ? "#F9FAFB" : "#1A1A1A";
  const mutedColor = isDark ? "#9CA3AF" : "#6B7280";
  const bgColor = isDark ? "#1f2937" : "#ffffff";
  const borderColor = isDark ? "#374151" : "#e5e7eb";
  const formatValue = (value: number) => {
    if (valuePrefix === "$") {
      if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1)}M`;
      }
      if (value >= 1000) {
        return `$${(value / 1000).toFixed(1)}K`;
      }
      return `$${value.toFixed(2)}`;
    }
    return `${valuePrefix}${value.toLocaleString()}${valueSuffix}`;
  };

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: DistributionItem }>;
  }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div
          className="rounded-lg shadow-lg p-3"
          style={{
            backgroundColor: bgColor,
            border: `1px solid ${borderColor}`,
          }}
        >
          <p className="text-xs mb-1 font-raleway" style={{ color: mutedColor }}>
            {item.name}
          </p>
          <p className="text-sm font-semibold tabular-nums font-cal" style={{ color: textColor }}>
            {formatValue(item.value)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (data.length === 0) {
    return (
      <div
        className="rounded-3xl p-6 shadow-sm"
        style={{
          backgroundColor: isDark ? "#111827" : "#ffffff",
          border: `1px solid ${isDark ? "#1f2937" : "#f3f4f6"}`,
        }}
      >
        <h3 className="text-sm font-medium mb-4 font-cal" style={{ color: textColor }}>
          {title}
        </h3>
        <div
          className="flex items-center justify-center text-sm font-raleway"
          style={{ height, color: mutedColor }}
        >
          No data available
        </div>
      </div>
    );
  }

  // Sort by value descending and take top 5
  const sortedData = [...data]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <div
      className="rounded-3xl p-6 shadow-sm"
      style={{
        backgroundColor: isDark ? "#111827" : "#ffffff",
        border: `1px solid ${isDark ? "#1f2937" : "#f3f4f6"}`,
      }}
    >
      <h3 className="text-sm font-medium mb-4 font-cal" style={{ color: textColor }}>
        {title}
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 5, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v) => formatValue(v)}
            tick={{ fontSize: 11, fill: tickColor }}
            axisLine={{ stroke: gridColor }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: tickColor }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={24}>
            {sortedData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color || COLORS[index % COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
