"use client";

import * as React from "react";
import { ClipboardCopy, ExternalLink, KeyRound, Sparkles, AlertTriangle } from "lucide-react";
import { formatUnits, getAddress, type Address } from "viem";
import type { Mode } from "@pragma/core/delegations/types";

import { useIdentity } from "../../hooks/useIdentity";
import {
  OnboardingPanel,
  type QuickStatusSnapshot,
} from "../onboarding/onboarding-panel";
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
import {
  isDelegationExpired,
  listActiveDelegations,
  listDelegations,
  type StoredDelegation,
} from "../../lib/storage/delegations";
import { listReceipts, type StoredReceipt } from "../../lib/storage/receipts";
import {
  getActiveDelegator,
  setActiveDelegator,
  IDENTITY_EVENT,
} from "../../lib/storage/active-delegator";
import { getOwnerDelegator } from "../../lib/storage/owner-delegators";
import { revokeDelegations } from "../../lib/onboarding/revoke";
import { rotateHybridDelegatorSession } from "../../lib/onboarding/service";
import { setOwnerDelegator } from "../../lib/storage/owner-delegators";
import { Spinner } from "../ui/spinner";
import { createMonadPublicClient, monadChain } from "../../lib/clients";
import {
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONAD_NATIVE_TOKEN_SYMBOL,
} from "../../lib/config";
import {
  Dialog as NestedDialog,
  DialogContent as NestedDialogContent,
  DialogHeader as NestedDialogHeader,
  DialogTitle as NestedDialogTitle,
  DialogDescription as NestedDialogDescription,
  DialogBody as NestedDialogBody,
} from "../ui/dialog";

const shortHex = (value?: string) => {
  if (!value || value === "0x") return "—";
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

const formatExpiry = (expiresAt?: number) => {
  if (!expiresAt) return "—";
  return new Date(expiresAt * 1000).toLocaleString();
};

const formatTimestamp = (value?: number) => {
  if (!value) return "—";
  return new Date(value).toLocaleString();
};

const formatTokenAmount = (
  value?: string | null,
  decimals?: number,
  symbol?: string
) => {
  if (!value || (!decimals && decimals !== 0))
    return symbol ? `— ${symbol}` : "—";
  try {
    const parsed = Number.parseFloat(
      formatUnits(BigInt(value), decimals ?? 18)
    );
    if (Number.isNaN(parsed)) return value;
    const formatted =
      parsed >= 1
        ? parsed.toLocaleString(undefined, { maximumFractionDigits: 4 })
        : parsed.toPrecision(4);
    return symbol ? `${formatted} ${symbol}` : formatted;
  } catch {
    return symbol ? `${value} ${symbol}` : value;
  }
};

type BalanceEntry = {
  address: Address;
  symbol: string;
  amount: string;
  raw: bigint;
  decimals: number;
};

const formatBalanceValue = (raw: bigint, decimals: number): string => {
  const formatted = formatUnits(raw, decimals);
  const numeric = Number.parseFloat(formatted);
  if (!Number.isFinite(numeric)) return formatted;
  if (numeric >= 1) {
    return numeric.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  if (numeric === 0) {
    return "0";
  }
  return numeric.toPrecision(4);
};

const renderBalanceItems = (entries: BalanceEntry[], emptyLabel: string) => {
  if (!entries || entries.length === 0) {
    return (
      <p className="text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
        {emptyLabel}
      </p>
    );
  }

  const topEntries = entries.slice(0, 4);
  return (
    <ul className="space-y-2 text-sm text-[#1A1A1A] dark:text-[#F8F8FF]">
      {topEntries.map((entry) => (
        <li
          key={`${entry.address}-${entry.symbol}`}
          className="group flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[#3F356F] transition hover:bg-white/60 dark:text-[#E4E3FF] dark:hover:bg-[#1E1E27]/40"
        >
          <div className="flex items-center gap-2">
            <span className="text-[#846FFA] dark:text-[#DAD7FF]">●</span>
            <span className="font-medium">{entry.symbol}</span>
          </div>
          <span className="font-semibold tabular-nums">{entry.amount}</span>
        </li>
      ))}
      {entries.length > topEntries.length ? (
        <li className="text-xs text-[#7A6FAF] dark:text-[#C7C3E8] pl-2">
          + {entries.length - topEntries.length} more
        </li>
      ) : null}
    </ul>
  );
};

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

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
  const [quickStatus, setQuickStatus] =
    React.useState<QuickStatusSnapshot>(defaultStatus);
  const [delegations, setDelegations] = React.useState<StoredDelegation[]>([]);
  const [revokeSelection, setRevokeSelection] = React.useState<"auto" | Mode>(
    "auto"
  );
  const [revokePending, setRevokePending] = React.useState(false);
  const [isRevoking, setIsRevoking] = React.useState(false);
  const [revokeError, setRevokeError] = React.useState<string | null>(null);
  const [revokeSuccess, setRevokeSuccess] = React.useState<string | null>(null);
  const [isRotating, setIsRotating] = React.useState(false);
  const [rotateError, setRotateError] = React.useState<string | null>(null);
  const [rotateSuccess, setRotateSuccess] = React.useState<string | null>(null);
  const [receipts, setReceipts] = React.useState<StoredReceipt[]>([]);
  const [receiptDetailOpen, setReceiptDetailOpen] = React.useState(false);
  const [selectedReceipt, setSelectedReceipt] =
    React.useState<StoredReceipt | null>(null);
  const [activeSection, setActiveSection] = React.useState<
    "overview" | "actions" | "delegations" | "receipts"
  >("overview");
  const [balancesLoading, setBalancesLoading] = React.useState(false);
  const [balancesError, setBalancesError] = React.useState<string | null>(null);
  const [balanceEntries, setBalanceEntries] = React.useState<{
    delegator: BalanceEntry[];
    session: BalanceEntry[];
  }>({ delegator: [], session: [] });
  const [showDelegationHistory, setShowDelegationHistory] =
    React.useState(false);
  const [showReceiptsHistory, setShowReceiptsHistory] = React.useState(false);
  const [delegationDetailOpen, setDelegationDetailOpen] = React.useState(false);
  const [selectedDelegationEntry, setSelectedDelegationEntry] =
    React.useState<StoredDelegation | null>(null);

  const walletAddress = identity.wallet?.address;
  const walletClient = identity.wallet?.walletClient;
  const connected = identity.status === "connected" && Boolean(walletAddress);
  const fallbackDelegator = getActiveDelegator();
  const sessionDelegatorFull =
    quickStatus.delegatorFull ?? fallbackDelegator ?? walletAddress;
  const sessionDelegatorLabel = sessionDelegatorFull
    ? shortHex(sessionDelegatorFull)
    : "Not connected";
  const displayAddress = connected
    ? sessionDelegatorFull ?? walletAddress
    : undefined;
  const buttonLabel = connected
    ? `Connected · ${displayAddress ? shortHex(displayAddress) : "—"}`
    : "Connect account";
  const connectBusy =
    identity.status === "connecting" || identity.status === "initializing";
  const connectLabel =
    identity.status === "connecting"
      ? "Connecting…"
      : identity.status === "initializing"
      ? "Preparing…"
      : identity.status === "error"
      ? "Retry connect"
      : connected
      ? "Reconnect"
      : "Connect";
  const showDisconnectButton =
    identity.status === "connected" && Boolean(identity.wallet);

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

  const activeSwapDelegation = React.useMemo(() => {
    const swapActive = activeDelegations.find(
      (entry) => (entry.artifact.kind ?? "swap") === "swap"
    );
    return swapActive ?? null;
  }, [activeDelegations]);

  const allowedDelegationTokens = React.useMemo(
    () => activeSwapDelegation?.artifact.allowedTokens ?? [],
    [activeSwapDelegation]
  );

  const allowedTokenKey = React.useMemo(
    () =>
      allowedDelegationTokens
        .map((token) => token.address?.toLowerCase?.() ?? "")
        .filter(Boolean)
        .sort()
        .join("|"),
    [allowedDelegationTokens]
  );

  const primaryDelegation = React.useMemo(
    () => activeSwapDelegation ?? activeDelegations[0] ?? null,
    [activeDelegations, activeSwapDelegation]
  );

  const latestReceipt = React.useMemo(
    () => (receipts.length > 0 ? receipts[0] : null),
    [receipts]
  );
  const receiptHistory = React.useMemo(
    () => (receipts.length > 1 ? receipts.slice(1) : []),
    [receipts]
  );

  const renderReceiptSummary = React.useCallback(
    (entry: StoredReceipt, variant: "latest" | "history" = "history") => {
      const { record } = entry;
      const statusTone =
        record.status === "success"
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "bg-destructive/15 text-destructive";
      const statusLabel = record.status === "success" ? "Success" : "Failed";
      const explorerUrl = monadChain.blockExplorers?.default?.url;
      const txLabel = record.txHash ? shortHex(record.txHash) : "Pending";
      const txLink =
        record.txHash && explorerUrl
          ? `${explorerUrl}/tx/${record.txHash}`
          : null;
      const errorSnippet =
        typeof record.error === "string" ? record.error : null;

      const containerClasses = cn(
        "group flex min-w-0 max-w-full w-full flex-col gap-3 overflow-hidden rounded-[1.25rem] border px-4 py-3 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#846FFA]/35",
        variant === "latest"
          ? "border-[#846FFA]/35 bg-white/75 hover:border-[#846FFA]/45 hover:bg-white/90 dark:border-[#846FFA]/40 dark:bg-[#1E1E27]/75 dark:hover:border-[#846FFA]/50 dark:hover:bg-[#1E1E27]/85 shadow-md"
          : "border-[#846FFA]/25 bg-white/60 hover:border-[#846FFA]/35 hover:bg-white/75 dark:border-[#846FFA]/30 dark:bg-[#1E1E27]/65 dark:hover:border-[#846FFA]/40 dark:hover:bg-[#1E1E27]/75"
      );

      return (
        <button
          key={entry.id}
          type="button"
          data-testid={
            variant === "latest" ? "receipt-row-latest" : "receipt-row"
          }
          onClick={() => {
            setSelectedReceipt(entry);
            setReceiptDetailOpen(true);
          }}
          className={containerClasses}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="break-words text-sm font-semibold text-[#1A1A1A] transition group-hover:text-[#2F285F] dark:text-[#F8F8FF] dark:group-hover:text-[#DAD7FF]">
                {record.summary}
              </p>
              {variant === "latest" && errorSnippet ? (
                <p className="overflow-hidden text-ellipsis break-all text-xs text-destructive/80 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                  {errorSnippet}
                </p>
              ) : null}
              {variant === "history" ? (
                <span className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                  Executed{" "}
                  {formatTimestamp(record.executedAt ?? record.createdAt)}
                </span>
              ) : null}
            </div>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                statusTone
              )}
            >
              {statusLabel}
            </span>
          </div>
          {variant === "latest" ? (
            <div className="grid gap-2 text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80 md:grid-cols-2">
              <span className="break-words">
                Executed{" "}
                {formatTimestamp(record.executedAt ?? record.createdAt)}
              </span>
              <span className="flex flex-wrap items-center gap-1 break-words">
                Tx:{" "}
                {txLink ? (
                  <a
                    className="inline-flex items-center gap-1 text-[#674CF9] underline decoration-dotted underline-offset-2 dark:text-[#DAD7FF]"
                    href={txLink}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {txLabel}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  txLabel
                )}
              </span>
              <span className="break-words">
                Quote {record.quoteId ?? "n/a"}
              </span>
              <span className="break-words">
                Plan {record.planHash ? shortHex(record.planHash) : "n/a"}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">
              <span className="break-all">
                Tx:{" "}
                {txLink ? (
                  <a
                    className="inline-flex items-center gap-1 text-[#674CF9] underline decoration-dotted underline-offset-2 dark:text-[#DAD7FF]"
                    href={txLink}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {txLabel}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  txLabel
                )}
              </span>
              <span className="break-words">
                Quote {record.quoteId ?? "n/a"}
              </span>
              <span className="break-words">
                Plan {record.planHash ? shortHex(record.planHash) : "n/a"}
              </span>
            </div>
          )}
        </button>
      );
    },
    [setReceiptDetailOpen, setSelectedReceipt]
  );

  const handleOpenDelegationDetail = React.useCallback(
    (entry: StoredDelegation) => {
      setSelectedDelegationEntry(entry);
      setDelegationDetailOpen(true);
    },
    []
  );

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
      { active: 0, expired: 0, revoked: 0, total: delegations.length }
    );
  }, [delegations]);

  const sections: { id: typeof activeSection; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "actions", label: "Actions" },
    { id: "delegations", label: "Delegations" },
    { id: "receipts", label: "Receipts" },
  ];

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
    if (
      revokeSelection !== "auto" &&
      !availableModes.includes(revokeSelection)
    ) {
      setRevokeSelection("auto");
    }
  }, [availableModes, revokeSelection]);

  React.useEffect(() => {
    if (receipts.length <= 1 && showReceiptsHistory) {
      setShowReceiptsHistory(false);
    }
  }, [receipts.length, showReceiptsHistory]);

  const refreshSessionOverview = React.useCallback(() => {
    const walletAddress = identity.wallet?.address;
    const ownerAddress = walletAddress
      ? getAddress(walletAddress as Address)
      : undefined;
    const activeDelegator = getActiveDelegator();
    const delegatorAddress =
      activeDelegator ??
      (ownerAddress ? getOwnerDelegator(ownerAddress) : undefined);

    if (!delegatorAddress) {
      // Fallback: Load ALL delegations from storage
      // This allows users to see and manage orphaned delegations
      const allStoredDelegations = listDelegations();
      
      if (ownerAddress) {
        setQuickStatus({
          ...defaultStatus,
          delegator: shortHex(ownerAddress),
          delegatorFull: ownerAddress,
          smartAccount:
            identity.status === "connected"
              ? "HybridDelegator not derived (loading all stored delegations)"
              : "Awaiting connection",
        });
        setDelegations(allStoredDelegations);
        setReceipts(listReceipts(undefined, 10));
      } else {
        setQuickStatus(defaultStatus);
        setDelegations(allStoredDelegations);
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
        smartAccount:
          identity.status === "connected"
            ? "Awaiting issuance"
            : "Stored delegation",
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
      setShowDelegationHistory(false);
      setDelegationDetailOpen(false);
      setSelectedDelegationEntry(null);
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

  React.useEffect(() => {
    if (!sessionDelegatorFull) {
      setBalanceEntries({ delegator: [], session: [] });
      return;
    }

    let cancelled = false;

    const tokensMeta = (() => {
      const map = new Map<
        string,
        { address: Address; symbol?: string; decimals: number; kind?: string }
      >();
      try {
        const nativeAddress = getAddress(MONAD_NATIVE_TOKEN_ADDRESS);
        map.set(nativeAddress.toLowerCase(), {
          address: nativeAddress,
          symbol: MONAD_NATIVE_TOKEN_SYMBOL,
          decimals: 18,
          kind: "native",
        });
      } catch {
        // ignore invalid native token address
      }

      allowedDelegationTokens.forEach((token) => {
        if (!token?.address) return;
        try {
          const address = getAddress(token.address as Address);
          if (map.has(address.toLowerCase())) return;
          const decimalsCandidate =
            typeof token.decimals === "number"
              ? token.decimals
              : Number(token.decimals ?? 18);
          map.set(address.toLowerCase(), {
            address,
            symbol: token.symbol ?? undefined,
            decimals: Number.isFinite(decimalsCandidate)
              ? decimalsCandidate
              : 18,
            kind: token.kind,
          });
        } catch {
          // ignore malformed addresses
        }
      });

      return Array.from(map.values());
    })();

    const client = createMonadPublicClient();

    const fetchBalancesFor = async (
      owner: Address
    ): Promise<BalanceEntry[]> => {
      if (!owner || tokensMeta.length === 0) return [];
      const results = await Promise.all(
        tokensMeta.map(async (meta) => {
          let raw = 0n;
          try {
            if (
              meta.kind === "native" ||
              meta.address.toLowerCase() ===
                MONAD_NATIVE_TOKEN_ADDRESS.toLowerCase()
            ) {
              raw = await client.getBalance({ address: owner });
            } else {
              raw = (await client.readContract({
                address: meta.address,
                abi: ERC20_BALANCE_ABI,
                functionName: "balanceOf",
                args: [owner],
              })) as bigint;
            }
          } catch {
            raw = 0n;
          }

          if (raw <= 0n) {
            return null;
          }

          const decimals = Number.isFinite(meta.decimals) ? meta.decimals : 18;
          const amount = formatBalanceValue(raw, decimals);

          return {
            address: meta.address,
            symbol: meta.symbol ?? shortHex(meta.address),
            amount,
            raw,
            decimals,
          } satisfies BalanceEntry;
        })
      );

      return results
        .filter((entry): entry is BalanceEntry => Boolean(entry))
        .sort((left, right) => {
          if (left.raw === right.raw) return 0;
          return left.raw > right.raw ? -1 : 1;
        });
    };

    const run = async () => {
      setBalancesLoading(true);
      setBalancesError(null);
      try {
        const delegatorAddress = getAddress(sessionDelegatorFull as Address);
        const [delegatorBalances, sessionBalances] = await Promise.all([
          fetchBalancesFor(delegatorAddress),
          quickStatus.sessionKeyFull
            ? fetchBalancesFor(
                getAddress(quickStatus.sessionKeyFull as Address)
              )
            : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setBalanceEntries({
            delegator: delegatorBalances,
            session: sessionBalances,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setBalanceEntries({ delegator: [], session: [] });
          setBalancesError(describeError(error));
        }
      } finally {
        if (!cancelled) {
          setBalancesLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    allowedTokenKey,
    allowedDelegationTokens,
    quickStatus.sessionKeyFull,
    sessionDelegatorFull,
  ]);

  const handleCopy = React.useCallback((value?: string) => {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard)
      return;
    void navigator.clipboard.writeText(value).catch(() => undefined);
  }, []);

  const handleRevoke = React.useCallback(async () => {
    if (!walletClient || !walletAddress) {
      setRevokeError("Connect your account before revoking delegations.");
      return;
    }

    if (activeDelegations.length === 0) {
      setRevokeError("No active delegations found. Refresh the page and try again.");
      return;
    }

    setIsRevoking(true);
    setRevokeError(null);

    try {
      const mode = revokeSelection === "auto" ? undefined : revokeSelection;
      
      console.log("[Revoke] Attempting to revoke delegations", {
        mode,
        owner: walletAddress,
        activeDelegations: activeDelegations.length,
        allDelegations: delegations.length,
      });
      
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
          ? `Delegations revoked (tx: ${shortHex(txLabel)})`
          : "Delegations revoked."
      );
      setRevokePending(false);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      refreshSessionOverview();
    } catch (error) {
      console.error("[Revoke] Failed to revoke delegations", error);
      
      const errorMessage = describeError(error);
      const isRpcTransient = 
        errorMessage.includes("Block requested not found") ||
        errorMessage.includes("compute units per second") ||
        errorMessage.includes("rate limit");
      
      if (isRpcTransient) {
        setRevokeError("RPC temporarily unavailable. Please wait a moment and try again.");
      } else {
        setRevokeError(errorMessage);
      }
      
      setRevokeSuccess(null);
    } finally {
      setIsRevoking(false);
    }
  }, [walletClient, walletAddress, revokeSelection, refreshSessionOverview, activeDelegations, delegations]);

  const handleRotateSessionKey = React.useCallback(async () => {
    if (!walletClient || !walletAddress) {
      setRotateError("Connect your account before rotating the session key.");
      return;
    }
    setIsRotating(true);
    setRotateError(null);
    setRotateSuccess(null);

    try {
      const result = await rotateHybridDelegatorSession(
        walletClient,
        walletAddress
      );
      setRotateSuccess(
        `Session key rotated to ${shortHex(result.sessionKey.address)}.`
      );
      setActiveDelegator(result.delegator, walletAddress);
      setOwnerDelegator(walletAddress, result.delegator);
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
                <DialogTitle className="text-2xl font-semibold text-[#1A1A1A] dark:text-[#F8F8FF]">
                  Connected account
                </DialogTitle>
                <DialogDescription className="max-w-xl text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/85">
                  Manage your Web3Auth session, delegations, session key, and
                  guardrails that power the chat console.
                </DialogDescription>
              </div>
              <span
                className={cn(
                  "inline-flex h-9 items-center justify-center rounded-full border px-4 text-xs font-semibold uppercase tracking-[0.18em]",
                  connectionBadgeClass
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
                      : "bg-white/60 text-[#5C5C5C] hover:bg-white/80 dark:bg-[#1E1E27]/60 dark:text-[#C7C3E8]/80 dark:hover:bg-[#1E1E27]/75"
                  )}
                >
                  {section.label}
                </Button>
              ))}
            </div>

            {activeSection === "overview" ? (
              <div className="space-y-6" data-testid="overview-section">
                <GlassPanel className="space-y-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                        Connection
                      </h3>
                      <p className="text-base font-medium text-[#2F285F] dark:text-[#F8F8FF]">
                        {walletAddress ? `Owner ${shortHex(walletAddress)}` : "Web3Auth not connected"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {!connected ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            // Close the dialog first to prevent Radix overlay from blocking Web3Auth modal
                            setOpen(false);

                            // Wait for dialog to fully close before opening Web3Auth
                            setTimeout(() => {
                              void identity.connect().catch((error) => {
                                // Silently handle user cancellation
                                if (error instanceof Error && error.message.toLowerCase().includes("user closed")) {
                                  console.log("[Web3Auth] User cancelled connection");
                                  return;
                                }
                                console.error("Web3Auth connection failed", error);
                              });
                            }, 300);
                          }}
                          disabled={connectBusy}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-full border border-[#846FFA]/40 bg-white/90 px-5 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#3F356F] shadow-[0_12px_30px_rgba(132,111,250,0.2)] transition hover:bg-[#846FFA]/18 hover:text-[#2F285F] dark:border-[#846FFA]/45 dark:bg-[#1E1E27]/70 dark:text-[#E4E3FF] dark:hover:bg-[#846FFA]/30",
                            connectBusy && "opacity-60"
                          )}
                        >
                          <span className="flex items-center gap-2">
                            {connectBusy ? <Spinner className="h-3.5 w-3.5" /> : null}
                            {connectLabel}
                          </span>
                        </Button>
                      ) : null}
                      {showDisconnectButton ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => void identity.disconnect()}
                          className="inline-flex items-center gap-2 rounded-full border border-[#846FFA]/25 bg-white/70 px-5 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#5C5C5C] shadow-[0_8px_20px_rgba(132,111,250,0.12)] backdrop-blur-sm transition hover:border-[#846FFA]/35 hover:bg-white/85 hover:text-[#3F356F] dark:border-[#846FFA]/25 dark:bg-[#1E1E27]/70 dark:text-[#C7C3E8] dark:hover:border-[#846FFA]/35 dark:hover:bg-[#1E1E27]/85"
                        >
                          Disconnect
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {identity.error ? (
                    <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
                      {identity.error}
                    </p>
                  ) : null}
                </GlassPanel>

                <div className="grid gap-4 sm:grid-cols-2">
                  <StatCard
                    icon={<Sparkles className="h-3.5 w-3.5" />}
                    label="Delegator"
                    value={sessionDelegatorLabel}
                    testId="connected-delegator"
                    description={
                      sessionDelegatorFull
                        ? "Settlement account for delegated actions."
                        : "Connect to derive a HybridDelegator."
                    }
                    actions={
                      <div className="flex items-center justify-between gap-3 w-full">
                        <span className="truncate text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                          {walletAddress
                            ? `Owner ${shortHex(walletAddress)}`
                            : "No owner connected"}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 rounded-full border border-[#846FFA]/30 bg-white/70 text-[#846FFA] shadow-sm hover:bg-[#846FFA]/15 dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/25"
                          onClick={() => handleCopy(sessionDelegatorFull)}
                          disabled={!sessionDelegatorFull}
                          aria-label="Copy delegator address"
                        >
                          <ClipboardCopy className="h-4 w-4" />
                        </Button>
                      </div>
                    }
                  />
                  <StatCard
                    icon={<KeyRound className="h-3.5 w-3.5" />}
                    label="Session key"
                    value={quickStatus.sessionKey}
                    testId="connected-session-key"
                    description={
                      <div className="space-y-1 text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                        <span data-testid="connected-session-expiry">
                          Expiry {quickStatus.expiry}
                        </span>
                        <span>
                          {quickStatus.mode !== "—"
                            ? `Mode ${quickStatus.mode}`
                            : "Awaiting issuance"}
                        </span>
                      </div>
                    }
                    actions={
                      <div className="flex items-center justify-end w-full">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 rounded-full border border-[#846FFA]/30 bg-white/70 text-[#846FFA] shadow-sm hover:bg-[#846FFA]/15 dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/25"
                          onClick={() => handleCopy(quickStatus.sessionKeyFull)}
                          disabled={!quickStatus.sessionKeyFull}
                          aria-label="Copy session key address"
                        >
                          <ClipboardCopy className="h-4 w-4" />
                        </Button>
                      </div>
                    }
                  />
              </div>

                <GlassPanel className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7A6FAF] dark:text-[#C7C3E8]">
                      Balances
                    </h3>
                    {balancesLoading ? (
                      <Spinner className="h-4 w-4 text-[#846FFA]" />
                    ) : null}
                  </div>
                  {balancesError ? (
                    <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                      {balancesError}
                    </p>
                  ) : null}
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                        Delegator
                      </h4>
                      {renderBalanceItems(
                        balanceEntries.delegator,
                        "No balances recorded yet."
                      )}
                    </div>
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                        Session key
                      </h4>
                      {quickStatus.sessionKeyFull ? (
                        renderBalanceItems(
                          balanceEntries.session,
                          "Session key has no funds yet."
                        )
                      ) : (
                        <p className="text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                          Issue a delegation to assign a session key.
                        </p>
                      )}
                    </div>
                  </div>
                </GlassPanel>
              </div>
            ) : null}

            {activeSection === "actions" ? (
              <GlassPanel className="space-y-5" data-testid="actions-section">
                {/* Header */}
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7A6FAF] dark:text-[#C7C3E8]">
                    Delegation Actions
                  </h3>
                  <p className="text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                    Issue delegations and manage session keys
                  </p>
                </div>

                {/* Emergency Actions Bar */}
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                          Emergency Actions
                        </p>
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          Use these controls if your account is compromised
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={!connected || (!hasActiveDelegations && delegations.length === 0) || isRevoking}
                        onClick={() => {
                          console.log("[Revoke] Button clicked - opening confirmation panel");
                          setRevokePending(true);
                          setRevokeError(null);
                          setRevokeSuccess(null);
                        }}
                        className="rounded-full border border-red-600/40 px-4 py-2 text-xs font-semibold"
                        title={
                          !connected
                            ? "Connect your wallet to revoke delegations"
                            : delegations.length === 0
                            ? "No delegations found in storage"
                            : !hasActiveDelegations
                            ? "All delegations are already revoked or expired"
                            : undefined
                        }
                      >
                        <span className="flex items-center gap-2">
                          {isRevoking ? <Spinner className="h-3 w-3" /> : null}
                          Revoke All
                          {delegations.length > 0 && !hasActiveDelegations ? (
                            <span className="text-xs opacity-75">({delegations.length} expired)</span>
                          ) : null}
                        </span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        disabled={!connected || isRotating}
                        onClick={() => void handleRotateSessionKey()}
                        className="rounded-full border border-amber-600/40 bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-500/30 dark:border-amber-500/50 dark:text-amber-100 dark:hover:bg-amber-500/25"
                        title={
                          !connected
                            ? "Connect to rotate session key"
                            : undefined
                        }
                      >
                        <span className="flex items-center gap-2">
                          {isRotating ? <Spinner className="h-3 w-3" /> : null}
                          Rotate Key
                        </span>
                      </Button>
                    </div>
                  </div>

                  {/* Revoke Confirmation Panel */}
                  {revokePending ? (
                    <div className="mt-4 space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 dark:border-destructive/40 dark:bg-destructive/20">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-[#1A1A1A] dark:text-[#F8F8FF]">
                          Confirm Revoke All Delegations
                        </p>
                        <p className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                          This will revoke all active delegations and rotate the session key.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={!connected || isRevoking}
                          onClick={() => void handleRevoke()}
                          className="rounded-full px-4 py-2 text-xs font-semibold"
                        >
                          <span className="flex items-center gap-2">
                            {isRevoking ? <Spinner className="h-3 w-3" /> : null}
                            Confirm Revoke
                          </span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRevokePending(false);
                            setRevokeError(null);
                            setRevokeSuccess(null);
                          }}
                          className="rounded-full px-4 py-2 text-xs font-semibold"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Success/Error Messages */}
                {rotateSuccess ? (
                  <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-600 dark:text-emerald-400">
                    {rotateSuccess}
                  </p>
                ) : null}
                {rotateError ? (
                  <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                    {rotateError}
                  </p>
                ) : null}
                {revokeSuccess ? (
                  <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-600 dark:text-emerald-400">
                    {revokeSuccess}
                  </p>
                ) : null}
                {revokeError ? (
                  <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                    {revokeError}
                  </p>
                ) : null}

                {/* OnboardingPanel - Center Stage */}
                <OnboardingPanel
                  onStatusUpdate={setQuickStatus}
                  showIdentityCard={false}
                  showSummaryCards={false}
                />
              </GlassPanel>
            ) : null}

            {activeSection === "delegations" ? (
              <div className="space-y-6" data-testid="delegations-section">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border border-[#846FFA]/25 bg-white/65 px-3 py-1 text-xs font-semibold text-[#3F356F] dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#DAD7FF]">
                    Active {delegationCounts.active}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[#846FFA]/25 bg-white/65 px-3 py-1 text-xs font-semibold text-[#3F356F] dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#DAD7FF]">
                    Expired {delegationCounts.expired}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[#846FFA]/25 bg-white/65 px-3 py-1 text-xs font-semibold text-[#3F356F] dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#DAD7FF]">
                    Revoked {delegationCounts.revoked}
                  </span>
                </div>

                {primaryDelegation ? (
                  <GlassPanel className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7A6FAF] dark:text-[#C7C3E8]">
                            {(() => {
                              const now = Math.floor(Date.now() / 1000);
                              const isExpired = primaryDelegation.artifact.expiresAt && 
                                               primaryDelegation.artifact.expiresAt <= now;
                              const isRevoked = Boolean(primaryDelegation.revokedAt);
                              
                              if (isRevoked) return "Revoked delegation";
                              if (isExpired) return "Expired delegation";
                              return "Active delegation";
                            })()}
                          </h3>
                          {(() => {
                            const now = Math.floor(Date.now() / 1000);
                            const isExpired = primaryDelegation.artifact.expiresAt && 
                                             primaryDelegation.artifact.expiresAt <= now;
                            const isRevoked = Boolean(primaryDelegation.revokedAt);
                            
                            const statusLabel = isRevoked ? "Revoked" : isExpired ? "Expired" : "Active";
                            const statusTone = isRevoked
                              ? "bg-destructive/15 text-destructive"
                              : isExpired
                              ? "bg-amber-500/15 text-amber-600"
                              : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
                            
                            return (
                              <span className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                                statusTone
                              )}>
                                {statusLabel}
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                          {primaryDelegation.artifact.mode === "safe"
                            ? "Safe"
                            : "Normal"}{" "}
                          mode · Expires{" "}
                          {formatExpiry(primaryDelegation.artifact.expiresAt)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleOpenDelegationDetail(primaryDelegation)
                        }
                        className="rounded-full border border-[#846FFA]/30 px-3 py-1 text-xs font-semibold text-[#3F356F] hover:bg-[#846FFA]/12 dark:border-[#846FFA]/35 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/20"
                      >
                        View details
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(primaryDelegation.artifact.allowedTokens ?? [])
                        .slice(0, 6)
                        .map((token) => (
                          <span
                            key={`${primaryDelegation.id}-${token.address}`}
                            className="inline-flex items-center rounded-full bg-[#846FFA]/10 px-3 py-1 text-xs font-semibold text-[#3F356F] dark:bg-[#846FFA]/20 dark:text-[#E4E3FF]"
                          >
                            {token.symbol ?? shortHex(token.address)}
                          </span>
                        ))}
                      {(primaryDelegation.artifact.allowedTokens?.length ?? 0) >
                      6 ? (
                        <span className="text-xs text-[#7A6FAF] dark:text-[#C7C3E8]">
                          +
                          {(primaryDelegation.artifact.allowedTokens?.length ??
                            0) - 6}{" "}
                          more
                        </span>
                      ) : null}
                    </div>
                  </GlassPanel>
                ) : (
                  <GlassPanel>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                        No active delegations found. Issue one to enable swaps
                        and transfers.
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setActiveSection("actions");
                        }}
                        className="rounded-full border border-[#846FFA]/30 px-3 py-1 text-xs font-semibold text-[#3F356F] hover:bg-[#846FFA]/12 dark:border-[#846FFA]/35 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/20"
                      >
                        Issue delegation
                      </Button>
                    </div>
                  </GlassPanel>
                )}

                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7A6FAF] dark:text-[#C7C3E8]"></h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDelegationHistory((value) => !value)}
                    className="rounded-full border border-[#846FFA]/25 px-3 py-1 text-xs font-semibold text-[#3F356F] hover:bg-[#846FFA]/12 dark:border-[#846FFA]/35 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/20"
                  >
                    {showDelegationHistory ? "Hide history" : "Show history"}
                  </Button>
                </div>

                {showDelegationHistory ? (
                  <GlassPanel>
                    {delegations.length === 0 ? (
                      <p className="text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                        No delegations stored.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {delegations.map((entry) => {
                          const artifact = entry.artifact;
                          const tokens = (artifact.allowedTokens ?? []).map(
                            (token) => token.symbol ?? shortHex(token.address)
                          );
                          const now = Math.floor(Date.now() / 1000);
                          const isExpired = artifact.expiresAt
                            ? now >= artifact.expiresAt
                            : false;
                          const isRevoked = Boolean(entry.revokedAt);
                          const statusLabel = isRevoked
                            ? "Revoked"
                            : isExpired
                            ? "Expired"
                            : "Active";
                          const statusTone = isRevoked
                            ? "bg-destructive/15 text-destructive"
                            : isExpired
                            ? "bg-amber-500/15 text-amber-600"
                            : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";

                          return (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => handleOpenDelegationDetail(entry)}
                              className="w-full rounded-[1.25rem] border border-[#846FFA]/25 bg-white/65 px-4 py-3 text-left text-sm text-[#1A1A1A] shadow-sm transition hover:border-[#846FFA]/40 hover:bg-white/80 dark:border-[#846FFA]/30 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF] dark:hover:border-[#846FFA]/45 dark:hover:bg-[#1E1E27]/80"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-medium">
                                  {(artifact.kind ?? "swap") === "swap"
                                    ? "Swap"
                                    : "Transfer"}{" "}
                                  ·{" "}
                                  {artifact.mode === "safe" ? "Safe" : "Normal"}
                                </span>
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                                    statusTone
                                  )}
                                >
                                  {statusLabel}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                                Expires {formatExpiry(artifact.expiresAt)} ·
                                Tokens {tokens.slice(0, 4).join(", ")}
                                {tokens.length > 4
                                  ? `, +${tokens.length - 4} more`
                                  : ""}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </GlassPanel>
                ) : null}
              </div>
            ) : null}

            {activeSection === "receipts" ? (
              <div className="space-y-4" data-testid="receipts-section">
                {latestReceipt ? (
                  <GlassPanel className="space-y-3">
                    {(() => {
                      const { record } = latestReceipt;
                      const statusTone =
                        record.status === "success"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-destructive/15 text-destructive";
                      const statusLabel =
                        record.status === "success" ? "Success" : "Failed";
                      const executedAt = formatTimestamp(
                        record.executedAt ?? record.createdAt
                      );
                      const txLabel = record.txHash
                        ? shortHex(record.txHash)
                        : "Pending";
                      const explorerUrl =
                        monadChain.blockExplorers?.default?.url;
                      const txLink =
                        record.txHash && explorerUrl
                          ? `${explorerUrl}/tx/${record.txHash}`
                          : null;

                      return (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <h3 className="text-sm font-semibold uppercase tracking-wide text-[#7A6FAF] dark:text-[#C7C3E8]">
                                Latest receipt
                              </h3>
                              <p className="text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                                {record.summary}
                              </p>
                              <p className="text-xs text-[#7A6FAF] dark:text-[#C7C3E8]">
                                Executed {executedAt}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                                  statusTone
                                )}
                              >
                                {statusLabel}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedReceipt(latestReceipt);
                                  setReceiptDetailOpen(true);
                                }}
                                className="rounded-full border border-[#846FFA]/30 px-3 py-1 text-xs font-semibold text-[#3F356F] hover:bg-[#846FFA]/12 dark:border-[#846FFA]/35 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/20"
                              >
                                View details
                              </Button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="inline-flex items-center rounded-full bg-[#846FFA]/10 px-3 py-1 font-semibold text-[#3F356F] dark:bg-[#846FFA]/20 dark:text-[#E4E3FF]">
                              In ·{" "}
                              {formatTokenAmount(
                                record.amountInWei,
                                record.tokenIn.decimals,
                                record.tokenIn.symbol
                              )}
                            </span>
                            <span className="inline-flex items-center rounded-full bg-[#846FFA]/10 px-3 py-1 font-semibold text-[#3F356F] dark:bg-[#846FFA]/20 dark:text-[#E4E3FF]">
                              Out ·{" "}
                              {formatTokenAmount(
                                record.amountOutWei ?? record.minAmountOutWei,
                                record.tokenOut.decimals,
                                record.tokenOut.symbol
                              )}
                            </span>
                            <span className="inline-flex items-center rounded-full bg-[#846FFA]/10 px-3 py-1 font-semibold text-[#3F356F] dark:bg-[#846FFA]/20 dark:text-[#E4E3FF]">
                              Slippage {formatBasisPoints(record.slippageBps)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                            <span className="flex items-center gap-1">
                              Tx:
                              {txLink ? (
                                <a
                                  href={txLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[#674CF9] underline decoration-dotted underline-offset-2 dark:text-[#DAD7FF]"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {txLabel}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                txLabel
                              )}
                            </span>
                            <span>Quote {record.quoteId ?? "n/a"}</span>
                            <span>
                              Plan{" "}
                              {record.planHash
                                ? shortHex(record.planHash)
                                : "n/a"}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </GlassPanel>
                ) : (
                  <GlassPanel>
                    <p className="text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                      Swaps executed from this browser will appear here with
                      status, summary, and transaction links.
                    </p>
                  </GlassPanel>
                )}

                {showReceiptsHistory && receiptHistory.length > 0 ? (
                  <GlassPanel className="space-y-2">
                    {receiptHistory.map((entry) =>
                      renderReceiptSummary(entry, "history")
                    )}
                  </GlassPanel>
                ) : null}

                {receiptHistory.length > 0 ? (
                  <div className="flex justify-end pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowReceiptsHistory((value) => !value)}
                      className="rounded-full border border-[#846FFA]/25 px-3 py-1 text-xs font-semibold text-[#3F356F] hover:bg-[#846FFA]/12 dark:border-[#846FFA]/35 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/20"
                    >
                      {showReceiptsHistory ? "Hide history" : "Show history"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <NestedDialog
        open={delegationDetailOpen && Boolean(selectedDelegationEntry)}
        onOpenChange={(next) => {
          if (!next) {
            setDelegationDetailOpen(false);
            setSelectedDelegationEntry(null);
          } else {
            setDelegationDetailOpen(true);
          }
        }}
      >
        <NestedDialogContent className="max-w-3xl overflow-hidden rounded-[2rem] border border-[#846FFA]/35 bg-white/90 p-0 shadow-[0_30px_70px_rgba(132,111,250,0.32)] backdrop-blur-2xl dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/95">
          <NestedDialogHeader className="px-8 pb-4 pt-6">
            <NestedDialogTitle className="text-lg font-semibold text-[#2F285F] dark:text-[#F8F8FF]">
              Delegation details
            </NestedDialogTitle>
            <NestedDialogDescription className="text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
              Review parameters for the selected delegation artifact.
            </NestedDialogDescription>
          </NestedDialogHeader>
          <NestedDialogBody className="space-y-4 px-8 pb-8">
            {selectedDelegationEntry ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#846FFA]/25 bg-white/65 p-4 text-sm text-[#1A1A1A] shadow-sm dark:border-[#846FFA]/30 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                      Mode
                    </p>
                    <p className="mt-1 text-base font-semibold">
                      {(selectedDelegationEntry.artifact.mode ?? "safe") ===
                      "safe"
                        ? "Safe"
                        : "Normal"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#846FFA]/25 bg-white/65 p-4 text-sm text-[#1A1A1A] shadow-sm dark:border-[#846FFA]/30 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                      Status
                    </p>
                    <p className="mt-1 text-base font-semibold">
                      {selectedDelegationEntry.revokedAt
                        ? `Revoked · ${new Date(
                            selectedDelegationEntry.revokedAt
                          ).toLocaleString()}`
                        : isDelegationExpired(selectedDelegationEntry.artifact)
                        ? "Expired"
                        : "Active"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#846FFA]/25 bg-white/65 p-4 text-sm text-[#1A1A1A] shadow-sm dark:border-[#846FFA]/30 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                      Expires
                    </p>
                    <p className="mt-1 text-base font-semibold">
                      {formatExpiry(selectedDelegationEntry.artifact.expiresAt)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#846FFA]/25 bg-white/65 p-4 text-sm text-[#1A1A1A] shadow-sm dark:border-[#846FFA]/30 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                      Issued
                    </p>
                    <p className="mt-1 text-base font-semibold">
                      {new Date(
                        selectedDelegationEntry.createdAt
                      ).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                    Allowed tokens
                  </h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(selectedDelegationEntry.artifact.allowedTokens ?? []).map(
                      (token) => (
                        <span
                          key={`${selectedDelegationEntry.id}-${token.address}`}
                          className="inline-flex items-center rounded-full bg-[#846FFA]/10 px-3 py-1 text-xs font-semibold text-[#3F356F] dark:bg-[#846FFA]/20 dark:text-[#E4E3FF]"
                        >
                          {token.symbol ?? shortHex(token.address)}
                        </span>
                      )
                    )}
                    {(selectedDelegationEntry.artifact.allowedTokens?.length ??
                      0) === 0 ? (
                      <span className="text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                        No tokens recorded.
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#846FFA]/25 bg-white/65 p-4 text-sm text-[#1A1A1A] shadow-sm dark:border-[#846FFA]/30 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                      Call limits
                    </p>
                    <p className="mt-1 text-base font-semibold">
                      {selectedDelegationEntry.artifact.callsUnlimited ||
                      !selectedDelegationEntry.artifact.callLimit
                        ? "Unlimited"
                        : `${selectedDelegationEntry.artifact.callLimit} calls`}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#846FFA]/25 bg-white/65 p-4 text-sm text-[#1A1A1A] shadow-sm dark:border-[#846FFA]/30 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                      Native cap
                    </p>
                    <p className="mt-1 text-base font-semibold">
                      {selectedDelegationEntry.artifact.nativeTokenCapWei
                        ? `${formatBalanceValue(
                            BigInt(
                              selectedDelegationEntry.artifact.nativeTokenCapWei
                            ),
                            18
                          )} ${MONAD_NATIVE_TOKEN_SYMBOL}`
                        : "Unlimited"}
                    </p>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                    Raw artifact
                  </h4>
                  <pre className="mt-2 max-h-60 overflow-auto rounded-[1rem] bg-[#F4F3FF] p-4 text-xs text-[#2F285F] dark:bg-[#1E1E27] dark:text-[#E4E3FF]">
                    {JSON.stringify(selectedDelegationEntry.artifact, null, 2)}
                  </pre>
                </div>
              </>
            ) : null}
          </NestedDialogBody>
        </NestedDialogContent>
      </NestedDialog>

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
              <NestedDialogTitle className="text-lg font-semibold text-[#2F285F] dark:text-[#F8F8FF]">
                Swap receipt details
              </NestedDialogTitle>
              <NestedDialogDescription className="text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                Stored locally on{" "}
                {new Date(selectedReceipt.storedAt).toLocaleString()}
              </NestedDialogDescription>
            </NestedDialogHeader>
            <NestedDialogBody className="space-y-6">
              <div className="rounded-[1.5rem] border border-[#846FFA]/25 bg-white/70 p-4 shadow-sm dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/75">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-[#1A1A1A] dark:text-[#F8F8FF]">
                      {selectedReceipt.record.summary}
                    </p>
                    <p className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                      Mode {selectedReceipt.record.mode} · Delegator{" "}
                      {shortHex(selectedReceipt.record.delegator)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]",
                      selectedReceipt.record.status === "success"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-destructive/15 text-destructive"
                    )}
                  >
                    {selectedReceipt.record.status === "success"
                      ? "Success"
                      : "Failed"}
                  </span>
                </div>
                <dl className="mt-4 grid gap-2 text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                      Executed
                    </dt>
                    <dd>
                      {formatTimestamp(
                        selectedReceipt.record.executedAt ??
                          selectedReceipt.record.createdAt
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                      Created
                    </dt>
                    <dd>{formatTimestamp(selectedReceipt.record.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                      Session key
                    </dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      {shortHex(selectedReceipt.record.sessionKey)}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-full border border-[#846FFA]/35 bg-white/75 text-[#846FFA] hover:bg-[#846FFA]/15 dark:border-[#846FFA]/40 dark:bg-[#1E1E27]/70 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/25"
                        onClick={() =>
                          handleCopy(selectedReceipt.record.sessionKey)
                        }
                        aria-label="Copy session key"
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" />
                      </Button>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                      Quote ID
                    </dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      <span className="break-all">
                        {selectedReceipt.record.quoteId ?? "n/a"}
                      </span>
                      {selectedReceipt.record.quoteId ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 rounded-full border border-[#846FFA]/35 bg-white/75 text-[#846FFA] hover:bg-[#846FFA]/15 dark:border-[#846FFA]/40 dark:bg-[#1E1E27]/70 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/25"
                          onClick={() =>
                            handleCopy(selectedReceipt.record.quoteId ?? "")
                          }
                          aria-label="Copy quote id"
                        >
                          <ClipboardCopy className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                      Plan hash
                    </dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      <span className="break-all">
                        {selectedReceipt.record.planHash
                          ? shortHex(selectedReceipt.record.planHash)
                          : "n/a"}
                      </span>
                      {selectedReceipt.record.planHash ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 rounded-full border border-[#846FFA]/35 bg-white/75 text-[#846FFA] hover:bg-[#846FFA]/15 dark:border-[#846FFA]/40 dark:bg-[#1E1E27]/70 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/25"
                          onClick={() =>
                            handleCopy(selectedReceipt.record.planHash ?? "")
                          }
                          aria-label="Copy plan hash"
                        >
                          <ClipboardCopy className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                      Slippage
                    </dt>
                    <dd>
                      {formatBasisPoints(selectedReceipt.record.slippageBps)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="min-w-0 space-y-1 overflow-hidden rounded-[1.25rem] border border-[#846FFA]/25 bg-white/65 p-4 text-sm text-[#1A1A1A] shadow-sm dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                    Amount in
                  </p>
                  <p className="mt-1 text-base font-semibold">
                    {formatTokenAmount(
                      selectedReceipt.record.amountInWei,
                      selectedReceipt.record.tokenIn.decimals,
                      selectedReceipt.record.tokenIn.symbol
                    )}
                  </p>
                  <p className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80 break-all">
                    {selectedReceipt.record.tokenIn.address}
                  </p>
                </div>
                <div className="min-w-0 space-y-1 overflow-hidden rounded-[1.25rem] border border-[#846FFA]/25 bg-white/65 p-4 text-sm text-[#1A1A1A] shadow-sm dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                    Minimum out
                  </p>
                  <p className="mt-1 text-base font-semibold">
                    {formatTokenAmount(
                      selectedReceipt.record.minAmountOutWei,
                      selectedReceipt.record.tokenOut.decimals,
                      selectedReceipt.record.tokenOut.symbol
                    )}
                  </p>
                  <p className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80 break-all">
                    {selectedReceipt.record.tokenOut.address}
                  </p>
                </div>
                <div className="min-w-0 space-y-1 overflow-hidden rounded-[1.25rem] border border-[#846FFA]/25 bg-white/65 p-4 text-sm text-[#1A1A1A] shadow-sm dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                    Actual out
                  </p>
                  <p className="mt-1 text-base font-semibold">
                    {selectedReceipt.record.amountOutWei
                      ? formatTokenAmount(
                          selectedReceipt.record.amountOutWei,
                          selectedReceipt.record.tokenOut.decimals,
                          selectedReceipt.record.tokenOut.symbol
                        )
                      : "Pending"}
                  </p>
                  <p className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80 break-words">
                    Tx hash{" "}
                    {selectedReceipt.record.txHash
                      ? shortHex(selectedReceipt.record.txHash)
                      : "pending"}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                    Delegator
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-[#1A1A1A] dark:text-[#F8F8FF]">
                    {shortHex(selectedReceipt.record.delegator)}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 rounded-full border border-[#846FFA]/35 bg-white/75 text-[#846FFA] hover:bg-[#846FFA]/15 dark:border-[#846FFA]/40 dark:bg-[#1E1E27]/70 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/25"
                      onClick={() =>
                        handleCopy(selectedReceipt.record.delegator)
                      }
                      aria-label="Copy delegator"
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                    </Button>
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                    Gas used
                  </p>
                  <p className="mt-1 text-[#1A1A1A] dark:text-[#F8F8FF]">
                    {selectedReceipt.record.gasUsedWei
                      ? `${formatTokenAmount(
                          selectedReceipt.record.gasUsedWei,
                          18,
                          MONAD_NATIVE_TOKEN_SYMBOL
                        )} (estimated)`
                      : "—"}
                  </p>
                </div>
              </div>

              {selectedReceipt.record.txHash ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-[#846FFA]/25 bg-[#846FFA]/8 px-4 py-3 text-sm text-[#3F356F] shadow-sm dark:border-[#846FFA]/45 dark:bg-[#846FFA]/20 dark:text-[#F8F8FF]">
                  <span className="break-all">
                    Transaction {selectedReceipt.record.txHash}
                  </span>
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
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-destructive">
                    Failure details
                  </p>
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
