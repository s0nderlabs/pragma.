"use client";

import * as React from "react";

import { cn } from "../../lib/utils";

export const GlassPanel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[1.5rem] border border-[#846FFA]/30 bg-gradient-to-br from-white/78 via-white/50 to-white/28 p-6 shadow-[0_26px_60px_rgba(132,111,250,0.2)] backdrop-blur-2xl dark:border-[#846FFA]/35 dark:bg-[linear-gradient(140deg,rgba(30,30,39,0.88)_0%,rgba(30,30,39,0.58)_55%,rgba(30,30,39,0.74)_100%)] dark:shadow-[0_32px_70px_rgba(0,0,0,0.45)]",
        className,
      )}
      {...props}
    />
  ),
);
GlassPanel.displayName = "GlassPanel";

export type StatCardProps = {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  testId?: string;
};

export const StatCard = ({ icon, label, value, description, actions, testId }: StatCardProps) => (
  <GlassPanel className="flex h-full flex-col gap-4 p-6">
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#7A6FAF] dark:text-[#C7C3E8]">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#846FFA]/12 text-[#674CF9] shadow-[0_8px_18px_rgba(132,111,250,0.25)] dark:bg-[#846FFA]/20 dark:text-[#D8D4FF]">
        {icon}
      </span>
      {label}
    </div>
    <div data-testid={testId} className="text-xl font-semibold text-[#1A1A1A] dark:text-[#F8F8FF]">
      {value}
    </div>
    {description ? <div className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">{description}</div> : null}
    {actions ? (
      <div className="mt-auto flex items-center justify-between gap-3 text-xs text-[#5C5C5C] dark:text-[#C7C3E8]">
        {actions}
      </div>
    ) : null}
  </GlassPanel>
);
