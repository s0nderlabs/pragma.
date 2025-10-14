"use client";

import * as React from "react";
import { ClipboardCopy, KeyRound } from "lucide-react";
import { getAddress, type Address } from "viem";

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
import { loadChatSession } from "../../lib/chat/session";
import { listActiveDelegations, listDelegations, type StoredDelegation } from "../../lib/storage/delegations";
import { getActiveDelegator, IDENTITY_EVENT } from "../../lib/storage/active-delegator";
import { getOwnerDelegator } from "../../lib/storage/owner-delegators";

const shortHex = (value?: string) => (value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—");

const formatExpiry = (expiresAt?: number) => {
  if (!expiresAt) return "—";
  return new Date(expiresAt * 1000).toLocaleString();
};

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
  const [delegations, setDelegations] = React.useState<StoredDelegation[]>([]);

  const walletAddress = identity.wallet?.address;
  const connected = identity.status === "connected" && Boolean(walletAddress);
  const fallbackDelegator = getActiveDelegator();
  const sessionDelegatorFull = quickStatus.delegatorFull ?? fallbackDelegator ?? walletAddress;
  const sessionDelegatorLabel = sessionDelegatorFull ? shortHex(sessionDelegatorFull) : "Not connected";
  const displayAddress = connected ? sessionDelegatorFull ?? walletAddress : undefined;
  const buttonLabel = connected
    ? `Connected · ${displayAddress ? shortHex(displayAddress) : "—"}`
    : "Connect account";

  const refreshSessionOverview = React.useCallback(() => {
    const walletAddress = identity.wallet?.address;
    const ownerAddress = walletAddress ? getAddress(walletAddress as Address) : undefined;
    const activeDelegator = getActiveDelegator();
    const delegatorAddress = activeDelegator ?? (ownerAddress ? getOwnerDelegator(ownerAddress) : undefined);

    if (!delegatorAddress) {
      if (ownerAddress) {
        setQuickStatus({
          ...defaultStatus,
          delegator: shortHex(ownerAddress),
          delegatorFull: ownerAddress,
          smartAccount: identity.status === "connected" ? "HybridDelegator not derived" : "Awaiting connection",
        });
        setDelegations([]);
      } else {
        setQuickStatus(defaultStatus);
        setDelegations([]);
      }
      return;
    }

    const activeDelegations = listActiveDelegations(undefined, delegatorAddress);
    const allDelegations = listDelegations(delegatorAddress);
    setDelegations(allDelegations);

    const context = loadChatSession("swap", undefined, delegatorAddress);
    const primary = context
      ? {
          mode: context.session.mode,
          expiresAt: context.session.expiresAt,
          sessionKey: context.session.sessionKeyAddress,
          delegator: context.delegator,
          status: "active" as const,
        }
      : activeDelegations[0]
        ? {
            mode: activeDelegations[0].artifact.mode,
            expiresAt: activeDelegations[0].artifact.expiresAt,
            sessionKey: activeDelegations[0].artifact.sessionKeyAddress,
            delegator: getAddress(activeDelegations[0].artifact.delegation.delegator as Address),
            status: "active" as const,
          }
        : allDelegations[0]
          ? {
              mode: allDelegations[0].artifact.mode,
              expiresAt: allDelegations[0].artifact.expiresAt,
              sessionKey: allDelegations[0].artifact.sessionKeyAddress,
              delegator: getAddress(allDelegations[0].artifact.delegation.delegator as Address),
              status: "stored" as const,
            }
          : undefined;

    if (primary) {
      setQuickStatus({
        delegator: shortHex(primary.delegator),
        delegatorFull: primary.delegator,
        smartAccount: primary.status === "active" ? "HybridDelegator ready" : "Stored delegation (expired)",
        sessionKey: shortHex(primary.sessionKey),
        sessionKeyFull: primary.sessionKey,
        expiry: formatExpiry(primary.expiresAt),
        mode: primary.mode === "safe" ? "Safe" : "Normal",
      });
    } else {
      setQuickStatus({
        ...defaultStatus,
        delegator: shortHex(delegatorAddress),
        delegatorFull: delegatorAddress,
        smartAccount: identity.status === "connected" ? "Awaiting issuance" : "Stored delegation",
      });
    }
  }, [identity.status, identity.wallet?.address]);

  React.useEffect(() => {
    if (!open) return;
    refreshSessionOverview();
  }, [open, connected, walletAddress, refreshSessionOverview]);

  React.useEffect(() => {
    if (connected && walletAddress) {
      refreshSessionOverview();
    } else {
      setQuickStatus(defaultStatus);
      setDelegations([]);
    }
  }, [connected, refreshSessionOverview, walletAddress]);

  React.useEffect(() => {
    const handler = () => refreshSessionOverview();
    if (typeof window !== "undefined") {
      window.addEventListener("pragma:delegation:updated", handler);
      window.addEventListener(IDENTITY_EVENT, handler as EventListener);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("pragma:delegation:updated", handler);
        window.removeEventListener(IDENTITY_EVENT, handler as EventListener);
      }
    };
  }, [refreshSessionOverview]);

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
                <span className="text-muted-foreground/80">{sessionDelegatorLabel}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => handleCopy(sessionDelegatorFull)}
                    disabled={!sessionDelegatorFull}
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

          <section className="rounded-2xl border border-border/70 bg-card/60 p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Current delegations</h3>
              <span className="text-xs text-muted-foreground">{delegations.length} stored</span>
            </div>
            <div className="mt-4 grid gap-3">
              {delegations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No delegations stored yet. Complete onboarding to issue a new delegation.</p>
              ) : (
                delegations.map((entry) => {
                  const artifact = entry.artifact;
                  const kind = (artifact.kind ?? "swap") === "swap" ? "Swap" : "Transfer";
                  const tokens = (artifact.allowedTokens ?? []).map((token) => token.symbol ?? shortHex(token.address));
                  const isActive = !artifact.expiresAt || Date.now() / 1000 < artifact.expiresAt;
                  return (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-border/60 bg-background/60 px-4 py-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          {kind} delegation · {artifact.mode === "safe" ? "Safe" : "Normal"} mode
                          {!isActive ? " · Expired" : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Expires {formatExpiry(artifact.expiresAt)}
                        </span>
                      </div>
                      {tokens.length > 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Tokens: {tokens.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <OnboardingPanel
            onStatusUpdate={setQuickStatus}
            onRequestClose={() => setOpen(false)}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
