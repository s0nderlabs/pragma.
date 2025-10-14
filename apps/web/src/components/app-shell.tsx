"use client";

import * as React from "react";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F4F3F8] text-[#1A1A1A] dark:bg-[#111118] dark:text-[#F8F8FF]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-24 h-[520px] w-[520px] rounded-full bg-[#846FFA]/18 blur-3xl dark:bg-[rgba(132,111,250,0.18)]" />
        <div className="absolute -bottom-48 -right-32 h-[420px] w-[420px] rounded-full bg-[#846FFA]/12 blur-3xl dark:bg-[rgba(132,111,250,0.2)]" />
        <div className="absolute inset-y-0 left-1/2 h-[640px] w-[640px] -translate-x-1/2 rounded-[50%] bg-white/20 blur-[180px] dark:bg-[rgba(17,17,24,0.6)]" />
      </div>

      <main className="relative z-20 flex h-screen items-center justify-center px-4">
        <div className="flex w-full max-w-6xl flex-col items-center justify-center gap-8">
          {children}
        </div>
      </main>
    </div>
  );
}
