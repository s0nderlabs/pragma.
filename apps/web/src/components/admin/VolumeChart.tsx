"use client";

/**
 * Volume Chart Component
 *
 * Line chart showing volume, fees, or user activity over time.
 * Uses Recharts with Pragma design system.
 *
 * Uses next-themes for shared theme with main app.
 */

import { useState, useEffect } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

interface DataPoint {
  date: string;
  value: number;
  label?: string;
}

interface VolumeChartProps {
  data: DataPoint[];
  title: string;
  color?: string;
  valuePrefix?: string;
  valueSuffix?: string;
  showArea?: boolean;
  height?: number;
  bare?: boolean; // If true, don't render wrapper card
}

export function VolumeChart({
  data,
  title,
  color = "#E07A5F",
  valuePrefix = "",
  valueSuffix = "",
  showArea = true,
  height = 240,
  bare = false,
}: VolumeChartProps) {
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

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
    label,
  }: {
    active?: boolean;
    payload?: Array<{ value: number }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      return (
        <div
          className="rounded-lg shadow-lg p-3"
          style={{
            backgroundColor: bgColor,
            border: `1px solid ${borderColor}`,
          }}
        >
          <p className="text-xs mb-1 font-raleway" style={{ color: mutedColor }}>
            {label ? formatDate(label) : ""}
          </p>
          <p className="text-sm font-semibold tabular-nums font-cal" style={{ color: textColor }}>
            {formatValue(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (data.length === 0) {
    const emptyContent = (
      <>
        <h3 className="text-sm font-medium mb-4 font-cal" style={{ color: textColor }}>
          {title}
        </h3>
        <div
          className="flex items-center justify-center text-sm font-raleway"
          style={{ height, color: mutedColor }}
        >
          No data available
        </div>
      </>
    );

    if (bare) return <div>{emptyContent}</div>;
    return (
      <div
        className="rounded-3xl p-6 shadow-sm"
        style={{
          backgroundColor: isDark ? "#111827" : "#ffffff",
          border: `1px solid ${isDark ? "#1f2937" : "#f3f4f6"}`,
        }}
      >
        {emptyContent}
      </div>
    );
  }

  const ChartComponent = showArea ? AreaChart : LineChart;

  const chartContent = (
    <>
      <h3 className="text-sm font-medium mb-4 font-cal" style={{ color: textColor }}>
        {title}
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <ChartComponent
          data={data}
          margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: tickColor }}
            axisLine={{ stroke: gridColor }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => formatValue(v)}
            tick={{ fontSize: 11, fill: tickColor }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />
          {showArea ? (
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={color}
              fillOpacity={0.1}
            />
          ) : (
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: color }}
            />
          )}
        </ChartComponent>
      </ResponsiveContainer>
    </>
  );

  if (bare) return <div>{chartContent}</div>;
  return (
    <div
      className="rounded-3xl p-6 shadow-sm"
      style={{
        backgroundColor: isDark ? "#111827" : "#ffffff",
        border: `1px solid ${isDark ? "#1f2937" : "#f3f4f6"}`,
      }}
    >
      {chartContent}
    </div>
  );
}
