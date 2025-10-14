"use client";

import * as React from "react";
import { getAddress, parseEther, type Address } from "viem";
import type { AllowedToken, Mode } from "@pragma/core";

import { useIdentity } from "../../hooks/useIdentity";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Checkbox } from "../ui/checkbox";
import { Separator } from "../ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "../ui/card";
import { Spinner } from "../ui/spinner";
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
}

const SAFE_TTL_SECONDS = 60 * 60;
const NORMAL_TTL_SECONDS = 24 * 60 * 60;

type OnboardingState = "idle" | "loading" | "signing" | "completed" | "error";

const DEFAULT_TRANSFER_MON = "1";

const tokenLabel = (token: AllowedToken) => {
  const symbol = token.symbol ?? token.address.slice(0, 6);
  return `${symbol} · ${token.address.slice(0, 6)}…${token.address.slice(-4)}`;
};

const shortHex = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const formatAddress = (address?: string) => (address ? shortHex(address) : "Web3Auth session not connected");
const formatExpiry = (expiresAt?: number) => {
  if (!expiresAt) return "—";
  return new Date(expiresAt * 1000).toLocaleString();
};

export const OnboardingPanel = ({ onStatusUpdate, onRequestClose }: OnboardingPanelProps) => {
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
  const connectButtonVariant = identity.status === "connected" && identity.wallet ? "secondary" : "default";
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
  }, [activeDelegator, delegationStatus, identity.status, identity.wallet]);

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

      const statusParts = [] as string[];
      if (init.deployment) {
        statusParts.push(`HybridDelegator deployed (tx ${shortHex(init.deployment.transactionHash)})`);
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

  const someNormalSelected = React.useMemo(
    () => availableTokens.some((token) => Boolean(normalSelections[token.address])),
    [availableTokens, normalSelections],
  );

  const toggleAllNormalTokens = (checked: boolean) => {
    if (checked) {
      setNormalSelections(Object.fromEntries(availableTokens.map((token) => [token.address, true])));
    } else {
      setNormalSelections({});
    }
  };

  const renderTokenControls = () => {
    if (mode === "safe") {
      return (
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="tokenA">Token in</Label>
            <Select value={safeTokenA} onValueChange={setSafeTokenA}>
              <SelectTrigger>
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
          <div className="grid gap-2">
            <Label htmlFor="tokenB">Token out</Label>
            <Select value={safeTokenB} onValueChange={setSafeTokenB}>
              <SelectTrigger>
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
      );
    }

    return (
      <div className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          Select allowlisted assets. You can include native {MONAD_NATIVE_TOKEN_SYMBOL} and {MONAD_WRAPPED_TOKEN_SYMBOL} for wrap/unwrap support.
        </p>
        <div className="flex items-center justify-end gap-2 text-sm">
          <Checkbox
            checked={allNormalSelected ? true : someNormalSelected ? "indeterminate" : false}
            onCheckedChange={(checked) => toggleAllNormalTokens(checked === true)}
            id="normal-select-all"
          />
          <Label htmlFor="normal-select-all" className="cursor-pointer select-none">
            {allNormalSelected ? "Deselect all" : "Select all"}
          </Label>
        </div>
        <div className="grid gap-2 max-h-64 overflow-y-auto rounded-lg border border-border/60 p-3">
          {availableTokens.map((token) => (
            <label key={token.address} className="flex items-center justify-between gap-3 rounded-lg border border-transparent px-2 py-1.5 hover:border-border/70">
              <div>
                <p className="text-sm font-medium text-foreground">{token.symbol ?? token.address.slice(0, 6)}</p>
                <p className="text-xs text-muted-foreground">{token.address}</p>
              </div>
              <Checkbox
                checked={Boolean(normalSelections[token.address])}
                onCheckedChange={(checked) => toggleNormalToken(token.address, Boolean(checked))}
              />
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>HybridDelegator Onboarding</CardTitle>
        <CardDescription>
          Connect with Web3Auth, configure delegation guardrails, and sign the session so Pragma can execute swaps on your behalf.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <Label>Identity provider</Label>
            <div className="flex flex-col gap-3 rounded-lg border border-border/70 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {formatAddress(identity.wallet?.address)}
                </p>
                <p className="text-xs text-muted-foreground">{identityMessage}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={connectButtonVariant}
                  onClick={() => {
                    onRequestClose?.();
                    void identity.connect().catch((error) => {
                      console.error("Web3Auth connection failed", error);
                    });
                  }}
                  disabled={connectButtonDisabled}
                >
                  {identity.status === "connecting" ? (
                    <span className="flex items-center gap-2"><Spinner /> Connecting</span>
                  ) : identity.status === "initializing" ? (
                    <span className="flex items-center gap-2"><Spinner /> Preparing…</span>
                  ) : identity.status === "error" ? (
                    <span className="flex items-center gap-2">Retry connect</span>
                  ) : identity.wallet ? "Reconnect" : "Connect"}
                </Button>
                {showDisconnectButton ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => identity.disconnect()}
                  >
                    Disconnect
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {identity.error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {identity.error}
            </div>
          )}

          <Separator />

          <div className="grid gap-4">
            <Label>Mode</Label>
            <div className="grid gap-2 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("safe")}
                className={cnModeCard(mode === "safe")}
              >
                <span className="text-sm font-semibold">Safe</span>
                <span className="text-xs text-muted-foreground">Pair-scoped delegation with 1-hour expiry and tight limits.</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("normal")}
                className={cnModeCard(mode === "normal")}
              >
                <span className="text-sm font-semibold">Normal</span>
                <span className="text-xs text-muted-foreground">Curated allowlist, 24-hour expiry, broader swap flexibility.</span>
              </button>
            </div>
          </div>

          {renderTokenControls()}

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="callLimit">Call allowance</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="callLimit"
                  type="number"
                  min={1}
                  step={1}
                  value={callLimit}
                  disabled={unlimitedCalls}
                  onChange={(event) => setCallLimit(event.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Switch checked={unlimitedCalls} onCheckedChange={(checked) => setUnlimitedCalls(Boolean(checked))} />
                  <span className="text-xs text-muted-foreground">Unlimited</span>
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="transferAmount">Native transfer allowance</Label>
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
                />
                <span className="text-sm text-muted-foreground">{MONAD_NATIVE_TOKEN_SYMBOL}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={rotateSessionKey} onCheckedChange={(checked) => setRotateSessionKey(Boolean(checked))} />
            <div>
              <p className="text-sm font-medium text-foreground">Rotate session key</p>
              <p className="text-xs text-muted-foreground">Forces a fresh session key even if an existing delegation is active.</p>
            </div>
          </div>

          {statusMessage && (
            <div className="rounded-lg border border-border/70 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              {state === "loading" || state === "signing" ? (
                <span className="flex items-center gap-2"><Spinner /> {statusMessage}</span>
              ) : (
                statusMessage
              )}
            </div>
          )}

          {artifactsSummary.length > 0 && (
            <div className="rounded-lg border border-border/60 bg-secondary/30 px-4 py-3">
              <h4 className="text-sm font-semibold">Delegations stored</h4>
              <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                {artifactsSummary.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Stored delegations live locally in your browser. Export them from the receipts sidebar once execution succeeds.
          </p>
          <Button type="submit" disabled={state === "loading" || state === "signing"}>
            {state === "loading" || state === "signing" ? (
              <span className="flex items-center gap-2"><Spinner /> Issuing delegation…</span>
            ) : state === "completed" ? "Reissue delegation" : "Issue delegation"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

const cnModeCard = (active: boolean) =>
  active
    ? "flex flex-col gap-2 rounded-xl border-2 border-primary bg-primary/5 px-4 py-3 text-left"
    : "flex flex-col gap-2 rounded-xl border border-border/70 px-4 py-3 text-left hover:border-border/90";
