"use client";

/**
 * Stat Card Component
 *
 * Displays a metric with label, value, and optional delta.
 * Clean, subtle animations for a professional look.
 */

import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect, useState } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: {
    value: string | number;
    type: "increase" | "decrease" | "neutral";
    period?: string;
  };
  prefix?: string;
  suffix?: string;
  index?: number;
}

export function StatCard({ label, value, delta, prefix, suffix, index = 0 }: StatCardProps) {
  const isNumeric = typeof value === "number";
  const [displayValue, setDisplayValue] = useState(isNumeric ? 0 : value);

  const spring = useSpring(0, { stiffness: 100, damping: 30 });
  const display = useTransform(spring, (v) => Math.round(v).toLocaleString());

  useEffect(() => {
    if (isNumeric && typeof value === "number") {
      spring.set(value);
      const unsubscribe = display.on("change", (v) => setDisplayValue(v));
      return () => unsubscribe();
    } else {
      setDisplayValue(value);
    }
  }, [value, isNumeric, spring, display]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: index * 0.05,
        ease: "easeOut",
      }}
      className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-[#2a2a2a] hover:shadow-md transition-shadow duration-200"
    >
      <p className="text-sm text-[#6B7280] dark:text-gray-400 uppercase tracking-wide mb-2 font-raleway">
        {label}
      </p>
      <p className="text-3xl font-semibold text-[#1A1A1A] dark:text-white tabular-nums font-cal">
        {prefix}
        {displayValue}
        {suffix}
      </p>
      {delta && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 + index * 0.05, duration: 0.2 }}
          className={`text-sm mt-2 flex items-center gap-1 font-raleway ${
            delta.type === "increase"
              ? "text-green-600"
              : delta.type === "decrease"
              ? "text-red-600"
              : "text-[#6B7280]"
          }`}
        >
          {delta.type === "increase" && <ArrowUpIcon />}
          {delta.type === "decrease" && <ArrowDownIcon />}
          {delta.type === "increase" ? "+" : delta.type === "decrease" ? "" : ""}
          {delta.value}
          {delta.period && <span className="text-[#6B7280] dark:text-gray-400 ml-1">({delta.period})</span>}
        </motion.p>
      )}
    </motion.div>
  );
}

function ArrowUpIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  );
}
