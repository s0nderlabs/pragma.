"use client";

import * as React from "react";

import { ThemeToggle } from "./theme-toggle";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#E6E2DC] text-[#0D0D0D]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-24 h-[520px] w-[520px] rounded-full bg-[#E07A5F]/18 blur-3xl" />
        <div className="absolute -bottom-48 -right-32 h-[420px] w-[420px] rounded-full bg-[#E07A5F]/12 blur-3xl" />
        <div className="absolute inset-y-0 left-1/2 h-[640px] w-[640px] -translate-x-1/2 rounded-[50%] bg-white/20 blur-[180px]" />
      </div>

      <div className="pointer-events-none absolute top-6 right-6 z-30">
        <div className="pointer-events-auto">
          <ThemeToggle />
        </div>
      </div>

      <main className="relative z-20 flex h-screen items-center justify-center px-4">
        <div className="flex w-full max-w-6xl flex-col items-center justify-center gap-8">
          {children}
        </div>
      </main>
    </div>
  );
}
