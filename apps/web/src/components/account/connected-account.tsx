"use client";

import * as React from "react";
import { ClipboardCopy, KeyRound } from "lucide-react";

import { useIdentity } from "../../hooks/useIdentity";
import { OnboardingPanel, type QuickStatusSnapshot } from "../onboarding/onboarding-panel";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

const shortHex = (value?: string) => (value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—");

const defaultStatus: QuickStatusSnapshot = {
  delegator: "Not connected",
  delegatorFull: undefined,
  smartAccount: "—",
  sessionKey: "—",
  sessionKeyFull: undefined,
  expiry: "—",
  mode: "—",
};

export const ConnectedAccount = () => {
  const identity = useIdentity();
  const [open, setOpen] = React.useState(false);
  const [quickStatus, setQuickStatus] = React.useState<QuickStatusSnapshot>(defaultStatus);

  const connected = Boolean(identity.wallet);
  const buttonLabel = connected
    ? `Connected · ${shortHex(identity.wallet?.address)}`
    : "Connect account";

  const handleCopy = React.useCallback((value?: string) => {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(value).catch(() => undefined);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={connected ? "outline" : "default"} size="sm" className="gap-2">
          <KeyRound className="h-4 w-4" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="overflow-hidden">
        <DialogHeader>
          <DialogTitle>Connected account</DialogTitle>
          <DialogDescription>
            Manage your Web3Auth session, delegations, session key, and guardrails that power the chat console.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-6">
          <section className="rounded-2xl border border-border/70 bg-card/60 p-5 backdrop-blur">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Session overview</h3>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-center justify-between gap-4">
                <span>Delegator</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground/80">{quickStatus.delegator}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => handleCopy(quickStatus.delegatorFull)}
                    disabled={!quickStatus.delegatorFull}
                    aria-label="Copy delegator address"
                  >
                    <ClipboardCopy className="h-4 w-4" />
                  </Button>
                </div>
              </li>
              <li className="flex items-start justify-between gap-4">
                <span>Smart account</span>
                <span className="max-w-[220px] text-right text-muted-foreground/80">{quickStatus.smartAccount}</span>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span>Session key</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground/80">{quickStatus.sessionKey}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => handleCopy(quickStatus.sessionKeyFull)}
                    disabled={!quickStatus.sessionKeyFull}
                    aria-label="Copy session key address"
                  >
                    <ClipboardCopy className="h-4 w-4" />
                  </Button>
                </div>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span>Mode</span>
                <span className="text-muted-foreground/80">{quickStatus.mode}</span>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span>Session expiry</span>
                <span className="text-muted-foreground/80">{quickStatus.expiry}</span>
              </li>
            </ul>
          </section>

          <OnboardingPanel onStatusUpdate={setQuickStatus} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
