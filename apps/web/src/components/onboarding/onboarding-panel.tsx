"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { getAddress, parseEther, type Address } from "viem";
import type { AllowedToken, Mode } from "@pragma/core";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { useCardTilt } from "../../hooks/useCardTilt";

import { useIdentity } from "../../hooks/useIdentity";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Checkbox } from "../ui/checkbox";
import { Spinner } from "../ui/spinner";
import { GlassSlideTabs } from "../ui/glass-slide-tabs";
import { initializeHybridDelegator, buildDelegationPlan, finalizeDelegations } from "../../lib/onboarding/service";
import { fetchAllowlistCached, getCachedTokens } from "../../lib/onboarding/token-cache";
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
  "rounded-[1.25rem] border border-[#846FFA]/28 bg-[linear-gradient(160deg,rgba(255,255,255,0.75)_0%,rgba(246,242,255,0.52)_48%,rgba(236,229,255,0.28)_100%)] p-5 shadow-sm backdrop-blur-xl dark:border-[#846FFA]/35 dark:bg-[linear-gradient(150deg,rgba(30,30,39,0.85)_0%,rgba(30,30,39,0.58)_52%,rgba(30,30,39,0.72)_100%)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.35)]";
const chipBaseClass =
  "flex w-full items-center justify-between gap-3 rounded-[1.15rem] border px-3 py-2 transition-colors";
const chipActiveClass =
  "border-[#846FFA]/50 bg-gradient-to-r from-[#846FFA]/18 to-[#674CF9]/24 shadow-sm dark:border-[#846FFA]/45 dark:from-[#846FFA]/20 dark:to-[#674CF9]/26";
const chipInactiveClass =
  "border-white/40 bg-white/52 backdrop-blur-lg hover:border-[#846FFA]/30 dark:border-white/10 dark:bg-[#1E1E27]/58 dark:hover:border-[#846FFA]/28";
const segmentedContainerClass =
  "inline-flex rounded-full border border-[#846FFA]/30 bg-white/60 backdrop-blur-lg p-1 text-sm shadow-sm dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70";
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
  const prefersReducedMotion = usePrefersReducedMotion();
  const identityCardRef = useCardTilt<HTMLDivElement>();
  const [availableTokens, setAvailableTokens] = React.useState<AllowedToken[]>([]);
  const [mode, setMode] = React.useState<Mode>("safe");
  const [safeTokenA, setSafeTokenA] = React.useState<string>("");
  const [safeTokenB, setSafeTokenB] = React.useState<string>("");
  const [normalSelections, setNormalSelections] = React.useState<Record<string, boolean>>({});
  const [customTokenAddress, setCustomTokenAddress] = React.useState<string>("");
  const [customTokenError, setCustomTokenError] = React.useState<string | null>(null);
  const [callLimit, setCallLimit] = React.useState<string>("6");
  const [unlimitedCalls, setUnlimitedCalls] = React.useState(false);
  const [enableTransfer, setEnableTransfer] = React.useState(true);
  const [transferAmount, setTransferAmount] = React.useState(DEFAULT_TRANSFER_MON);
  const [rotateSessionKey, setRotateSessionKey] = React.useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = React.useState(false);
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
  const fetchingTokens = React.useRef(false);

  React.useEffect(() => {
    // Optimistically show cached tokens immediately if available
    const cached = getCachedTokens();
    if (cached && cached.length > 0) {
      setAvailableTokens(cached);
      const defaults = cached.slice(0, 2);
      if (defaults[0]) setSafeTokenA(defaults[0].address);
      if (defaults[1]) setSafeTokenB(defaults[1].address);
      if (!normalSelectionsInitialized.current) {
        setNormalSelections(Object.fromEntries(cached.map((token) => [token.address, true])));
        normalSelectionsInitialized.current = true;
      }
    }

    if (fetchingTokens.current) return; // Prevent concurrent fetches

    const loadTokens = async () => {
      fetchingTokens.current = true;
      try {
        const tokens = await fetchAllowlistCached();
        setAvailableTokens(tokens);
        const defaults = tokens.slice(0, 2);
        if (defaults[0]) setSafeTokenA(defaults[0].address);
        if (defaults[1]) setSafeTokenB(defaults[1].address);
        if (!normalSelectionsInitialized.current) {
          // Default to all tokens selected for Normal mode
          setNormalSelections(Object.fromEntries(tokens.map((token) => [token.address, true])));
          normalSelectionsInitialized.current = true;
        }
      } catch (error) {
        console.error("Failed to fetch token allowlist", error);
      } finally {
        fetchingTokens.current = false;
      }
    };
    void loadTokens();
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

    // Include tokens from allowlist
    const tokensFromAllowlist = availableTokens.filter((token) => normalSelections[token.address]);

    // Include custom tokens (addresses in normalSelections but not in availableTokens)
    const customTokenAddresses = Object.keys(normalSelections).filter(
      (address) => normalSelections[address] && !availableTokens.some((token) => token.address.toLowerCase() === address.toLowerCase())
    );

    const customTokens: AllowedToken[] = customTokenAddresses.map((address) => ({
      address: address as `0x${string}`,
      symbol: undefined,
      name: "Custom Token",
      decimals: 18,
      kind: "erc20" as const,
      categories: ["custom"],
    }));

    return [...tokensFromAllowlist, ...customTokens];
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

  const handleAddCustomToken = React.useCallback(() => {
    setCustomTokenError(null);

    if (!customTokenAddress.trim()) {
      setCustomTokenError("Please enter a token address");
      return;
    }

    try {
      const checksummedAddress = getAddress(customTokenAddress.trim());

      // Check if already in allowlist
      if (availableTokens.some((token) => token.address.toLowerCase() === checksummedAddress.toLowerCase())) {
        setCustomTokenError("Token already in allowlist");
        return;
      }

      // Check if already added as custom token
      if (normalSelections[checksummedAddress]) {
        setCustomTokenError("Custom token already added");
        return;
      }

      // Add the custom token to selections
      toggleNormalToken(checksummedAddress, true);
      setCustomTokenAddress("");
      setCustomTokenError(null);
    } catch {
      setCustomTokenError("Invalid token address");
    }
  }, [customTokenAddress, availableTokens, normalSelections, toggleNormalToken]);

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
                <SelectTrigger className="h-11 rounded-full border border-[#846FFA]/30 bg-white/70 backdrop-blur-lg text-sm text-[#1A1A1A] shadow-sm transition hover:bg-white/80 dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]/90 dark:hover:bg-[#1E1E27]/75">
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
                <SelectTrigger className="h-11 rounded-full border border-[#846FFA]/30 bg-white/70 backdrop-blur-lg text-sm text-[#1A1A1A] shadow-sm transition hover:bg-white/80 dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]/90 dark:hover:bg-[#1E1E27]/75">
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
      <div className={cn(glassSectionClass, "space-y-4 overflow-hidden")} data-testid="onboarding-token-controls">
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
            className="rounded-full border border-[#846FFA]/30 bg-white/70 backdrop-blur-lg px-3 py-1 text-xs font-semibold text-[#3F356F] shadow-sm transition hover:bg-[#846FFA]/15 dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]/85 dark:hover:bg-[#846FFA]/25"
          >
            {allNormalSelected ? "Deselect all" : "Select all"}
          </Button>
        </div>
        <div className="max-h-64 min-h-0 flex-shrink-0 space-y-2 overflow-x-hidden overflow-y-auto pr-1 scroll-smooth">
          <div className="space-y-2">
            {/* Allowlist Tokens */}
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

          {/* Custom Tokens */}
          {Object.keys(normalSelections)
            .filter((address) =>
              normalSelections[address] &&
              !availableTokens.some((token) => token.address.toLowerCase() === address.toLowerCase())
            )
            .map((address) => (
              <div
                key={address}
                className={cn(chipBaseClass, chipActiveClass)}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15 text-sm font-semibold text-amber-700 dark:bg-amber-500/25 dark:text-amber-300">
                    {address.slice(2, 5).toUpperCase()}
                  </span>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[#1A1A1A] dark:text-[#F8F8FF]">
                      Custom Token
                    </p>
                    <p className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">{address}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleNormalToken(address, false)}
                  className="h-8 rounded-full px-3 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Token Input */}
        <div className="space-y-2 border-t border-[#846FFA]/15 pt-4 dark:border-[#846FFA]/20">
          <Label htmlFor="customToken" className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7A6FAF] dark:text-[#C7C3E8]">
            Add Custom Token (Optional)
          </Label>
          <p className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">
            Enter an ERC-20 token address not in the allowlist
          </p>
          <div className="flex gap-2">
            <Input
              id="customToken"
              type="text"
              value={customTokenAddress}
              onChange={(e) => {
                setCustomTokenAddress(e.target.value);
                setCustomTokenError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustomToken();
                }
              }}
              placeholder="0x..."
              className="h-10 flex-1 rounded-full border border-[#846FFA]/30 bg-white/70 backdrop-blur-lg text-sm text-[#1A1A1A] placeholder:text-[#5C5C5C]/50 dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF] dark:placeholder:text-[#C7C3E8]/40"
            />
            <Button
              type="button"
              onClick={handleAddCustomToken}
              size="sm"
              className="rounded-full border border-[#846FFA]/40 bg-[#846FFA]/15 px-4 text-xs font-semibold text-[#3F356F] hover:bg-[#846FFA]/25 dark:text-[#F8F8FF] dark:hover:bg-[#846FFA]/30"
            >
              Add
            </Button>
          </div>
          {customTokenError ? (
            <p className="text-xs text-red-600 dark:text-red-400">{customTokenError}</p>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-5">
        {showIdentityCard ? (
          <div ref={identityCardRef} className={cn(glassSectionClass, "space-y-4")}>
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
                  "inline-flex items-center gap-2 rounded-full border border-[#846FFA]/35 bg-white/75 backdrop-blur-lg px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#3F356F] shadow-sm transition hover:bg-[#846FFA]/15 dark:border-[#846FFA]/40 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]/85 dark:hover:bg-[#846FFA]/25",
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
                  className="rounded-full border border-white/40 bg-white/65 backdrop-blur-lg px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#5C5C5C] shadow-sm transition hover:bg-white/80 dark:border-white/10 dark:bg-[#1E1E27]/60 dark:text-[#C7C3E8]/85 dark:hover:bg-[#1E1E27]/75"
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

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-[#1A1A1A] dark:text-[#F8F8FF]">Delegation Mode</h3>
            <p className="mt-1 text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">
              {mode === "safe"
                ? "Single pair · 1hr expiry · Limited calls"
                : "Multiple tokens · 24hr expiry · Flexible"}
            </p>
          </div>
          <GlassSlideTabs
            tabs={["Safe", "Normal"]}
            activeIndex={mode === "safe" ? 0 : 1}
            onChange={(idx) => setMode(idx === 0 ? "safe" : "normal")}
          />
        </div>

        {renderTokenControls()}

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
            className="flex items-center gap-2 rounded-lg border border-[#846FFA]/25 bg-white/60 backdrop-blur-lg px-3 py-2 text-sm font-semibold text-[#7A6FAF] transition hover:border-[#846FFA]/40 hover:bg-[#846FFA]/10 dark:border-[#846FFA]/30 dark:bg-[#1E1E27]/60 dark:text-[#C7C3E8] dark:hover:border-[#846FFA]/50 dark:hover:bg-[#846FFA]/15"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvancedOptions && "rotate-180")} />
            Advanced Options
          </button>

          {showAdvancedOptions ? (
            <div className={cn(glassSectionClass, "space-y-4")}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-[#7A6FAF] dark:text-[#C7C3E8]">Call Limit</h4>
                  <div className="flex items-center gap-3">
                    <Input
                      id="callLimit"
                      type="number"
                      min={1}
                      step={1}
                      value={callLimit}
                      disabled={unlimitedCalls}
                      onChange={(event) => setCallLimit(event.target.value)}
                      className="h-10 rounded-full border border-[#846FFA]/30 bg-white/70 backdrop-blur-lg text-sm dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70"
                    />
                    <div className="flex items-center gap-2">
                      <Switch checked={unlimitedCalls} onCheckedChange={(checked) => setUnlimitedCalls(Boolean(checked))} />
                      <span className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">Unlimited</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-[#7A6FAF] dark:text-[#C7C3E8]">Native Transfer</h4>
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
                      className="h-10 w-24 rounded-full border border-[#846FFA]/30 bg-white/70 backdrop-blur-lg text-sm dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70"
                    />
                    <span className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">{MONAD_NATIVE_TOKEN_SYMBOL}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={rotateSessionKey} onCheckedChange={(checked) => setRotateSessionKey(Boolean(checked))} />
                <div>
                  <p className="text-sm font-medium text-[#1A1A1A] dark:text-[#F8F8FF]">Rotate session key</p>
                  <p className="text-xs text-[#5C5C5C] dark:text-[#C7C3E8]/80">Force a fresh key even if one exists</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

      </div>

      {statusMessage ? (
        <div className={cn("flex items-center gap-2 rounded-xl border px-4 py-3 text-sm", statusToneClass)}>
          {state === "loading" || state === "signing" ? <Spinner className="h-4 w-4" /> : null}
          <span>{statusMessage}</span>
        </div>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={!tokensConfigured || state === "loading" || state === "signing"}
        className="w-full rounded-full border border-[#846FFA]/40 bg-gradient-to-r from-[#846FFA]/30 to-[#674CF9]/35 px-6 py-3 text-sm font-semibold text-[#2F285F] shadow-lg transition hover:shadow-xl dark:border-[#846FFA]/45 dark:text-[#F8F8FF]"
      >
        {state === "loading" ? (
          <><Spinner className="h-4 w-4" /> Provisioning...</>
        ) : state === "signing" ? (
          <><Spinner className="h-4 w-4" /> Awaiting Signatures...</>
        ) : state === "completed" ? (
          "Reissue Delegation"
        ) : (
          "Issue Delegation"
        )}
      </Button>
    </form>
  );
};
