"use client";

import * as React from "react";
import { ClipboardCopy, KeyRound } from "lucide-react";
import { getAddress, type Address } from "viem";
import type { Mode } from "@pragma/core/delegations/types";

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
import { listReceipts, type StoredReceipt } from "../../lib/storage/receipts";
import { getActiveDelegator, setActiveDelegator, IDENTITY_EVENT } from "../../lib/storage/active-delegator";
import { getOwnerDelegator } from "../../lib/storage/owner-delegators";
import { revokeDelegations } from "../../lib/onboarding/revoke";
import { rotateHybridDelegatorSession } from "../../lib/onboarding/service";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { monadChain } from "../../lib/clients";

const shortHex = (value?: string) => (value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—");

const formatExpiry = (expiresAt?: number) => {
  if (!expiresAt) return "—";
  return new Date(expiresAt * 1000).toLocaleString();
};

const formatTimestamp = (value?: number) => {
  if (!value) return "—";
  return new Date(value).toLocaleString();
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

  const availableModes = React.useMemo(() => {
    const modes = new Set<Mode>();
    activeDelegations.forEach((entry) => {
      const mode = (entry.artifact.mode ?? "safe") as Mode;
      modes.add(mode);
    });
    return Array.from(modes);
  }, [activeDelegations]);

  const revokeModeValue = React.useMemo(() => {
    if (revokeSelection === "auto") return "auto";
    return revokeSelection;
  }, [revokeSelection]);

  const hasActiveDelegations = activeDelegations.length > 0;

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
            <div className="mt-4 space-y-3 text-sm">
              {rotateSuccess ? (
                <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-emerald-600">{rotateSuccess}</p>
              ) : null}
              {rotateError ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">{rotateError}</p>
              ) : null}
              <Button type="button" variant="outline" onClick={() => void handleRotateSessionKey()} disabled={isRotating}>
                {isRotating ? "Rotating session key…" : "Rotate session key"}
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-border/70 bg-card/60 p-5 backdrop-blur">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Funding instructions</h3>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                Copy the delegator address above and fund it with the amount of MON you want available for swaps and transfers—
                it holds the balances that settle each intent. After sending MON, reopen this panel or run
                <code className="inline rounded bg-muted px-1 py-0.5 text-xs text-foreground">delegation status</code>
                &nbsp;in chat to confirm the updated balance.
              </li>
              <li>
                Copy the session key address and send roughly <span className="font-medium text-foreground">0.5&nbsp;MON</span>
                &nbsp;to act as its gas tank for UserOperations. If either balance looks stale after funding, disconnect and
                reconnect so the session picks up the refreshed state.
              </li>
            </ol>
          </section>

          <section className="rounded-2xl border border-border/70 bg-card/60 p-5 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Revoke delegations</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Bump the HybridDelegator nonce to invalidate existing session keys. You’ll need to reissue delegations before
                  submitting new actions.
                </p>
              </div>
              <div className="w-full max-w-[160px]">
                <Select
                  value={revokeModeValue}
                  onValueChange={(value) => setRevokeSelection(value as "auto" | Mode)}
                  disabled={!hasActiveDelegations || availableModes.length <= 1}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">All modes</SelectItem>
                    {availableModes.includes("safe") ? <SelectItem value="safe">Safe mode</SelectItem> : null}
                    {availableModes.includes("normal") ? <SelectItem value="normal">Normal mode</SelectItem> : null}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              {revokeSuccess ? (
                <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-emerald-600">{revokeSuccess}</p>
              ) : null}
              {revokeError ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">{revokeError}</p>
              ) : null}
              {!revokePending ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!hasActiveDelegations || isRevoking}
                  onClick={() => {
                    setRevokePending(true);
                    setRevokeError(null);
                    setRevokeSuccess(null);
                  }}
                >
                  Revoke delegations
                </Button>
              ) : (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
                  <p className="text-sm text-destructive">
                    This will bump the HybridDelegator nonce and disable the selected mode’s delegation. Continue?
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={isRevoking}
                      onClick={() => void handleRevoke()}
                      className="flex items-center gap-2"
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
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border/70 bg-card/60 p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recent receipts</h3>
              <span className="text-xs text-muted-foreground">{receipts.length} stored</span>
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              {receipts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Swaps executed from this browser will appear here with status, summary, and transaction links.</p>
              ) : (
                receipts.map((entry) => {
                  const { record } = entry;
                  const statusTone = record.status === "success"
                    ? "bg-emerald-500/15 text-emerald-600"
                    : "bg-destructive/15 text-destructive";
                  const statusLabel = record.status === "success" ? "Success" : "Failed";
                  const txLabel = record.txHash ? shortHex(record.txHash) : "Pending";
                  const explorerUrl = monadChain.blockExplorers?.default?.url;
                  const txLink = record.txHash && explorerUrl ? `${explorerUrl}/tx/${record.txHash}` : null;
                  return (
                    <div key={entry.id} className="rounded-xl border border-border/60 bg-background/60 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{record.summary}</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusTone}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Executed {formatTimestamp(record.executedAt ?? record.createdAt)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          Tx: {txLink ? (
                            <a className="text-foreground underline" href={txLink} target="_blank" rel="noreferrer">
                              {txLabel}
                            </a>
                          ) : (
                            txLabel
                          )}
                        </span>
                        <span>Quote {record.quoteId ?? "n/a"}</span>
                        <span>Plan {record.planHash ? shortHex(record.planHash) : "n/a"}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
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
                  const now = Math.floor(Date.now() / 1000);
                  const isExpired = artifact.expiresAt ? now >= artifact.expiresAt : false;
                  const isRevoked = Boolean(entry.revokedAt);
                  const statusLabel = isRevoked ? "Revoked" : isExpired ? "Expired" : "Active";
                  const statusTone = isRevoked ? "bg-destructive/15 text-destructive" : isExpired ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600";
                  const revokeTimestamp = entry.revokedAt ? new Date(entry.revokedAt).toLocaleString() : null;
                  return (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-border/60 bg-background/60 px-4 py-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          {kind} delegation · {artifact.mode === "safe" ? "Safe" : "Normal"} mode
                        </span>
                        <div className="flex items-center gap-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusTone}`}>
                            {statusLabel}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Expires {formatExpiry(artifact.expiresAt)}
                          </span>
                        </div>
                      </div>
                      {tokens.length > 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Tokens: {tokens.join(", ")}
                        </p>
                      ) : null}
                      {revokeTimestamp ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Revoked {revokeTimestamp}
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
