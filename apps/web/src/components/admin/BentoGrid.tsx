"use client";

/**
 * Bento Grid Component
 *
 * A flexible bento-box grid layout system for the admin dashboard.
 * Supports responsive columns and varied card sizes.
 */

import { ReactNode } from "react";
import { motion } from "framer-motion";

interface BentoGridProps {
  children: ReactNode;
  className?: string;
  cols?: 3 | 4;
}

const gridColsClasses = {
  3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
};

export function BentoGrid({ children, className = "", cols = 3 }: BentoGridProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`grid ${gridColsClasses[cols]} gap-4 ${className}`}
    >
      {children}
    </motion.div>
  );
}

interface BentoCardProps {
  children: ReactNode;
  span?: 1 | 2 | 3 | 4;
  rowSpan?: 1 | 2;
  variant?: "default" | "accent" | "dark" | "green";
  className?: string;
  onClick?: () => void;
}

const spanClasses = {
  1: "",
  2: "md:col-span-2",
  3: "md:col-span-2 lg:col-span-3",
  4: "md:col-span-2 lg:col-span-4",
};

const rowSpanClasses = {
  1: "",
  2: "row-span-2",
};

const variantClasses = {
  default: "bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-[#2a2a2a]",
  accent: "bg-[#E07A5F] dark:bg-[#c96b52] text-white border-0",
  dark: "bg-[#3D405B] dark:bg-[#353849] text-white border-0",
  green: "bg-[#81B29A] dark:bg-[#6a9a82] text-white border-0",
};

export function BentoCard({
  children,
  span = 1,
  rowSpan = 1,
  variant = "default",
  className = "",
  onClick,
}: BentoCardProps) {
  return (
    <motion.div
      whileHover={{ scale: onClick ? 1.01 : 1 }}
      transition={{ duration: 0.15 }}
      className={`
        rounded-3xl p-6
        ${spanClasses[span]}
        ${rowSpanClasses[rowSpan]}
        ${variantClasses[variant]}
        ${onClick ? "cursor-pointer" : ""}
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}

/**
 * Stat Card - A compact stat display for bento grids
 */
interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: ReactNode;
  variant?: "default" | "accent" | "dark" | "green";
}

export function StatCard({
  label,
  value,
  change,
  changeType = "neutral",
  icon,
  variant = "default",
}: StatCardProps) {
  const changeColors = {
    positive: "text-green-500",
    negative: "text-red-500",
    neutral: variant === "default" ? "text-gray-500 dark:text-gray-400" : "text-white/70",
  };

  const labelColor = variant === "default" ? "text-gray-500 dark:text-gray-400" : "text-white/70";
  const valueColor = variant === "default" ? "text-gray-900 dark:text-white" : "text-white";

  return (
    <BentoCard variant={variant}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-xs font-medium tracking-wide ${labelColor} font-raleway`}>
            {label}
          </p>
          <p className={`text-2xl font-semibold mt-1 tabular-nums ${valueColor} font-cal`}>
            {value}
          </p>
          {change && (
            <p className={`text-xs mt-1 ${changeColors[changeType]} font-raleway`}>
              {change}
            </p>
          )}
        </div>
        {icon && (
          <div className={`p-2 rounded-xl ${variant === "default" ? "bg-gray-50 dark:bg-[#2a2a2a]" : "bg-white/10"}`}>
            {icon}
          </div>
        )}
      </div>
    </BentoCard>
  );
}
