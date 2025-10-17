"use client";

import * as React from "react";
import { ClipboardCopy, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { getAddress, parseEther, type Address } from "viem";
import type { AllowedToken, Mode } from "@pragma/core";

import { useIdentity } from "../../hooks/useIdentity";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Checkbox } from "../ui/checkbox";
import { Spinner } from "../ui/spinner";
import { StatCard } from "../ui/glass";
import { fetchAllowlist, initializeHybridDelegator, buildDelegationPlan, finalizeDelegations } from "../../lib/onboarding/service";
import {
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_WRAPPED_TOKEN_SYMBOL,
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONAD_WMON_ADDRESS,
} from "../../lib/config";
import { ensureTokenInSet } from "../../lib/monorail";
import type { WalletWithAddress } from "../../lib/clients";
import { loadChatSession } from "../../lib/chat/session";
import { getActiveDelegator, IDENTITY_EVENT } from "../../lib/storage/active-delegator";
import { getOwnerDelegator } from "../../lib/storage/owner-delegators";
import { cn } from "../../lib/utils";

export interface QuickStatusSnapshot {
  delegator: string;
  delegatorFull?: string;
  smartAccount: string;
  sessionKey: string;
  sessionKeyFull?: string;
  expiry: string;
  mode: string;
}

interface OnboardingPanelProps {
  onStatusUpdate?: (status: QuickStatusSnapshot) => void;
  onRequestClose?: () => void;
  showIdentityCard?: boolean;
  showSummaryCards?: boolean;
}

const SAFE_TTL_SECONDS = 60 * 60;
const NORMAL_TTL_SECONDS = 24 * 60 * 60;

type OnboardingState = "idle" | "loading" | "signing" | "completed" | "error";

const DEFAULT_TRANSFER_MON = "1";

const glassSectionClass =
  "rounded-[1.25rem] border border-[#846FFA]/22 bg-white/65 p-5 shadow-sm dark:border-[#846FFA]/30 dark:bg-[#1E1E27]/68";
const chipBaseClass =
  "flex w-full items-center justify-between gap-3 rounded-[1.15rem] border px-3 py-2 transition-colors";
const chipActiveClass =
  "border-[#846FFA]/50 bg-gradient-to-r from-[#846FFA]/18 to-[#674CF9]/24 shadow-[0_12px_28px_rgba(132,111,250,0.18)] dark:border-[#846FFA]/45 dark:from-[#846FFA]/20 dark:to-[#674CF9]/26";
const chipInactiveClass =
  "border-white/40 bg-white/52 hover:border-[#846FFA]/30 dark:border-white/10 dark:bg-[#1E1E27]/58 dark:hover:border-[#846FFA]/28";
const segmentedContainerClass =
  "inline-flex rounded-full border border-[#846FFA]/30 bg-white/60 p-1 text-sm shadow-sm dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70";
const segmentedOptionBaseClass =
  "flex-1 whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition";
const segmentedOptionActiveClass =
  "bg-gradient-to-r from-[#846FFA]/30 to-[#674CF9]/35 text-[#2F285F] shadow-[0_10px_24px_rgba(132,111,250,0.22)] dark:text-[#F8F8FF]";
const segmentedOptionInactiveClass =
  "text-[#5C5C5C] hover:text-[#2F285F] dark:text-[#C7C3E8]/80 dark:hover:text-[#F8F8FF]";

const tokenLabel = (token: AllowedToken) => {
  const symbol = token.symbol ?? token.address.slice(0, 6);
  return `${symbol} · ${token.address.slice(0, 6)}…${token.address.slice(-4)}`;
};

const shortHex = (value?: string) => {
  if (!value || value === "0x") return "—";
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};
const formatAddress = (address?: string) => (address ? shortHex(address) : "Web3Auth session not connected");
const formatExpiry = (expiresAt?: number) => {
  if (!expiresAt) return "—";
  return new Date(expiresAt * 1000).toLocaleString();
};

export const OnboardingPanel = ({
  onStatusUpdate,
  onRequestClose,
  showIdentityCard = true,
  showSummaryCards = true,
}: OnboardingPanelProps) => {
  const identity = useIdentity();
  const [availableTokens, setAvailableTokens] = React.useState<AllowedToken[]>([]);
  const [mode, setMode] = React.useState<Mode>("safe");
  const [safeTokenA, setSafeTokenA] = React.useState<string>("");
  const [safeTokenB, setSafeTokenB] = React.useState<string>("");
  const [normalSelections, setNormalSelections] = React.useState<Record<string, boolean>>({});
  const [callLimit, setCallLimit] = React.useState<string>("6");
  const [unlimitedCalls, setUnlimitedCalls] = React.useState(false);
  const [enableTransfer, setEnableTransfer] = React.useState(true);
  const [transferAmount, setTransferAmount] = React.useState(DEFAULT_TRANSFER_MON);
  const [rotateSessionKey, setRotateSessionKey] = React.useState(false);
  const [state, setState] = React.useState<OnboardingState>("idle");
  const [statusMessage, setStatusMessage] = React.useState<string>("");
  const [artifactsSummary, setArtifactsSummary] = React.useState<string[]>([]);
  const [walletRef, setWalletRef] = React.useState<WalletWithAddress | null>(null);
  const [delegationStatus, setDelegationStatus] = React.useState<{
    delegator?: string;
    sessionKey?: string;
    expiresAt?: number;
    mode?: Mode;
    smartAccountStatus?: "new" | "existing";
    deploymentTx?: string;
  } | null>(null);
  const [activeDelegator, setActiveDelegatorState] = React.useState<Address | undefined>(() => getActiveDelegator());

  const connectButtonDisabled = identity.status === "connecting" || identity.status === "initializing";
  const showDisconnectButton = identity.status === "connected" && Boolean(identity.wallet);
  const identityMessage = identity.status === "connecting"
    ? "Waiting for authentication..."
    : identity.status === "connected"
      ? "Authenticated. Your Web3Auth MPC key controls the HybridDelegator root."
      : identity.status === "error"
        ? "Connection failed. Retry to continue onboarding."
        : "Use your Web3Auth login to authenticate the HybridDelegator owner.";

  const quickStatus = React.useMemo<QuickStatusSnapshot>(() => {
    const derivedDelegator = delegationStatus?.delegator ?? activeDelegator ?? identity.wallet?.address;
    if (!derivedDelegator) {
      return {
        delegator: "Not connected",
        delegatorFull: undefined,
        smartAccount: "—",
        sessionKey: "—",
        sessionKeyFull: undefined,
        expiry: "—",
        mode: "—",
      } satisfies QuickStatusSnapshot;
    }

    const delegator = derivedDelegator;
    const sessionKey = delegationStatus?.sessionKey;

    let smartAccount: string;
    if (delegationStatus) {
      smartAccount =
        delegationStatus.smartAccountStatus === "new"
          ? `Deployed this session${delegationStatus.deploymentTx ? ` · tx ${shortHex(delegationStatus.deploymentTx)}` : ""}`
          : "Already deployed";
    } else if (delegator) {
      smartAccount = "Awaiting issuance";
    } else {
      smartAccount = "Deriving HybridDelegator…";
    }

    const delegatorLabel = delegator ? shortHex(delegator) : "Deriving…";

    return {
      delegator: delegatorLabel,
      delegatorFull: delegator,
      smartAccount,
      sessionKey: sessionKey ? shortHex(sessionKey) : "—",
      sessionKeyFull: sessionKey,
      expiry: formatExpiry(delegationStatus?.expiresAt),
      mode: delegationStatus?.mode ? (delegationStatus.mode === "safe" ? "Safe" : "Normal") : "—",
    } satisfies QuickStatusSnapshot;
  }, [activeDelegator, delegationStatus, identity.wallet]);

  React.useEffect(() => {
    if (!onStatusUpdate) return;
    onStatusUpdate(quickStatus);
  }, [onStatusUpdate, quickStatus]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const updateFromStorage = () => {
      const stored = getActiveDelegator();
      setActiveDelegatorState(stored ? getAddress(stored as Address) : undefined);
    };

    const handleIdentityChange = (event: Event) => {
      if (event instanceof CustomEvent && event.detail && "delegator" in event.detail) {
        const detail = (event as CustomEvent<{ delegator: string | null }>).detail;
        setActiveDelegatorState(detail.delegator ? getAddress(detail.delegator as Address) : undefined);
        return;
      }
      updateFromStorage();
    };

    updateFromStorage();
    window.addEventListener(IDENTITY_EVENT, handleIdentityChange as EventListener);
    return () => {
      window.removeEventListener(IDENTITY_EVENT, handleIdentityChange as EventListener);
    };
  }, []);

  React.useEffect(() => {
    if (!identity.wallet || identity.status !== "connected" || activeDelegator) return;
    const mapped = getOwnerDelegator(identity.wallet.address as Address);
    if (mapped) {
      setActiveDelegatorState(getAddress(mapped as Address));
    }
  }, [activeDelegator, identity.status, identity.wallet]);

  const normalSelectionsInitialized = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    const loadTokens = async () => {
      try {
        const tokens = await fetchAllowlist();
        if (cancelled) return;
        setAvailableTokens(tokens);
        const defaults = tokens.slice(0, 2);
        if (defaults[0]) setSafeTokenA(defaults[0].address);
        if (defaults[1]) setSafeTokenB(defaults[1].address);
        if (!normalSelectionsInitialized.current) {
          setNormalSelections({});
          normalSelectionsInitialized.current = true;
        }
      } catch (error) {
        console.error("Failed to fetch token allowlist", error);
      }
    };
    void loadTokens();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (mode === "safe") {
      setCallLimit("6");
      setUnlimitedCalls(false);
    } else {
      setCallLimit("12");
      setUnlimitedCalls(false);
    }
  }, [mode]);

  const hydrateStatusFromStorage = React.useCallback(() => {
    if (!activeDelegator) {
      setDelegationStatus(null);
      return;
    }

    const context = loadChatSession("swap", undefined, activeDelegator);
    if (!context) {
      setDelegationStatus(null);
      return;
    }

    setDelegationStatus({
      delegator: context.delegator,
      sessionKey: context.session.sessionKeyAddress,
      expiresAt: context.session.expiresAt,
      mode: context.session.mode,
      smartAccountStatus: "existing",
    });
  }, [activeDelegator]);

  React.useEffect(() => {
    if (!identity.wallet || identity.status !== "connected") {
      setDelegationStatus(null);
      setWalletRef(null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("pragma:delegation:updated"));
      }
      return;
    }

    hydrateStatusFromStorage();
  }, [hydrateStatusFromStorage, identity.status, identity.wallet]);

  React.useEffect(() => {
    if (!identity.wallet || identity.status !== "connected" || !activeDelegator) return;
    hydrateStatusFromStorage();
  }, [activeDelegator, hydrateStatusFromStorage, identity.status, identity.wallet]);

  const handleCopy = React.useCallback(async (value?: string) => {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      console.error("Failed to copy value", error);
    }
  }, []);

  const resolveWallet = React.useCallback(async (): Promise<WalletWithAddress> => {
    if (walletRef) return walletRef;
    if (identity.wallet) {
      setWalletRef(identity.wallet);
      return identity.wallet;
    }
    onRequestClose?.();
    const walletClient = await identity.connect();
    setWalletRef(walletClient);
    return walletClient;
  }, [identity, onRequestClose, walletRef]);

  React.useEffect(() => {
    const handler = () => hydrateStatusFromStorage();
    if (typeof window !== "undefined") {
      window.addEventListener("pragma:delegation:updated", handler);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("pragma:delegation:updated", handler);
      }
    };
  }, [hydrateStatusFromStorage]);

  const buildTokenList = React.useCallback((): AllowedToken[] => {
    if (mode === "safe") {
      const tokenA = availableTokens.find((token) => token.address === safeTokenA);
      const tokenB = availableTokens.find((token) => token.address === safeTokenB);
      return [tokenA, tokenB].filter((token): token is AllowedToken => Boolean(token));
    }
    return availableTokens.filter((token) => normalSelections[token.address]);
  }, [availableTokens, mode, normalSelections, safeTokenA, safeTokenB]);

  const includeNativeWrapPair = React.useCallback(
    (tokens: AllowedToken[]): AllowedToken[] => {
      const result = [...tokens];
      const native = availableTokens.find(
        (token) =>
          token.kind === "native" || token.address.toLowerCase() === MONAD_NATIVE_TOKEN_ADDRESS.toLowerCase(),
      );
      if (native) ensureTokenInSet(result, native);
      const wrapped = availableTokens.find(
        (token) =>
          token.kind === "wrappedNative" || token.address.toLowerCase() === MONAD_WMON_ADDRESS.toLowerCase(),
      );
      if (wrapped) ensureTokenInSet(result, wrapped);
      return result;
    },
    [availableTokens],
  );

  const annotateTokenKinds = React.useCallback(
    (tokens: AllowedToken[]): AllowedToken[] =>
      tokens.map((token) => {
        const normalized = token.address.toLowerCase();
        if (normalized === MONAD_NATIVE_TOKEN_ADDRESS.toLowerCase()) {
          return { ...token, kind: "native" };
        }
        if (normalized === MONAD_WMON_ADDRESS.toLowerCase()) {
          return { ...token, kind: "wrappedNative" };
        }
        return token;
      }),
    [],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setArtifactsSummary([]);
    setStatusMessage("");

    try {
      setState("loading");
      const wallet = await resolveWallet();
      const tokens = annotateTokenKinds(includeNativeWrapPair(buildTokenList()));
      if (tokens.length < 2) {
        throw new Error("Select at least two tokens for the delegation scope.");
      }

      const expiresAt = Math.floor(Date.now() / 1000) + (mode === "safe" ? SAFE_TTL_SECONDS : NORMAL_TTL_SECONDS);
      const numericCallLimit = Number.parseInt(callLimit, 10);
      if (!unlimitedCalls && (!Number.isFinite(numericCallLimit) || numericCallLimit <= 0)) {
        throw new Error("Call limit must be a positive integer.");
      }

      setStatusMessage("Provisioning HybridDelegator...");
      const init = await initializeHybridDelegator(wallet.walletClient, wallet.address, {
        rotateKey: rotateSessionKey,
      });

      setDelegationStatus({
        delegator: init.handle.delegator,
        sessionKey: init.sessionKey.address,
        mode,
        smartAccountStatus: init.deployment ? "new" : "existing",
        deploymentTx: init.deployment?.transactionHash,
      });

      const statusParts: string[] = [];
      if (init.deployment) {
        statusParts.push(
          init.deployment.transactionHash
            ? `HybridDelegator deployed (tx ${shortHex(init.deployment.transactionHash)})`
            : "HybridDelegator deployed",
        );
      } else {
        statusParts.push(`HybridDelegator ready at ${shortHex(init.handle.delegator)}`);
      }
      statusParts.push(
        init.sessionKey.isNew
          ? `Created session key ${shortHex(init.sessionKey.address)}`
          : `Reusing session key ${shortHex(init.sessionKey.address)}`,
      );

      const updateStatus = (next?: string) => {
        const parts = [...statusParts];
        if (next) parts.push(next);
        setStatusMessage(parts.join(" • "));
      };

      const swapOptions = {
        mode,
        allowedTokens: tokens,
        expiresAt,
        unlimitedCalls,
        callLimit: unlimitedCalls ? undefined : numericCallLimit,
      } satisfies Parameters<typeof buildDelegationPlan>[1];

      const transferOptions = enableTransfer
        ? {
            enabled: true,
            maxAmountWei: parseEther(transferAmount),
          }
        : undefined;

      updateStatus("Preparing delegation payloads…");
      const plan = buildDelegationPlan(init, swapOptions, transferOptions);

      updateStatus("Awaiting signatures…");
      setState("signing");
      const artifacts = await finalizeDelegations(wallet.walletClient, wallet.address, plan);

      const summaries = artifacts.map((artifact) => {
        const modeLabel = artifact.mode === "safe" ? "Safe" : "Normal";
        const expiry = artifact.expiresAt
          ? new Date(artifact.expiresAt * 1000).toLocaleString()
          : "unknown";
        if (artifact.kind === "transfer") {
          return `${modeLabel} native transfer delegation · max ${Number(artifact.transferMaxAmount ?? "0") / 1e18} ${MONAD_NATIVE_TOKEN_SYMBOL} · expires ${expiry}`;
        }
        const symbols = (artifact.allowedTokens ?? []).map((token) => token.symbol ?? token.address.slice(0, 6));
        return `${modeLabel} swap delegation · tokens ${symbols.join(", ")} · expires ${expiry}`;
      });

      setArtifactsSummary(summaries);
      setStatusMessage("Delegations stored locally. Session ready for execution.");
      setState("completed");
      const swapArtifact = artifacts.find((artifact) => (artifact.kind ?? "swap") === "swap");
      setDelegationStatus({
        delegator: swapArtifact?.delegation.delegator ?? init.handle.delegator,
        sessionKey: init.sessionKey.address,
        expiresAt: swapArtifact?.expiresAt,
        mode,
        smartAccountStatus: init.deployment ? "new" : "existing",
        deploymentTx: init.deployment?.transactionHash,
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("pragma:delegation:updated"));
      }
    } catch (error) {
      setState("error");
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(message);
    }
  };

  const toggleNormalToken = (address: string, checked: boolean) => {
    setNormalSelections((prev) => {
      const next = { ...prev };
      if (checked) {
        next[address] = true;
      } else {
        delete next[address];
      }
      return next;
    });
  };

  const allNormalSelected = React.useMemo(
    () =>
      availableTokens.length > 0 && availableTokens.every((token) => Boolean(normalSelections[token.address])),
    [availableTokens, normalSelections],
  );

  const toggleAllNormalTokens = (checked: boolean) => {
    if (checked) {
      setNormalSelections(Object.fromEntries(availableTokens.map((token) => [token.address, true])));
    } else {
      setNormalSelections({});
    }
  };

  const selectedTokens = React.useMemo(() => buildTokenList(), [buildTokenList]);
  const tokenSummaryList = React.useMemo(
    () => selectedTokens.map((token) => token.symbol ?? shortHex(token.address)),
    [selectedTokens],
  );

  const tokensConfigured = selectedTokens.length >= 2;
  const sessionReady = state === "completed" || Boolean(delegationStatus?.sessionKey);
  const ownerAddress = identity.wallet?.address;

  const onboardingSteps = React.useMemo(
    () => [
      {
        label: "Authenticate owner",
        description: ownerAddress ? `Owner ${shortHex(ownerAddress)}` : "Connect with Web3Auth to continue",
        completed: identity.status === "connected" && Boolean(ownerAddress),
      },
      {
        label: "Configure guardrails",
        description:
          selectedTokens.length > 0
            ? `${selectedTokens.length} token${selectedTokens.length > 1 ? "s" : ""} in scope`
            : "Select allowed tokens",
        completed: tokensConfigured,
      },
      {
        label: "Issue session",
        description:
          state === "completed"
            ? "Delegations stored locally"
            : state === "signing"
              ? "Awaiting signatures"
              : state === "loading"
                ? "Provisioning HybridDelegator"
                : "Sign when ready",
        completed: sessionReady,
      },
    ],
    [identity.status, ownerAddress, selectedTokens.length, sessionReady, state, tokensConfigured],
  );

  const statusToneClass =
    state === "error"
      ? "border-destructive/55 bg-destructive/10 text-destructive"
      : state === "completed"
        ? "border-emerald-500/45 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
        : "border-[#846FFA]/45 bg-[#846FFA]/10 text-[#3F356F] dark:text-[#DAD7FF]";

  const sessionDelegatorLabel = quickStatus.delegator;
  const sessionDelegatorFull = quickStatus.delegatorFull;
  const sessionKeyFull = quickStatus.sessionKeyFull;
  const sessionExpiry = quickStatus.expiry;
  const sessionModeLabel = quickStatus.mode;

  const renderTokenControls = () => {
    if (mode === "safe") {
      return (
        <div className={cn(glassSectionClass, "space-y-4")} data-testid="onboarding-token-controls">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Swap pair scope</h3>
              <p className="mt-1 text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                Safe mode keeps swaps limited to a single token pair with a 1-hour expiry.
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tokenA" className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                Token in
              </Label>
              <Select value={safeTokenA} onValueChange={setSafeTokenA}>
                <SelectTrigger className="h-11 rounded-full border border-[#846FFA]/30 bg-white/70 text-sm text-[#1A1A1A] shadow-sm transition hover:bg-white/80 dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]/90 dark:hover:bg-[#1E1E27]/75">
                  <SelectValue placeholder="Select source token" />
                </SelectTrigger>
                <SelectContent>
                  {availableTokens.map((token) => (
                    <SelectItem key={token.address} value={token.address}>
                      {tokenLabel(token)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tokenB" className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7A6FAF] dark:text-[#C7C3E8]">
                Token out
              </Label>
              <Select value={safeTokenB} onValueChange={setSafeTokenB}>
                <SelectTrigger className="h-11 rounded-full border border-[#846FFA]/30 bg-white/70 text-sm text-[#1A1A1A] shadow-sm transition hover:bg-white/80 dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]/90 dark:hover:bg-[#1E1E27]/75">
                  <SelectValue placeholder="Select destination token" />
                </SelectTrigger>
                <SelectContent>
                  {availableTokens.map((token) => (
                    <SelectItem key={token.address} value={token.address}>
                      {tokenLabel(token)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={cn(glassSectionClass, "space-y-4")} data-testid="onboarding-token-controls">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Allowlisted tokens</h3>
            <p className="mt-1 text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
              Include native {MONAD_NATIVE_TOKEN_SYMBOL} and {MONAD_WRAPPED_TOKEN_SYMBOL} for wrap / unwrap coverage.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => toggleAllNormalTokens(!allNormalSelected)}
            className="rounded-full border border-[#846FFA]/30 bg-white/70 px-3 py-1 text-xs font-semibold text-[#3F356F] shadow-sm transition hover:bg-[#846FFA]/15 dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]/85 dark:hover:bg-[#846FFA]/25"
          >
            {allNormalSelected ? "Deselect all" : "Select all"}
          </Button>
        </div>
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {availableTokens.map((token) => {
            const selected = Boolean(normalSelections[token.address]);
            return (
              <label
                key={token.address}
                className={cn(chipBaseClass, selected ? chipActiveClass : chipInactiveClass)}
                data-selected={selected}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#846FFA]/15 text-sm font-semibold text-[#3F356F] dark:bg-[#846FFA]/25 dark:text-[#DAD7FF]">
                    {token.symbol ? token.symbol.slice(0, 3).toUpperCase() : token.address.slice(2, 5).toUpperCase()}
                  </span>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[#1A1A1A] dark:text-[#F8F8FF]">
                      {token.symbol ?? token.address.slice(0, 6)}
                    </p>
                    <p className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">{token.address}</p>
                  </div>
                </div>
                <Checkbox
                  checked={selected}
                  onCheckedChange={(checked) => toggleNormalToken(token.address, Boolean(checked))}
                  className="h-5 w-5 rounded-lg border-[#846FFA]/35 text-[#846FFA] data-[state=checked]:bg-[#846FFA] data-[state=checked]:text-white dark:border-[#846FFA]/45"
                />
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        {showIdentityCard ? (
          <div className={cn(glassSectionClass, "space-y-4")}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Web3Auth identity</h3>
                <p className="mt-2 text-lg font-semibold text-[#1A1A1A] dark:text-[#F8F8FF]">
                  {formatAddress(identity.wallet?.address)}
                </p>
                <p className="mt-1 text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">{identityMessage}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  onRequestClose?.();
                  void identity.connect().catch((error) => {
                    console.error("Web3Auth connection failed", error);
                  });
                }}
                disabled={connectButtonDisabled}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border border-[#846FFA]/35 bg-white/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#3F356F] shadow-sm transition hover:bg-[#846FFA]/15 dark:border-[#846FFA]/40 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]/85 dark:hover:bg-[#846FFA]/25",
                  connectButtonDisabled && "opacity-60",
                )}
              >
                {identity.status === "connecting" ? (
                  <span className="flex items-center gap-2"><Spinner className="h-3.5 w-3.5" /> Connecting</span>
                ) : identity.status === "initializing" ? (
                  <span className="flex items-center gap-2"><Spinner className="h-3.5 w-3.5" /> Preparing…</span>
                ) : identity.status === "error" ? (
                  <span className="flex items-center gap-2">Retry connect</span>
                ) : identity.wallet ? "Reconnect" : "Connect"}
              </Button>
              {showDisconnectButton ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => identity.disconnect()}
                  className="rounded-full border border-white/40 bg-white/65 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#5C5C5C] shadow-sm transition hover:bg-white/80 dark:border-white/10 dark:bg-[#1E1E27]/60 dark:text-[#C7C3E8]/85 dark:hover:bg-[#1E1E27]/75"
                >
                  Disconnect
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {identity.error ? (
          <div className="rounded-[1.25rem] border border-destructive/55 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {identity.error}
          </div>
        ) : null}

        <div className={cn(glassSectionClass, "space-y-4")}> 
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Delegation mode</h3>
              <p className="mt-1 text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                Tune guardrails for rapid swaps or full console access.
              </p>
            </div>
          </div>
          <div className={segmentedContainerClass} role="tablist">
            <button
              type="button"
              data-testid="mode-option-safe"
              className={cn(segmentedOptionBaseClass, mode === "safe" ? segmentedOptionActiveClass : segmentedOptionInactiveClass)}
              onClick={() => setMode("safe")}
              aria-pressed={mode === "safe"}
            >
              Safe
            </button>
            <button
              type="button"
              data-testid="mode-option-normal"
              className={cn(segmentedOptionBaseClass, mode === "normal" ? segmentedOptionActiveClass : segmentedOptionInactiveClass)}
              onClick={() => setMode("normal")}
              aria-pressed={mode === "normal"}
            >
              Normal
            </button>
          </div>
          <p className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">
            {mode === "safe"
              ? "Pair-scoped delegation with 1-hour expiry and maximum six calls by default."
              : "Curated allowlist with 24-hour expiry and expansive swap flexibility."}
          </p>
        </div>

        {renderTokenControls()}

        <div className={cn(glassSectionClass, "space-y-4")}> 
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7A6FAF] dark:text-[#C7C3E8]">Call allowance</h4>
              <div className="flex items-center gap-3">
                <Input
                  id="callLimit"
                  type="number"
                  min={1}
                  step={1}
                  value={callLimit}
                  disabled={unlimitedCalls}
                  onChange={(event) => setCallLimit(event.target.value)}
                  className="h-11 rounded-full border border-[#846FFA]/30 bg-white/70 text-sm text-[#1A1A1A] shadow-sm transition focus-visible:ring-[#846FFA] dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]/90"
                />
                <div className="flex items-center gap-2">
                  <Switch checked={unlimitedCalls} onCheckedChange={(checked) => setUnlimitedCalls(Boolean(checked))} />
                  <span className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">Unlimited</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7A6FAF] dark:text-[#C7C3E8]">Native transfer allowance</h4>
              <div className="flex items-center gap-3">
                <Switch checked={enableTransfer} onCheckedChange={(checked) => setEnableTransfer(Boolean(checked))} />
                <Input
                  id="transferAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={transferAmount}
                  disabled={!enableTransfer}
                  onChange={(event) => setTransferAmount(event.target.value)}
                  className="h-11 w-28 rounded-full border border-[#846FFA]/30 bg-white/70 text-sm text-[#1A1A1A] shadow-sm transition focus-visible:ring-[#846FFA] dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]/90"
                />
                <span className="text-sm font-medium text-[#5C5C5C] dark:text-[#C7C3E8]/80">{MONAD_NATIVE_TOKEN_SYMBOL}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-[1.1rem] border border-white/35 bg-white/55 px-4 py-3 dark:border-white/10 dark:bg-[#1E1E27]/60">
            <Switch checked={rotateSessionKey} onCheckedChange={(checked) => setRotateSessionKey(Boolean(checked))} />
            <div>
              <p className="text-sm font-semibold text-[#1A1A1A] dark:text-[#F8F8FF]">Rotate session key</p>
              <p className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">Force a fresh session key even if one already exists for this delegator.</p>
            </div>
          </div>
        </div>

        {statusMessage ? (
          <div className={cn("flex items-center gap-2 rounded-[1.25rem] border px-4 py-3 text-sm", statusToneClass)}>
            {state === "loading" || state === "signing" ? <Spinner className="h-3.5 w-3.5" /> : null}
            <span>{statusMessage}</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-5">
        {showSummaryCards ? (
          <div className="grid gap-4">
            <StatCard
              icon={<Sparkles className="h-3.5 w-3.5" />}
              label="Delegator"
              value={sessionDelegatorLabel}
              testId="onboarding-delegator"
              description={sessionDelegatorFull ? "Fund this HybridDelegator to settle swaps." : "Connect your wallet to derive the delegator."}
              actions={
                <>
                  <span className="truncate">{ownerAddress ? `Owner ${shortHex(ownerAddress)}` : "No owner connected"}</span>
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
              testId="onboarding-session-key"
              description={
                <div className="space-y-1">
                  <span>Expiry {sessionExpiry}</span>
                  <span>{sessionModeLabel !== "—" ? `Mode ${sessionModeLabel}` : "Awaiting issuance"}</span>
                </div>
              }
              actions={
                <>
                  <span className="truncate">Top up ~0.5 {MONAD_NATIVE_TOKEN_SYMBOL} for gas</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-full border border-[#846FFA]/30 bg-white/70 text-[#846FFA] shadow-sm hover:bg-[#846FFA]/15 dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#DAD7FF] dark:hover:bg-[#846FFA]/25"
                    onClick={() => handleCopy(sessionKeyFull)}
                    disabled={!sessionKeyFull}
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
              description="Deployments and session refreshes appear here once onboarding completes."
            />
          </div>
        ) : null}

        <div className={cn(glassSectionClass, "space-y-3")}>
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Session summary</h3>
          <div className="space-y-2 text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[#1A1A1A] dark:text-[#F8F8FF]">Mode</span>
              <span>{mode === "safe" ? "Safe · 1h expiry" : "Normal · 24h expiry"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-[#1A1A1A] dark:text-[#F8F8FF]">Call limit</span>
              <span>{unlimitedCalls ? "Unlimited" : `${callLimit} calls`}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-[#1A1A1A] dark:text-[#F8F8FF]">Native transfers</span>
              <span>{enableTransfer ? `${transferAmount} ${MONAD_NATIVE_TOKEN_SYMBOL}` : "Disabled"}</span>
            </div>
            <div>
              <span className="font-medium text-[#1A1A1A] dark:text-[#F8F8FF]">Tokens in scope</span>
              <p className="mt-1 text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">
                {tokenSummaryList.length > 0 ? tokenSummaryList.join(", ") : "Select at least two assets to enable quick actions."}
              </p>
            </div>
          </div>
        </div>

        <div className={cn(glassSectionClass, "space-y-3")}>
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Session progress</h3>
          <ol className="space-y-3">
            {onboardingSteps.map((step, index) => (
              <li key={step.label} className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold",
                    step.completed
                      ? "border-[#846FFA] bg-[#846FFA]/20 text-[#2F285F] dark:border-[#846FFA] dark:bg-[#846FFA]/25 dark:text-[#F8F8FF]"
                      : "border-[#846FFA]/25 bg-white/70 text-[#5C5C5C] dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#C7C3E8]/80",
                  )}
                >
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#1A1A1A] dark:text-[#F8F8FF]">{step.label}</p>
                  <p className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className={cn(glassSectionClass, "space-y-3")}>
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Funding instructions</h3>
          <ol className="space-y-2 pl-5 text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
            <li>
              Copy the delegator address and fund it with the MON you want to settle swaps with. After funding, reconnect or ask <code className="inline rounded bg-[#ECEBF2] px-1 py-0.5 text-xs text-[#1A1A1A] dark:bg-[#1E1E27] dark:text-[#F8F8FF]">delegation status</code> in chat to confirm balances.
            </li>
            <li>
              Send roughly <span className="font-medium text-[#1A1A1A] dark:text-[#F8F8FF]">0.5&nbsp;{MONAD_NATIVE_TOKEN_SYMBOL}</span> to the session key as a gas tank for UserOperations. Disconnect and reconnect if balances appear stale.
            </li>
          </ol>
        </div>

        {artifactsSummary.length > 0 ? (
          <div className={cn(glassSectionClass, "space-y-3")}>
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A6FAF] dark:text-[#C7C3E8]">Delegations stored</h3>
            <div className="space-y-2 text-sm text-[#5C5C5C] dark:text-[#C7C3E8]/80">
              {artifactsSummary.map((line, index) => (
                <div key={index} className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#846FFA]/15 text-[10px] font-semibold text-[#3F356F] dark:bg-[#846FFA]/25 dark:text-[#F8F8FF]">
                    {index + 1}
                  </span>
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="lg:col-span-2 flex flex-col gap-3 rounded-[1.25rem] border border-[#846FFA]/25 bg-white/55 px-6 py-4 text-xs text-[#5C5C5C] shadow-sm dark:border-[#846FFA]/30 dark:bg-[#1E1E27]/60 dark:text-[#C7C3E8]/80">
        <p>Stored delegations live locally in your browser. Export them from the receipts tab after a successful execution.</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] uppercase tracking-[0.24em] text-[#7A6FAF] dark:text-[#C7C3E8]">
            {state === "completed" ? "Session ready" : tokensConfigured ? "Guardrails configured" : "Awaiting guardrails"}
          </span>
          <Button
            type="submit"
            disabled={state === "loading" || state === "signing"}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-[#846FFA]/40 bg-gradient-to-r from-[#846FFA]/25 to-[#674CF9]/35 px-6 py-2 text-sm font-semibold text-[#2F285F] shadow-[0_14px_32px_rgba(132,111,250,0.22)] transition hover:opacity-90 dark:border-[#846FFA]/45 dark:text-[#F8F8FF]",
              (state === "loading" || state === "signing") && "opacity-60",
            )}
          >
            {state === "loading" || state === "signing" ? (
              <>
                <Spinner className="h-4 w-4" /> Issuing delegation…
              </>
            ) : state === "completed" ? (
              "Reissue delegation"
            ) : (
              "Issue delegation"
            )}
          </Button>
        </div>
      </div>
    </form>
  );
};
