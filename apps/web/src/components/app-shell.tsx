"use client";

import * as React from "react";

import { ThemeToggle } from "./theme-toggle";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              λ
            </span>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Pragma H1</p>
              <h1 className="text-lg font-semibold text-foreground">HybridDelegator Console</h1>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 justify-center">
        <div className="flex w-full max-w-5xl flex-1 px-4 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
