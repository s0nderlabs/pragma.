"use client";

/**
 * Mini Chart Component
 *
 * Compact sparkline chart for bento cards.
 * Supports area and line chart types.
 */

import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface DataPoint {
  value: number;
  label?: string;
}

interface MiniChartProps {
  data: DataPoint[];
  color?: string;
  height?: number;
  showTooltip?: boolean;
  type?: "area" | "line";
  valuePrefix?: string;
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

export function MiniChart({
  data,
  color = "#E07A5F",
  height = 60,
  showTooltip = true,
  type = "area",
  valuePrefix = "",
}: MiniChartProps) {
  const formatValue = (value: number) => {
    if (valuePrefix === "$") {
      if (value >= 1000) {
        return `$${(value / 1000).toFixed(1)}K`;
      }
      return `$${value.toFixed(2)}`;
    }
    return `${valuePrefix}${value.toLocaleString()}`;
  };

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: DataPoint }>;
  }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
          <p className="text-xs text-[#6B7280] dark:text-gray-400 mb-1 font-raleway">
            {item.label ? formatDate(item.label) : ""}
          </p>
          <p className="text-sm font-semibold text-[#1A1A1A] dark:text-white tabular-nums font-cal">
            {formatValue(item.value)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-gray-400 text-xs font-raleway"
        style={{ height }}
      >
        No data
      </div>
    );
  }

  return (
    <div style={{ height, width: "100%", overflow: "visible" }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 8 }}>
          {showTooltip && <Tooltip content={<CustomTooltip />} />}
          <defs>
            <linearGradient id={`gradient-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={type === "area" ? `url(#gradient-${color.replace("#", "")})` : "none"}
            animationDuration={800}
            activeDot={{
              r: 5,
              strokeWidth: 2,
              stroke: "#fff",
              fill: color,
              style: { filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.15))" }
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Trend indicator component for showing direction
 */
interface TrendProps {
  value: number;
  suffix?: string;
  showIcon?: boolean;
}

export function Trend({ value, suffix = "%", showIcon = true }: TrendProps) {
  const isPositive = value >= 0;
  const color = isPositive ? "text-green-500" : "text-red-500";

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color} font-raleway`}>
      {showIcon && (
        <span>{isPositive ? "↑" : "↓"}</span>
      )}
      {isPositive ? "+" : ""}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}
