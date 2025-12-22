"use client";

/**
 * Source Pie Chart Component
 *
 * Donut chart showing distribution of sources (Pragma, 0x, Monorail).
 */

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface SourceData {
  name: string;
  value: number;
  txCount?: number;
  [key: string]: string | number | undefined;
}

interface SourcePieChartProps {
  data: SourceData[];
  title: string;
  valuePrefix?: string;
  height?: number;
}

// Color palette matching Pragma design system
const COLORS = [
  "#E07A5F", // terracotta - Pragma
  "#3D405B", // dark slate - 0x
  "#81B29A", // sage green - Monorail
];

export function SourcePieChart({
  data,
  title,
  valuePrefix = "$",
  height = 200,
}: SourcePieChartProps) {
  const formatValue = (value: number) => {
    if (valuePrefix === "$") {
      if (value >= 1000) {
        return `$${(value / 1000).toFixed(1)}K`;
      }
      return `$${value.toFixed(2)}`;
    }
    return `${valuePrefix}${value.toLocaleString()}`;
  };

  const total = data.reduce((sum, d) => sum + d.value, 0);

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: SourceData }>;
  }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
      return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
          <p className="text-xs font-medium text-[#1A1A1A] dark:text-white mb-1 font-raleway">
            {item.name}
          </p>
          <p className="text-sm font-semibold text-[#1A1A1A] dark:text-white tabular-nums font-cal">
            {formatValue(item.value)}
          </p>
          <p className="text-xs text-[#6B7280] dark:text-gray-400 font-raleway">
            {percentage}% of total
          </p>
          {item.txCount !== undefined && (
            <p className="text-xs text-[#6B7280] dark:text-gray-400 font-raleway">
              {item.txCount.toLocaleString()} transactions
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  if (data.length === 0 || total === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 font-cal tracking-wide">
          {title}
        </h3>
        <div
          className="flex items-center justify-center text-[#6B7280] dark:text-gray-400 text-sm font-raleway"
          style={{ height }}
        >
          No data available
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 font-cal tracking-wide">
        {title}
      </h3>
      <div className="flex-1 flex items-center gap-4">
        <ResponsiveContainer width="50%" height={height}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={70}
              paddingAngle={0}
              dataKey="value"
              stroke="none"
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex-1 space-y-3">
          {data.map((item, index) => {
            const percentage = total > 0 ? ((item.value / total) * 100).toFixed(0) : 0;
            return (
              <div key={item.name} className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white font-raleway capitalize">
                      {item.name}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums font-cal">
                      {percentage}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-raleway">
                    <span>{formatValue(item.value)}</span>
                    {item.txCount !== undefined && (
                      <span>{item.txCount} txs</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
