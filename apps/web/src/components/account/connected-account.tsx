"use client";

import * as React from "react";
import { ClipboardCopy, Clock, ExternalLink, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { formatUnits, getAddress, type Address } from "viem";
import type { Mode } from "@pragma/core/delegations/types";

import { useIdentity } from "../../hooks/useIdentity";
import { OnboardingPanel, type QuickStatusSnapshot } from "../onboarding/onboarding-panel";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { GlassPanel, StatCard } from "../ui/glass";
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
import { listReceipts, type StoredReceipt } from "../../lib/storage/receipts";
import { getActiveDelegator, setActiveDelegator, IDENTITY_EVENT } from "../../lib/storage/active-delegator";
import { getOwnerDelegator } from "../../lib/storage/owner-delegators";
import { revokeDelegations } from "../../lib/onboarding/revoke";
import { rotateHybridDelegatorSession } from "../../lib/onboarding/service";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { monadChain } from "../../lib/clients";
import { MONAD_NATIVE_TOKEN_SYMBOL } from "../../lib/config";
import { Dialog as NestedDialog, DialogContent as NestedDialogContent, DialogHeader as NestedDialogHeader, DialogTitle as NestedDialogTitle, DialogDescription as NestedDialogDescription, DialogBody as NestedDialogBody } from "../ui/dialog";

const shortHex = (value?: string) => (value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—");

const formatExpiry = (expiresAt?: number) => {
  if (!expiresAt) return "—";
  return new Date(expiresAt * 1000).toLocaleString();
};

const formatTimestamp = (value?: number) => {
  if (!value) return "—";
  return new Date(value).toLocaleString();
};

const formatTokenAmount = (value?: string | null, decimals?: number, symbol?: string) => {
  if (!value || !decimals && decimals !== 0) return symbol ? `— ${symbol}` : "—";
  try {
    const parsed = Number.parseFloat(formatUnits(BigInt(value), decimals ?? 18));
    if (Number.isNaN(parsed)) return value;
    const formatted = parsed >= 1 ? parsed.toLocaleString(undefined, { maximumFractionDigits: 4 }) : parsed.toPrecision(4);
    return symbol ? `${formatted} ${symbol}` : formatted;
  } catch {
    return symbol ? `${value} ${symbol}` : value;
  }
};

const formatBasisPoints = (bps?: number) => {
  if (typeof bps !== "number") return "—";
  return `${(bps / 100).toFixed(2)}% (${bps} bps)`;
};

const stringifyError = (value: unknown) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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

const describeError = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "object" && error && "message" in error) {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === "string") {
      return candidate;
    }
  }
  return String(error);
};

export const ConnectedAccount = () => {
  const identity = useIdentity();
  const [open, setOpen] = React.useState(false);
  const [quickStatus, setQuickStatus] = React.useState<QuickStatusSnapshot>(defaultStatus);
  const [delegations, setDelegations] = React.useState<StoredDelegation[]>([]);
  const [revokeSelection, setRevokeSelection] = React.useState<"auto" | Mode>("auto");
  const [revokePending, setRevokePending] = React.useState(false);
  const [isRevoking, setIsRevoking] = React.useState(false);
  const [revokeError, setRevokeError] = React.useState<string | null>(null);
  const [revokeSuccess, setRevokeSuccess] = React.useState<string | null>(null);
  const [isRotating, setIsRotating] = React.useState(false);
  const [rotateError, setRotateError] = React.useState<string | null>(null);
  const [rotateSuccess, setRotateSuccess] = React.useState<string | null>(null);
  const [receipts, setReceipts] = React.useState<StoredReceipt[]>([]);
  const [receiptDetailOpen, setReceiptDetailOpen] = React.useState(false);
  const [selectedReceipt, setSelectedReceipt] = React.useState<StoredReceipt | null>(null);
  const [activeSection, setActiveSection] = React.useState<"overview" | "delegations" | "receipts">("overview");

  const walletAddress = identity.wallet?.address;
  const walletClient = identity.wallet?.walletClient;
  const connected = identity.status === "connected" && Boolean(walletAddress);
  const fallbackDelegator = getActiveDelegator();
  const sessionDelegatorFull = quickStatus.delegatorFull ?? fallbackDelegator ?? walletAddress;
  const sessionDelegatorLabel = sessionDelegatorFull ? shortHex(sessionDelegatorFull) : "Not connected";
  const displayAddress = connected ? sessionDelegatorFull ?? walletAddress : undefined;
  const buttonLabel = connected
    ? `Connected · ${displayAddress ? shortHex(displayAddress) : "—"}`
    : "Connect account";

  const activeDelegations = React.useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return delegations.filter((entry) => {
      if (entry.revokedAt) return false;
      const expiry = entry.artifact.expiresAt;
      return !expiry || expiry > now;
    });
  }, [delegations]);

  const closeReceiptDetail = React.useCallback(() => {
    setReceiptDetailOpen(false);
    setSelectedReceipt(null);
  }, []);

  const availableModes = React.useMemo(() => {
    const modes = new Set<Mode>();
    activeDelegations.forEach((entry) => {
      const mode = (entry.artifact.mode ?? "safe") as Mode;
      modes.add(mode);
    });
    return Array.from(modes);
  }, [activeDelegations]);

  const delegationCounts = React.useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return delegations.reduce(
      (acc, entry) => {
        if (entry.revokedAt) {
          acc.revoked += 1;
          return acc;
        }
        if (entry.artifact.expiresAt && entry.artifact.expiresAt <= now) {
          acc.expired += 1;
          return acc;
        }
        acc.active += 1;
        return acc;
      },
      { active: 0, expired: 0, revoked: 0, total: delegations.length },
    );
  }, [delegations]);

  const sections: { id: typeof activeSection; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "delegations", label: "Delegations" },
    { id: "receipts", label: "Receipts" },
  ];

  const revokeModeValue = React.useMemo(() => {
    if (revokeSelection === "auto") return "auto";
    return revokeSelection;
  }, [revokeSelection]);

  const hasActiveDelegations = activeDelegations.length > 0;

  const connectionStatusLabel = connected
    ? "Connected"
    : identity.status === "connecting"
      ? "Connecting…"
      : "Disconnected";

  const connectionBadgeClass = connected
    ? "border-[#846FFA]/40 bg-[#846FFA]/18 text-[#674CF9]"
    : identity.status === "connecting"
      ? "border-amber-500/35 bg-amber-500/15 text-amber-600"
      : "border-[#1A1A1A]/20 bg-[#1A1A1A]/10 text-[#1A1A1A] dark:border-[#F8F8FF]/20 dark:bg-[#F8F8FF]/10 dark:text-[#F8F8FF]";

  React.useEffect(() => {
    if (availableModes.length === 0) {
      setRevokeSelection("auto");
      return;
    }
    if (availableModes.length === 1) {
      const [mode] = availableModes;
      if (revokeSelection !== mode) {
        setRevokeSelection(mode);
      }
      return;
    }
    if (revokeSelection !== "auto" && !availableModes.includes(revokeSelection)) {
      setRevokeSelection("auto");
    }
  }, [availableModes, revokeSelection]);

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
        setReceipts([]);
      } else {
        setQuickStatus(defaultStatus);
        setDelegations([]);
        setReceipts([]);
      }
      return;
    }

    const activeEntries = listActiveDelegations(undefined, delegatorAddress);
    const allDelegations = listDelegations(delegatorAddress);
    setDelegations(allDelegations);
    setReceipts(listReceipts(delegatorAddress, 10));

    const context = loadChatSession("swap", undefined, delegatorAddress);

    type PrimaryStatus = {
      mode: Mode;
      expiresAt?: number;
      sessionKey: string;
      sessionKeyFull: string;
      delegator: Address;
      status: "active" | "stored" | "revoked";
      revokedAt?: number;
    };

    let primary: PrimaryStatus | undefined;

    if (context) {
      primary = {
        mode: context.session.mode,
        expiresAt: context.session.expiresAt,
        sessionKey: shortHex(context.session.sessionKeyAddress),
        sessionKeyFull: context.session.sessionKeyAddress,
        delegator: context.delegator,
        status: "active",
      };
    } else if (activeEntries[0]) {
      const entry = activeEntries[0];
      primary = {
        mode: entry.artifact.mode,
        expiresAt: entry.artifact.expiresAt,
        sessionKey: shortHex(entry.artifact.sessionKeyAddress),
        sessionKeyFull: entry.artifact.sessionKeyAddress,
        delegator: getAddress(entry.artifact.delegation.delegator as Address),
        status: "active",
      };
    } else if (allDelegations[0]) {
      const entry = allDelegations[0];
      primary = {
        mode: entry.artifact.mode,
        expiresAt: entry.artifact.expiresAt,
        sessionKey: shortHex(entry.artifact.sessionKeyAddress),
        sessionKeyFull: entry.artifact.sessionKeyAddress,
        delegator: getAddress(entry.artifact.delegation.delegator as Address),
        status: entry.revokedAt ? "revoked" : "stored",
        revokedAt: entry.revokedAt ?? undefined,
      };
    }

    if (primary) {
      const smartAccountLabel =
        primary.status === "active"
          ? "HybridDelegator ready"
          : primary.status === "revoked"
            ? "Delegation revoked"
            : "Stored delegation (expired)";
      setQuickStatus({
        delegator: shortHex(primary.delegator),
        delegatorFull: primary.delegator,
        smartAccount: smartAccountLabel,
        sessionKey: primary.sessionKey,
        sessionKeyFull: primary.sessionKeyFull,
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
    if (!open) {
      setActiveSection("overview");
      setRevokePending(false);
      setRevokeError(null);
      setRevokeSuccess(null);
      setIsRevoking(false);
      setRotateError(null);
      setRotateSuccess(null);
      setIsRotating(false);
    }
  }, [open]);

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

  const handleRevoke = React.useCallback(async () => {
    if (!walletClient || !walletAddress) {
      setRevokeError("Connect your account before revoking delegations.");
      return;
    }

    setIsRevoking(true);
    setRevokeError(null);

    try {
      const mode = revokeSelection === "auto" ? undefined : revokeSelection;
      const result = await revokeDelegations({
        walletClient,
        ownerAddress: walletAddress,
        mode,
      });

      const txLabel = result.transactionHash ?? result.userOperationHash;
      setRevokeSuccess(
        result.simulated
          ? "Delegations revoked in mock environment."
          : txLabel
            ? `Delegations revoked (tx: ${txLabel})`
            : "Delegations revoked.",
      );
      setRevokePending(false);
      refreshSessionOverview();
    } catch (error) {
      setRevokeError(describeError(error));
      setRevokeSuccess(null);
    } finally {
      setIsRevoking(false);
    }
  }, [walletClient, walletAddress, revokeSelection, refreshSessionOverview]);

  const handleRotateSessionKey = React.useCallback(async () => {
    if (!walletClient || !walletAddress) {
      setRotateError("Connect your account before rotating the session key.");
      return;
    }
    setIsRotating(true);
    setRotateError(null);
    setRotateSuccess(null);

    try {
      const result = await rotateHybridDelegatorSession(walletClient, walletAddress);
      setRotateSuccess(`Session key rotated to ${shortHex(result.sessionKey.address)}.`);
      setActiveDelegator(result.delegator, walletAddress);
      await refreshSessionOverview();
    } catch (error) {
      setRotateError(describeError(error));
      setRotateSuccess(null);
    } finally {
      setIsRotating(false);
    }
  }, [refreshSessionOverview, walletAddress, walletClient]);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "gap-2 rounded-full border border-[hsla(var(--accent),0.35)] bg-white/50 px-4 py-2 text-xs font-semibold text-[#2F2F2F] shadow-none backdrop-blur-xl transition dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]",
            connected
              ? "text-[hsl(var(--accent))] hover:bg-white/60 dark:text-[#F8F8FF] dark:hover:bg-[#1E1E27]/85"
              : "hover:bg-white/60 dark:hover:bg-[#1E1E27]/85"
          )}
        >
          <KeyRound className="h-4 w-4" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl overflow-hidden rounded-[2.5rem] border border-[#846FFA]/35 bg-gradient-to-br from-white/88 via-white/55 to-white/34 p-0 shadow-[0_38px_100px_rgba(132,111,250,0.32)] backdrop-blur-3xl dark:border-[#846FFA]/35 dark:bg-[linear-gradient(135deg,rgba(23,23,31,0.95)_0%,rgba(23,23,31,0.72)_55%,rgba(23,23,31,0.88)_100%)]">
        <DialogHeader className="border-none px-8 pb-4 pt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <DialogTitle className="text-2xl font-semibold text-[#1A1A1A] dark:text-[#F8F8FF]">Connected account</DialogTitle>
              <DialogDescription className="max-w-xl text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/85">
                Manage your Web3Auth session, delegations, session key, and guardrails that power the chat console.
              </DialogDescription>
            </div>
            <span
              className={cn(
                "inline-flex h-9 items-center justify-center rounded-full border px-4 text-xs font-semibold uppercase tracking-[0.18em]",
                connectionBadgeClass,
              )}
            >
              {connectionStatusLabel}
            </span>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-6 px-8 pb-8 pt-0">
          <div className="flex flex-wrap items-center gap-2" role="tablist">
            {sections.map((section) => (
              <Button
                key={section.id}
                type="button"
                size="sm"
                variant="ghost"
                role="tab"
                aria-selected={activeSection === section.id}
                onClick={() => setActiveSection(section.id)}
                data-testid={`account-nav-${section.id}`}
                className={cn(
                  "rounded-full border border-transparent px-4 py-2 text-xs font-semibold transition",
                  activeSection === section.id
                    ? "border-[#846FFA]/40 bg-gradient-to-r from-[#846FFA]/30 to-[#674CF9]/35 text-[#2F285F] dark:text-[#F8F8FF]"
                    : "bg-white/60 text-[#5C5C5C] hover:bg-white/80 dark:bg-[#1E1E27]/60 dark:text-[#C7C3E8]/80 dark:hover:bg-[#1E1E27]/75",
                )}
              >
                {section.label}
              </Button>
            ))}
          </div>

          {activeSection === "overview" ? (
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-3">
                <StatCard
                  icon={<Sparkles className="h-3.5 w-3.5" />}
                  label="Delegator"
                  value={sessionDelegatorLabel}
                  testId="connected-delegator"
                  description={
                    sessionDelegatorFull
                      ? "Fund this account to settle swaps and transfers."
                      : "Connect your wallet to derive a HybridDelegator."
                  }
                  actions={
                    <>
                      <span className="truncate">{walletAddress ? `Owner ${shortHex(walletAddress)}` : "No owner connected"}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-full border border-[#846FFA]/30 bg-white/70 text-[#846FFA] shadow-sm hover:bg-[#846FFA]/15 dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/25"
                        onClick={() => handleCopy(sessionDelegatorFull)}
                        disabled={!sessionDelegatorFull}
                        aria-label="Copy delegator address"
                      >
                        <ClipboardCopy className="h-4 w-4" />
                      </Button>
                    </>
                  }
                />
                <StatCard
                  icon={<KeyRound className="h-3.5 w-3.5" />}
                  label="Session key"
                  value={quickStatus.sessionKey}
                  testId="connected-session-key"
                  description={
                    <div className="space-y-1">
                      <span data-testid="connected-session-expiry">Expiry {quickStatus.expiry}</span>
                      <span>{quickStatus.mode !== "—" ? ` Mode ${quickStatus.mode}` : "Awaiting issuance"}</span>
                    </div>
                  }
                  actions={
                    <>
                      <span className="truncate">Top up ~0.5 MON for gas</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-full border border-[#846FFA]/30 bg-white/70 text-[#846FFA] shadow-sm hover:bg-[#846FFA]/15 dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/25"
                        onClick={() => handleCopy(quickStatus.sessionKeyFull)}
                        disabled={!quickStatus.sessionKeyFull}
                        aria-label="Copy session key address"
                      >
                        <ClipboardCopy className="h-4 w-4" />
                      </Button>
                    </>
                  }
                />
                <StatCard
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  label="Smart account"
                  value={quickStatus.smartAccount}
                  testId="connected-smart-account"
                  description={
                    <div className="space-y-1">
                      <span>{hasActiveDelegations ? "Delegations active and ready" : "Issue a delegation to activate"}</span>
                      <span className="flex items-center gap-1 text-[11px] uppercase tracking-[0.2em] text-[#7A6FAF]/80 dark:text-[#C7C3E8]/80">
                        <Clock className="h-3 w-3" /> Refreshed just now
                      </span>
                    </div>
                  }
                />
              </div>

              <GlassPanel className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7A6FAF] dark:text-[#C7C3E8]">Session controls</h3>
                  <p className="text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/85">
                    Rotate your session key or revoke delegations to reset guardrails before issuing new orders.
                  </p>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7A6FAF] dark:text-[#C7C3E8]">Rotate session key</h4>
                      <p className="text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/85">
                        Issue a fresh session key if you need to refresh guardrails or recover from a compromised key.
                      </p>
                    </div>
                    {rotateSuccess ? (
                      <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-600 dark:text-emerald-400">{rotateSuccess}</p>
                    ) : null}
                    {rotateError ? (
                      <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">{rotateError}</p>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void handleRotateSessionKey()}
                      disabled={isRotating}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border border-[#846FFA]/40 bg-gradient-to-r from-[#846FFA]/25 to-[#674CF9]/35 px-5 py-2 text-sm font-semibold text-[#3F356F] shadow-[0_10px_24px_rgba(132,111,250,0.25)] transition hover:opacity-90 dark:border-[#846FFA]/45 dark:text-[#F8F8FF]",
                        isRotating && "opacity-60",
                      )}
                    >
                      {isRotating ? "Rotating session key…" : "Rotate session key"}
                    </Button>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7A6FAF] dark:text-[#C7C3E8]">Revoke delegations</h4>
                      <p className="text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/85">
                        Bump the HybridDelegator nonce to invalidate the selected mode’s delegations before reissuing.
                      </p>
                    </div>
                    <Select
                      value={revokeModeValue}
                      onValueChange={(value) => setRevokeSelection(value as "auto" | Mode)}
                      disabled={!hasActiveDelegations || availableModes.length <= 1}
                    >
                      <SelectTrigger className="w-full rounded-full border border-[#846FFA]/30 bg-white/70 text-xs text-[#3F356F] shadow-sm transition dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]/85">
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">All modes</SelectItem>
                        {availableModes.includes("safe") ? <SelectItem value="safe">Safe mode</SelectItem> : null}
                        {availableModes.includes("normal") ? <SelectItem value="normal">Normal mode</SelectItem> : null}
                      </SelectContent>
                    </Select>
                    {revokeSuccess ? (
                      <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-600 dark:text-emerald-400">{revokeSuccess}</p>
                    ) : null}
                    {revokeError ? (
                      <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">{revokeError}</p>
                    ) : null}
                    {!revokePending ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={!hasActiveDelegations || isRevoking}
                        onClick={() => {
                          setRevokePending(true);
                          setRevokeError(null);
                          setRevokeSuccess(null);
                        }}
                        className={cn(
                          "inline-flex items-center justify-center gap-2 rounded-full border border-[#846FFA]/40 bg-white/70 px-5 py-2 text-sm font-semibold text-[#3F356F] shadow-sm transition hover:bg-[#846FFA]/12 dark:border-[#846FFA]/45 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]/85 dark:hover:bg-[#846FFA]/20",
                          (!hasActiveDelegations || isRevoking) && "opacity-60",
                        )}
                      >
                        Revoke delegations
                      </Button>
                    ) : (
                      <div className="rounded-[1.25rem] border border-destructive/40 bg-destructive/5 p-4">
                        <p className="text-sm text-destructive">
                          This will bump the HybridDelegator nonce and disable the selected mode’s delegation. Continue?
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                          <Button
                            type="button"
                            variant="destructive"
                            disabled={isRevoking}
                            onClick={() => void handleRevoke()}
                            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
                          >
                            {isRevoking ? <Spinner className="h-4 w-4" /> : null}
                            Confirm revoke
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setRevokePending(false);
                              setRevokeError(null);
                              setRevokeSuccess(null);
                            }}
                            className="rounded-full px-4 py-2 text-sm font-semibold"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </GlassPanel>

              <GlassPanel>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7A6FAF] dark:text-[#C7C3E8]">Funding instructions</h3>
                <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/85">
                  <li>
                    Copy the delegator address and fund it with the amount of MON you want available for swaps and transfers—the delegator holds the settlement balances. After sending MON, reopen this panel or run <code className="inline rounded bg-[#ECEBF2] px-1 py-0.5 text-xs text-[#1A1A1A] dark:bg-[#1E1E27] dark:text-[#F8F8FF]">delegation status</code> in chat to confirm the updated balance.
                  </li>
                  <li>
                    Copy the session key address and send roughly <span className="font-medium text-[#1A1A1A] dark:text-[#F8F8FF]">0.5&nbsp;MON</span> to act as its gas tank for UserOperations. If either balance looks stale after funding, disconnect and reconnect so the session picks up the refreshed state.
                  </li>
                </ol>
              </GlassPanel>
            </div>
          ) : null}

          {activeSection === "delegations" ? (
            <div className="space-y-6" data-testid="delegations-section">
              <GlassPanel className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-white/40 bg-white/60 px-4 py-3 text-sm text-[#1A1A1A] shadow-sm dark:border-white/10 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]">
                  <span className="block text-xs uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Active</span>
                  <span className="mt-1 text-2xl font-semibold">{delegationCounts.active}</span>
                </div>
                <div className="rounded-xl border border-white/40 bg-white/60 px-4 py-3 text-sm text-[#1A1A1A] shadow-sm dark:border-white/10 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]">
                  <span className="block text-xs uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Expired</span>
                  <span className="mt-1 text-2xl font-semibold">{delegationCounts.expired}</span>
                </div>
                <div className="rounded-xl border border-white/40 bg-white/60 px-4 py-3 text-sm text-[#1A1A1A] shadow-sm dark:border-white/10 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]">
                  <span className="block text-xs uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Revoked</span>
                  <span className="mt-1 text-2xl font-semibold">{delegationCounts.revoked}</span>
                </div>
              </GlassPanel>

              <GlassPanel>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7A6FAF] dark:text-[#C7C3E8]">Stored delegations</h3>
                  <span className="text-xs text-[#7A6FAF] dark:text-[#C7C3E8]">{delegations.length} total</span>
                </div>
                <div className="mt-4 grid gap-3">
                  {delegations.length === 0 ? (
                    <p className="text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">No delegations stored yet. Complete onboarding to issue a new delegation.</p>
                  ) : (
                    delegations.map((entry) => {
                      const artifact = entry.artifact;
                      const kind = (artifact.kind ?? "swap") === "swap" ? "Swap" : "Transfer";
                      const tokens = (artifact.allowedTokens ?? []).map((token) => token.symbol ?? shortHex(token.address));
                      const now = Math.floor(Date.now() / 1000);
                      const isExpired = artifact.expiresAt ? now >= artifact.expiresAt : false;
                      const isRevoked = Boolean(entry.revokedAt);
                      const statusLabel = isRevoked ? "Revoked" : isExpired ? "Expired" : "Active";
                      const statusTone = isRevoked
                        ? "bg-destructive/15 text-destructive"
                        : isExpired
                          ? "bg-amber-500/15 text-amber-600"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
                      const revokeTimestamp = entry.revokedAt ? new Date(entry.revokedAt).toLocaleString() : null;
                      return (
                        <div key={entry.id} className="rounded-[1.25rem] border border-[#846FFA]/25 bg-white/65 px-4 py-3 text-sm shadow-sm dark:border-[#846FFA]/30 dark:bg-[#1E1E27]/70">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-[#1A1A1A] dark:text-[#F8F8FF]">
                              {kind} delegation · {artifact.mode === "safe" ? "Safe" : "Normal"} mode
                            </span>
                            <div className="flex items-center gap-3">
                              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusTone)}>
                                {statusLabel}
                              </span>
                              <span className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">Expires {formatExpiry(artifact.expiresAt)}</span>
                            </div>
                          </div>
                          {tokens.length > 0 ? (
                            <p className="mt-2 text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                              Tokens: {tokens.join(", ")}
                            </p>
                          ) : null}
                          {revokeTimestamp ? (
                            <p className="mt-2 text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                              Revoked {revokeTimestamp}
                            </p>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </GlassPanel>

              <GlassPanel className="p-0">
                <OnboardingPanel onStatusUpdate={setQuickStatus} onRequestClose={() => setOpen(false)} />
              </GlassPanel>
            </div>
          ) : null}

          {activeSection === "receipts" ? (
            <GlassPanel data-testid="receipts-section" className="overflow-hidden">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7A6FAF] dark:text-[#C7C3E8]">Recent receipts</h3>
                <span className="text-xs text-[#7A6FAF] dark:text-[#C7C3E8]">{receipts.length} stored</span>
              </div>
              <div className="mt-4 grid gap-3 text-sm">
                {receipts.length === 0 ? (
                  <p className="text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">Swaps executed from this browser will appear here with status, summary, and transaction links.</p>
                ) : (
                  receipts.map((entry) => {
                    const { record } = entry;
                    const statusTone = record.status === "success"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-destructive/15 text-destructive";
                    const statusLabel = record.status === "success" ? "Success" : "Failed";
                    const explorerUrl = monadChain.blockExplorers?.default?.url;
                    const txLabel = record.txHash ? shortHex(record.txHash) : "Pending";
                    const txLink = record.txHash && explorerUrl ? `${explorerUrl}/tx/${record.txHash}` : null;
                    const errorSnippet = typeof record.error === "string" ? record.error : null;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        data-testid="receipt-row"
                        onClick={() => {
                          setSelectedReceipt(entry);
                          setReceiptDetailOpen(true);
                        }}
                        className="group flex min-w-0 max-w-full flex-col gap-3 overflow-hidden rounded-[1.25rem] border border-[#846FFA]/25 bg-white/65 px-4 py-3 text-left shadow-sm transition hover:border-[#846FFA]/40 hover:bg-white/75 focus:outline-none focus:ring-2 focus:ring-[#846FFA]/40 dark:border-[#846FFA]/30 dark:bg-[#1E1E27]/70 dark:hover:border-[#846FFA]/45 dark:hover:bg-[#1E1E27]/80"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="break-words text-sm font-semibold text-[#1A1A1A] transition group-hover:text-[#2F285F] dark:text-[#F8F8FF] dark:group-hover:text-[#DAD7FF]">
                              {record.summary}
                            </p>
                            {errorSnippet ? (
                              <p className="break-all text-xs text-destructive/80 overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                                {errorSnippet}
                              </p>
                            ) : null}
                          </div>
                          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusTone)}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="grid gap-2 text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80 md:grid-cols-2">
                          <span className="break-words">Executed {formatTimestamp(record.executedAt ?? record.createdAt)}</span>
                          <span className="flex flex-wrap items-center gap-1 break-words">
                            Tx: {txLink ? (
                              <a className="inline-flex items-center gap-1 text-[#674CF9] underline decoration-dotted underline-offset-2 dark:text-[#DAD7FF]" href={txLink} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                                {txLabel}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              txLabel
                            )}
                          </span>
                          <span className="break-words">Quote {record.quoteId ?? "n/a"}</span>
                          <span className="break-words">Plan {record.planHash ? shortHex(record.planHash) : "n/a"}</span>
                        </div>
                        <div className="flex items-center justify-end text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF]/80 dark:text-[#C7C3E8]/80">
                          View details →
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </GlassPanel>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
    <NestedDialog
      open={receiptDetailOpen && Boolean(selectedReceipt)}
      onOpenChange={(next) => {
        if (!next) {
          closeReceiptDetail();
        } else if (selectedReceipt) {
          setReceiptDetailOpen(true);
        }
      }}
    >
      {selectedReceipt ? (
        <NestedDialogContent
          data-testid="receipt-detail-dialog"
          className="max-w-2xl space-y-6 rounded-[2.25rem] border border-[#846FFA]/35 bg-gradient-to-br from-white/90 via-white/65 to-white/35 p-8 shadow-[0_32px_90px_rgba(132,111,250,0.32)] backdrop-blur-3xl dark:border-[#846FFA]/35 dark:bg-[linear-gradient(140deg,rgba(17,17,24,0.94)_0%,rgba(17,17,24,0.72)_55%,rgba(17,17,24,0.88)_100%)]"
        >
          <NestedDialogHeader>
            <NestedDialogTitle className="text-lg font-semibold text-[#2F285F] dark:text-[#F8F8FF]">Swap receipt details</NestedDialogTitle>
            <NestedDialogDescription className="text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
              Stored locally on {new Date(selectedReceipt.storedAt).toLocaleString()}
            </NestedDialogDescription>
          </NestedDialogHeader>
          <NestedDialogBody className="space-y-6">
            <div className="rounded-[1.5rem] border border-[#846FFA]/25 bg-white/70 p-4 shadow-sm dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/75">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-base font-semibold text-[#1A1A1A] dark:text-[#F8F8FF]">{selectedReceipt.record.summary}</p>
                  <p className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                    Mode {selectedReceipt.record.mode} · Delegator {shortHex(selectedReceipt.record.delegator)}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]",
                    selectedReceipt.record.status === "success"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-destructive/15 text-destructive",
                  )}
                >
                  {selectedReceipt.record.status === "success" ? "Success" : "Failed"}
                </span>
              </div>
              <dl className="mt-4 grid gap-2 text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Executed</dt>
                  <dd>{formatTimestamp(selectedReceipt.record.executedAt ?? selectedReceipt.record.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Created</dt>
                  <dd>{formatTimestamp(selectedReceipt.record.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Session key</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    {shortHex(selectedReceipt.record.sessionKey)}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 rounded-full border border-[#846FFA]/35 bg-white/75 text-[#846FFA] hover:bg-[#846FFA]/15 dark:border-[#846FFA]/40 dark:bg-[#1E1E27]/70 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/25"
                      onClick={() => handleCopy(selectedReceipt.record.sessionKey)}
                      aria-label="Copy session key"
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                    </Button>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Quote ID</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <span className="break-all">{selectedReceipt.record.quoteId ?? "n/a"}</span>
                    {selectedReceipt.record.quoteId ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-full border border-[#846FFA]/35 bg-white/75 text-[#846FFA] hover:bg-[#846FFA]/15 dark:border-[#846FFA]/40 dark:bg-[#1E1E27]/70 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/25"
                        onClick={() => handleCopy(selectedReceipt.record.quoteId ?? "")}
                        aria-label="Copy quote id"
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Plan hash</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <span className="break-all">
                      {selectedReceipt.record.planHash ? shortHex(selectedReceipt.record.planHash) : "n/a"}
                    </span>
                    {selectedReceipt.record.planHash ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-full border border-[#846FFA]/35 bg-white/75 text-[#846FFA] hover:bg-[#846FFA]/15 dark:border-[#846FFA]/40 dark:bg-[#1E1E27]/70 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/25"
                        onClick={() => handleCopy(selectedReceipt.record.planHash ?? "")}
                        aria-label="Copy plan hash"
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Slippage</dt>
                  <dd>{formatBasisPoints(selectedReceipt.record.slippageBps)}</dd>
                </div>
              </dl>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="min-w-0 space-y-1 overflow-hidden rounded-[1.25rem] border border-[#846FFA]/25 bg-white/65 p-4 text-sm text-[#1A1A1A] shadow-sm dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Amount in</p>
                <p className="mt-1 text-base font-semibold">{formatTokenAmount(selectedReceipt.record.amountInWei, selectedReceipt.record.tokenIn.decimals, selectedReceipt.record.tokenIn.symbol)}</p>
                <p className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80 break-all">{selectedReceipt.record.tokenIn.address}</p>
              </div>
              <div className="min-w-0 space-y-1 overflow-hidden rounded-[1.25rem] border border-[#846FFA]/25 bg-white/65 p-4 text-sm text-[#1A1A1A] shadow-sm dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Minimum out</p>
                <p className="mt-1 text-base font-semibold">{formatTokenAmount(selectedReceipt.record.minAmountOutWei, selectedReceipt.record.tokenOut.decimals, selectedReceipt.record.tokenOut.symbol)}</p>
                <p className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80 break-all">{selectedReceipt.record.tokenOut.address}</p>
              </div>
              <div className="min-w-0 space-y-1 overflow-hidden rounded-[1.25rem] border border-[#846FFA]/25 bg-white/65 p-4 text-sm text-[#1A1A1A] shadow-sm dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Actual out</p>
                <p className="mt-1 text-base font-semibold">
                  {selectedReceipt.record.amountOutWei
                    ? formatTokenAmount(selectedReceipt.record.amountOutWei, selectedReceipt.record.tokenOut.decimals, selectedReceipt.record.tokenOut.symbol)
                    : "Pending"}
                </p>
                <p className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80 break-words">
                  Tx hash {selectedReceipt.record.txHash ? shortHex(selectedReceipt.record.txHash) : "pending"}
                </p>
              </div>
            </div>

            <div className="grid gap-4 text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Delegator</p>
                <p className="mt-1 flex items-center gap-2 text-[#1A1A1A] dark:text-[#F8F8FF]">
                  {shortHex(selectedReceipt.record.delegator)}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 rounded-full border border-[#846FFA]/35 bg-white/75 text-[#846FFA] hover:bg-[#846FFA]/15 dark:border-[#846FFA]/40 dark:bg-[#1E1E27]/70 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/25"
                    onClick={() => handleCopy(selectedReceipt.record.delegator)}
                    aria-label="Copy delegator"
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                  </Button>
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Gas used</p>
                <p className="mt-1 text-[#1A1A1A] dark:text-[#F8F8FF]">
                  {selectedReceipt.record.gasUsedWei
                    ? `${formatTokenAmount(selectedReceipt.record.gasUsedWei, 18, MONAD_NATIVE_TOKEN_SYMBOL)} (estimated)`
                    : "—"}
                </p>
              </div>
            </div>

            {selectedReceipt.record.txHash ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-[#846FFA]/25 bg-[#846FFA]/8 px-4 py-3 text-sm text-[#3F356F] shadow-sm dark:border-[#846FFA]/45 dark:bg-[#846FFA]/20 dark:text-[#F8F8FF]">
                <span className="break-all">Transaction {selectedReceipt.record.txHash}</span>
                {monadChain.blockExplorers?.default?.url ? (
                  <a
                    href={`${monadChain.blockExplorers.default.url}/tx/${selectedReceipt.record.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.2em]"
                  >
                    View on explorer
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            ) : null}

            {stringifyError(selectedReceipt.record.error) ? (
              <div className="rounded-[1.25rem] border border-destructive/40 bg-destructive/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-destructive">Failure details</p>
                <pre className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-xs text-destructive/90">
                  {stringifyError(selectedReceipt.record.error)}
                </pre>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                className="rounded-full border border-[#846FFA]/35 bg-white/70 px-4 py-2 text-sm font-semibold text-[#3F356F] shadow-sm transition hover:bg-[#846FFA]/15 dark:border-[#846FFA]/40 dark:bg-[#1E1E27]/70 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/25"
                onClick={closeReceiptDetail}
              >
                Close
              </Button>
            </div>
          </NestedDialogBody>
        </NestedDialogContent>
      ) : null}
    </NestedDialog>
  </>
  );
};
