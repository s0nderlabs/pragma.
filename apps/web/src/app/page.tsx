"use client";

import * as React from "react";
import { ClipboardCopy } from "lucide-react";

import { AppShell } from "../components/app-shell";
import { OnboardingPanel, type QuickStatusSnapshot } from "../components/onboarding/onboarding-panel";
import { ChatConsole } from "../components/chat/chat-console";
import { Button } from "../components/ui/button";

export default function Page() {
  const [quickStatus, setQuickStatus] = React.useState<QuickStatusSnapshot>({
    delegator: "Not connected",
    delegatorFull: undefined,
    smartAccount: "—",
    sessionKey: "—",
    sessionKeyFull: undefined,
    expiry: "—",
    mode: "—",
  });

  const handleCopy = React.useCallback((value?: string) => {
    if (!value) return;
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(value).catch(() => {
      // no-op fallback; clipboard might be unavailable
    });
  }, []);

  return (
    <AppShell>
      <section className="flex w-full flex-1 flex-col gap-6 lg:flex-row">
        <div className="flex flex-1 flex-col">
          <OnboardingPanel onStatusUpdate={setQuickStatus} />
          <ChatConsole />
        </div>
        <aside className="flex w-full max-w-sm flex-col gap-4">
          <div className="rounded-2xl border border-border/80 bg-card/70 p-5 shadow-sm backdrop-blur">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Quick status
            </h3>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-center justify-between">
                <span>Delegator</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-muted-foreground/80">{quickStatus.delegator}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => handleCopy(quickStatus.delegatorFull)}
                    disabled={!quickStatus.delegatorFull}
                  >
                    <ClipboardCopy className="h-4 w-4" />
                  </Button>
                </div>
              </li>
              <li className="flex items-start justify-between gap-4">
                <span>Smart account</span>
                <span className="max-w-[180px] text-right font-medium text-muted-foreground/80">{quickStatus.smartAccount}</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Session key</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-muted-foreground/80">{quickStatus.sessionKey}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => handleCopy(quickStatus.sessionKeyFull)}
                    disabled={!quickStatus.sessionKeyFull}
                  >
                    <ClipboardCopy className="h-4 w-4" />
                  </Button>
                </div>
              </li>
              <li className="flex items-center justify-between">
                <span>Mode</span>
                <span className="font-medium text-muted-foreground/80">{quickStatus.mode}</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Session expiry</span>
                <span className="font-medium text-muted-foreground/80">{quickStatus.expiry}</span>
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-dashed border-border/70 p-5 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Next up</p>
            <p className="mt-2">
              Complete onboarding to unlock swap, wrap, transfer, status, and delegation management commands inside the
              chat workspace.
            </p>
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
