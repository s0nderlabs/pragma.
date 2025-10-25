"use client";

import * as React from "react";
import { nanoid } from "nanoid/non-secure";
import { formatUnits, getAddress, isAddress, parseUnits, type Address, type Hex } from "viem";
import type { AllowedToken } from "@pragma/core/monorail/tokens";
import type {
  ExecutionLogger,
  SwapExecutionConfig,
  SwapPreviewResult,
  SwapResult,
} from "@pragma/core/execution/swap";
import type {
  CanonicalIntent,
  ClarificationRequest,
  PolicyViolation,
  SwapIntentFields,
  TransferIntentFields,
  WrapIntentFields,
  AmountSpecification,
} from "@pragma/core/intent/types";
import { resolveAmountInput } from "@pragma/core/agent/amount";
import { computeSwapPlanHash } from "@pragma/core/execution/plan";

import { fetchAllowlistCached } from "../lib/onboarding/token-cache";
import { loadChatSession, type ChatSessionContext } from "../lib/chat/session";
import { previewSwap, executeSwap } from "../lib/chat/swap";
import { executeNativeTransfer, executeTokenTransfer } from "../lib/chat/transfer";
import { executeWrap, executeUnwrap } from "../lib/chat/wrap";
import { parseUserFriendlyError } from "../lib/errors";
import {
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_WRAPPED_TOKEN_SYMBOL,
  MONAD_WMON_ADDRESS,
  MONAD_NATIVE_TOKEN_ADDRESS,
} from "../lib/config";
import { monadChain, createMonadPublicClient } from "../lib/clients";
import { callAgent, type AgentControlEvent } from "../lib/chat/agent";
import { getActiveDelegator, IDENTITY_EVENT } from "../lib/storage/active-delegator";
import { getQuickModePreference, setQuickModePreference } from "../lib/storage/quick-mode";
import { listDelegations } from "../lib/storage/delegations";
import { storeReceipt, type SwapReceiptRecord } from "../lib/storage/receipts";

type LogLevel = "info" | "success" | "warn";

export interface ChatMessageLog {
  level: LogLevel;
  message: string;
}

export interface TokenDisplaySummary {
  address: string;
  symbol: string;
  logoURI?: string;
}

export type SwapQuotePresentation = {
  type: "swap_quote";
  createdAt: number;
  quoteId: string;
  from: TokenDisplaySummary;
  to: TokenDisplaySummary;
  amountIn: string;
  expectedOut: string;
  minAmountOut: string;
  slippage: string;
};

export type SwapReceiptPresentation = {
  type: "swap_receipt";
  executedAt: number;
  from: TokenDisplaySummary;
  to: TokenDisplaySummary;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  slippageBps: number;
  slippageLabel: string;
  planHash?: string;
  quoteId?: string;
  txHash?: string;
  explorerUrl?: string;
};

export type InsightPresentation = {
  type: "insight";
  heading: string;
  body?: string;
};

export type ChatMessagePresentation =
  | SwapQuotePresentation
  | SwapReceiptPresentation
  | InsightPresentation;

export interface ChatMessage {
  id: string;
  role: "user" | "system";
  content: string;
  status?: "default" | "loading" | "success" | "error";
  logs?: ChatMessageLog[];
  presentation?: ChatMessagePresentation;
}

const shortHex = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

const toNumber = (value: unknown, fallback = 18): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
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

const formatTokenAmount = (amount: bigint, token: AllowedToken, decimalsOverride?: number) => {
  const decimals = decimalsOverride ?? toNumber(token.decimals);
  return formatUnits(amount, decimals);
};

const formatSlippageLabel = (bps: number): string => {
  const percent = bps / 100;
  if (!Number.isFinite(percent)) return "0.50%";
  if (percent >= 1) {
    return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1)}%`;
  }
  return `${percent.toFixed(2)}%`;
};

const formatWarnings = (warnings?: string[]) =>
  warnings && warnings.length > 0 ? `\n\nWarnings:\n- ${warnings.join("\n- ")}` : "";

const summarizeAmount = (amount?: AmountSpecification) => {
  if (!amount) return "?";
  if (amount.kind === "exact") return amount.value ?? "?";
  if (amount.kind === "max") return "max";
  if (amount.kind === "fraction") return `${amount.numerator}/${amount.denominator}`;
  return "?";
};

type PendingAction =
  | {
      kind: "swap";
      statusId: string;
      config: SwapExecutionConfig;
      preview: SwapPreviewResult;
      summary: string;
    }
  | {
      kind: "transfer_native";
      statusId: string;
      context: ChatSessionContext;
      recipient: string;
      amountInput: string;
      resolvedDisplay: string;
    }
  | {
      kind: "transfer_token";
      statusId: string;
      context: ChatSessionContext;
      token: AllowedToken & { decimals: number };
      recipient: string;
      amountInput: string;
      resolvedDisplay: string;
    }
  | {
      kind: "wrap";
      statusId: string;
      context: ChatSessionContext;
      direction: "wrap" | "unwrap";
      amountInput: string;
      resolvedDisplay: string;
    };

const describeIntent = async (
  intent: CanonicalIntent,
  context: ChatSessionContext,
  fetchTokenBalance: (token: AllowedToken, owner: Address) => Promise<bigint>,
  fetchNativeBalance: (owner: Address) => Promise<bigint>,
): Promise<string> => {
  const resolveAndFormatAmount = async (
    amount: AmountSpecification,
    token: AllowedToken & { decimals: number },
  ): Promise<string> => {
    if (amount.kind === "fraction") {
      try {
        const amountResolution = await resolveAmountInput({
          amount,
          tokenDecimals: token.decimals,
          fetchBalance: () => fetchTokenBalance(token, context.delegator),
        });
        return formatUnits(BigInt(amountResolution.amountInput), token.decimals);
      } catch {
        // Fallback to friendly fraction description if balance fetch fails
        const ratio = amount.numerator / amount.denominator;
        if (Math.abs(ratio - 0.5) < 0.001) return "half";
        if (Math.abs(ratio - 0.25) < 0.001) return "quarter";
        if (Math.abs(ratio - 0.75) < 0.001) return "three-quarters";
        if (Math.abs(ratio - 1 / 3) < 0.001) return "third";
        if (Math.abs(ratio - 2 / 3) < 0.001) return "two-thirds";
        return `${amount.numerator}/${amount.denominator}`;
      }
    }
    return summarizeAmount(amount);
  };

  const resolveAndFormatNativeAmount = async (amount: AmountSpecification, decimals: number): Promise<string> => {
    if (amount.kind === "fraction") {
      try {
        const amountResolution = await resolveAmountInput({
          amount,
          tokenDecimals: decimals,
          fetchBalance: () => fetchNativeBalance(context.delegator),
        });
        return formatUnits(BigInt(amountResolution.amountInput), decimals);
      } catch {
        // Fallback to friendly fraction description if balance fetch fails
        const ratio = amount.numerator / amount.denominator;
        if (Math.abs(ratio - 0.5) < 0.001) return "half";
        if (Math.abs(ratio - 0.25) < 0.001) return "quarter";
        if (Math.abs(ratio - 0.75) < 0.001) return "three-quarters";
        if (Math.abs(ratio - 1 / 3) < 0.001) return "third";
        if (Math.abs(ratio - 2 / 3) < 0.001) return "two-thirds";
        return `${amount.numerator}/${amount.denominator}`;
      }
    }
    return summarizeAmount(amount);
  };

  switch (intent.action) {
    case "swap": {
      const typed = intent as SwapIntentFields;
      const amount = await resolveAndFormatAmount(typed.amount, typed.tokenIn);
      return `swap ${amount} ${typed.tokenIn.symbol ?? shortHex(typed.tokenIn.address)} to ${typed.tokenOut.symbol ?? shortHex(typed.tokenOut.address)}`;
    }
    case "transfer": {
      const typed = intent as TransferIntentFields;
      if (typed.token) {
        const amount = await resolveAndFormatAmount(typed.amount, typed.token);
        return `transfer ${amount} ${typed.token.symbol ?? shortHex(typed.token.address)} to ${typed.recipient ?? "?"}`;
      } else {
        // Native token transfer
        const amount = await resolveAndFormatNativeAmount(typed.amount, 18); // MON has 18 decimals
        return `transfer ${amount} ${MONAD_NATIVE_TOKEN_SYMBOL} to ${typed.recipient ?? "?"}`;
      }
    }
    case "wrap": {
      const amount = await resolveAndFormatNativeAmount((intent as WrapIntentFields).amount, 18);
      return `wrap ${amount} ${MONAD_NATIVE_TOKEN_SYMBOL}`;
    }
    case "unwrap": {
      const wrappedToken: AllowedToken & { decimals: number } = {
        kind: "erc20",
        address: getAddress(MONAD_WMON_ADDRESS),
        symbol: MONAD_WRAPPED_TOKEN_SYMBOL,
        decimals: 18,
      };
      const amount = await resolveAndFormatAmount((intent as WrapIntentFields).amount, wrappedToken);
      return `unwrap ${amount} ${MONAD_WRAPPED_TOKEN_SYMBOL}`;
    }
    case "delegation_issue":
      return "delegation issuance";
    default:
      return (intent as { action: string }).action;
  }
};

const serializeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  if (typeof error === "object" && error !== null) {
    return { ...error } as Record<string, unknown>;
  }
  return { message: String(error) };
};

const toReceiptToken = (token: AllowedToken & { decimals: number }) => ({
  address: getAddress(token.address),
  symbol: token.symbol,
  decimals: token.decimals,
});

const toTokenDisplaySummary = (token: AllowedToken & { decimals: number }): TokenDisplaySummary => ({
  address: getAddress(token.address),
  symbol: token.symbol ?? shortHex(token.address),
  logoURI: token.logoURI,
});

const isNativeTokenCandidate = (token?: AllowedToken) => {
  if (!token) return false;
  if (token.kind === "native") return true;
  try {
    return getAddress(token.address).toLowerCase() === MONAD_NATIVE_TOKEN_ADDRESS.toLowerCase();
  } catch {
    return false;
  }
};

export const useChatConsole = () => {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [allowedTokens, setAllowedTokens] = React.useState<AllowedToken[]>([]);
  const [delegationTokens, setDelegationTokens] = React.useState<AllowedToken[] | undefined>(undefined);
  const [loadingTokens, setLoadingTokens] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [draft, setDraft] = React.useState<string>("");
  const publicClientRef = React.useRef(createMonadPublicClient());
  const [hydrated, setHydrated] = React.useState(false);
  const [activeDelegator, setActiveDelegatorState] = React.useState<Address | undefined>(undefined);
  const [quickMode, setQuickModeState] = React.useState<boolean>(false);
  const [pendingAction, setPendingAction] = React.useState<PendingAction | null>(null);
  const [isConfirming, setIsConfirming] = React.useState(false);

  const recordSwapReceipt = React.useCallback((record: SwapReceiptRecord) => {
    try {
      storeReceipt(record);
    } catch (error) {
      console.warn("Failed to store receipt", error);
    }
  }, []);

  const setQuickMode = React.useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (value) => {
      setQuickModeState((previous) => {
        const next = typeof value === "function" ? (value as (prev: boolean) => boolean)(previous) : value;
        if (hydrated) {
          setQuickModePreference(activeDelegator, next);
        }
        return next;
      });
    },
    [activeDelegator, hydrated],
  );

const selectStoredDelegator = React.useCallback((): Address | undefined => {
  if (typeof window === "undefined" || !activeDelegator) return undefined;
  try {
    const matches = listDelegations(activeDelegator as Address);
    if (matches.length === 0) return undefined;
    return getAddress(matches[0].delegator as Address);
  } catch (error) {
    console.warn("Failed to derive stored delegator", error);
    return undefined;
  }
}, [activeDelegator]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setHydrated(true);
    const stored = getActiveDelegator();
    if (stored) {
      setActiveDelegatorState(stored);
    } else {
      const fallback = selectStoredDelegator();
      if (fallback) {
        setActiveDelegatorState(fallback);
      }
    }
  }, [selectStoredDelegator]);

  React.useEffect(() => {
    if (!hydrated) return;
    setQuickModeState(getQuickModePreference(activeDelegator));
  }, [hydrated, activeDelegator]);

  React.useEffect(() => {
    if (!hydrated || activeDelegator) return;
    const fallback = selectStoredDelegator();
    if (fallback) {
      setActiveDelegatorState(fallback);
    }
  }, [activeDelegator, hydrated, selectStoredDelegator]);

  React.useEffect(() => {
    if (!hydrated) return;
    setPendingAction(null);
    setIsConfirming(false);
    if (!activeDelegator) {
      setDelegationTokens(undefined);
      setMessages([]);
      setQuickModeState(false);
    }
  }, [activeDelegator, hydrated]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const target = window as unknown as {
      __PRAGMA_CHAT_DEBUG__?: {
        append: (message: ChatMessage) => void;
        reset: () => void;
      };
    };

    target.__PRAGMA_CHAT_DEBUG__ = {
      append: (message: ChatMessage) => {
        setMessages((prev) => [
          ...prev,
          {
            ...message,
            id: message.id ?? nanoid(),
          },
        ]);
      },
      reset: () => setMessages([]),
    };

    return () => {
      if (target.__PRAGMA_CHAT_DEBUG__) {
        delete target.__PRAGMA_CHAT_DEBUG__;
      }
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const handleIdentityChange = (event: Event) => {
      if (event instanceof CustomEvent && event.detail && "delegator" in event.detail) {
        const detail = (event as CustomEvent<{ delegator: string | null }>).detail;
        setActiveDelegatorState(detail.delegator ? getAddress(detail.delegator as Address) : undefined);
        return;
      }
      setActiveDelegatorState(getActiveDelegator());
    };

    window.addEventListener(IDENTITY_EVENT, handleIdentityChange as EventListener);

    return () => {
      window.removeEventListener(IDENTITY_EVENT, handleIdentityChange as EventListener);
    };
  }, []);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoadingTokens(true);
      try {
        const tokens = await fetchAllowlistCached();
        if (!mounted) return;
        setAllowedTokens(tokens);
      } catch (error) {
        console.warn("Failed to load token allowlist for chat console", error);
      } finally {
        if (mounted) {
          setLoadingTokens(false);
        }
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const updateContext = () => {
      if (!activeDelegator) {
        setDelegationTokens(undefined);
        if (hydrated) {
          setQuickModeState(false);
        }
        setPendingAction(null);
        setIsConfirming(false);
        return;
      }

      const context = loadChatSession("swap", undefined, activeDelegator);
      setDelegationTokens(
        context?.session.allowedTokens && context.session.allowedTokens.length > 0
          ? context.session.allowedTokens
          : undefined,
      );

      if (hydrated) {
        setQuickModeState(getQuickModePreference(activeDelegator));
      }

      if (!context) {
        setPendingAction(null);
        setIsConfirming(false);
      }
    };

    updateContext();

    const handler = () => updateContext();
    window.addEventListener("pragma:delegation:updated", handler);
    return () => {
      window.removeEventListener("pragma:delegation:updated", handler);
    };
  }, [activeDelegator, hydrated, setQuickModeState]);

  const effectiveTokens = React.useMemo<AllowedToken[]>(
    () => (delegationTokens && delegationTokens.length > 0 ? delegationTokens : allowedTokens),
    [delegationTokens, allowedTokens],
  );

  const appendMessage = React.useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
    return message.id;
  }, []);

  const updateMessage = React.useCallback((id: string, updater: (current: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((message) => (message.id === id ? updater(message) : message)));
  }, []);

  const appendLog = React.useCallback((id: string, log: ChatMessageLog) => {
    updateMessage(id, (current) => ({
      ...current,
      logs: [...(current.logs ?? []), log],
    }));
  }, [updateMessage]);

  const createLogger = React.useCallback(
    (messageId: string): ExecutionLogger => ({
      info: (message: string) => appendLog(messageId, { level: "info", message }),
      warn: (message: string) => appendLog(messageId, { level: "warn", message }),
      success: (message: string) => appendLog(messageId, { level: "success", message }),
    }),
    [appendLog],
  );

  const withDecimals = React.useCallback(
    (token: AllowedToken | undefined) => {
      if (!token) return undefined;
      return {
        ...token,
        decimals: toNumber(token.decimals),
      } as AllowedToken & { decimals: number };
    },
    [],
  );

  const fetchNativeBalance = React.useCallback(
    async (owner: Address): Promise<bigint> => {
      try {
        return await publicClientRef.current.getBalance({ address: owner });
      } catch (error) {
        console.warn("Failed to fetch native balance", error);
        return 0n;
      }
    },
    [],
  );

  const fetchTokenBalance = React.useCallback(
    async (token: AllowedToken, owner: Address): Promise<bigint> => {
      const address = token.address ? getAddress(token.address) : undefined;
      try {
        if (
          token.kind === "native" ||
          (address && address.toLowerCase() === MONAD_NATIVE_TOKEN_ADDRESS.toLowerCase())
        ) {
          return await fetchNativeBalance(owner);
        }
        if (!address) {
          return 0n;
        }
        return (await publicClientRef.current.readContract({
          address,
          abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [owner],
        })) as bigint;
      } catch (error) {
        console.warn("Failed to fetch token balance", error);
        return 0n;
      }
    },
    [fetchNativeBalance],
  );


  const buildSwapQuoteDisplay = React.useCallback(
    (preview: SwapPreviewResult, config: SwapExecutionConfig): { summary: string; presentation: SwapQuotePresentation } => {
      const amountIn = formatTokenAmount(preview.plan.amountIn, config.intent.from, config.intent.from.decimals);
      const expectedOut = formatTokenAmount(preview.plan.expectedAmountOut, config.intent.to, config.intent.to.decimals);
      const minOut = formatTokenAmount(preview.plan.minAmountOut, config.intent.to, config.intent.to.decimals);
      const slippageLabel = formatSlippageLabel(config.slippageBps);
      const summary = `Quote ${preview.plan.quote.quoteId}\n${amountIn} ${
        config.intent.from.symbol ?? shortHex(config.intent.from.address)
      } → ${expectedOut} ${config.intent.to.symbol ?? shortHex(config.intent.to.address)}\nMinimum out: ${minOut} ${
        config.intent.to.symbol ?? shortHex(config.intent.to.address)
      }\nSlippage tolerance: ${slippageLabel}`;

      return {
        summary,
        presentation: {
          type: "swap_quote",
          createdAt: Date.now(),
          quoteId: preview.plan.quote.quoteId,
          from: toTokenDisplaySummary(config.intent.from),
          to: toTokenDisplaySummary(config.intent.to),
          amountIn,
          expectedOut,
          minAmountOut: minOut,
          slippage: slippageLabel,
        },
      };
    },
    [],
  );

  const buildSwapReceiptDisplay = React.useCallback(
    (
      result: SwapResult,
      config: SwapExecutionConfig,
      preview: SwapPreviewResult,
      planHash: string,
    ): { summary: string; presentation: SwapReceiptPresentation } => {
      const amountIn = formatTokenAmount(result.amountIn, config.intent.from, config.intent.from.decimals);
      const amountOut = formatTokenAmount(result.amountOut, config.intent.to, config.intent.to.decimals);
      const minOut = formatTokenAmount(result.minAmountOut, config.intent.to, config.intent.to.decimals);
      const slippageLabel = formatSlippageLabel(config.slippageBps);
      const explorerUrl = monadChain.blockExplorers?.default?.url;
      const txLink = result.txHash && explorerUrl ? `${explorerUrl}/tx/${result.txHash}` : undefined;
      const summary = `Swap ${amountIn} ${config.intent.from.symbol ?? shortHex(config.intent.from.address)} → ${amountOut} ${
        config.intent.to.symbol ?? shortHex(config.intent.to.address)
      }`;

      return {
        summary,
        presentation: {
          type: "swap_receipt",
          executedAt: Date.now(),
          from: toTokenDisplaySummary(config.intent.from),
          to: toTokenDisplaySummary(config.intent.to),
          amountIn,
          amountOut,
          minAmountOut: minOut,
          slippageBps: config.slippageBps,
          slippageLabel,
          planHash,
          quoteId: preview.plan.quote.quoteId,
          txHash: result.txHash,
          explorerUrl: txLink,
        },
      };
    },
    [],
  );

  const runSwapExecution = React.useCallback(
    async (config: SwapExecutionConfig, preview: SwapPreviewResult, statusId: string) => {
      const logger = createLogger(statusId);
      updateMessage(statusId, (current) => ({
        ...current,
        status: "loading",
        content: `${current.content}\n\nExecuting swap…`,
      }));

      const startedAt = Date.now();
      try {
        const result = await executeSwap({ ...config, preparedPlan: preview.plan }, logger);
        const planHash = computeSwapPlanHash({
          chainId: monadChain.id,
          tokenIn: getAddress(config.intent.from.address),
          tokenOut: getAddress(config.intent.to.address),
          amountInWei: preview.plan.amountIn,
          minAmountOutWei: preview.plan.minAmountOut,
          slippageBps: config.slippageBps,
          quoteId: preview.plan.quote.quoteId,
        });

        const receiptDisplay = buildSwapReceiptDisplay(result, config, preview, planHash);

        updateMessage(statusId, (current) => ({
          ...current,
          content: receiptDisplay.summary,
          status: "success",
          presentation: receiptDisplay.presentation,
        }));

        recordSwapReceipt({
          type: "swap",
          status: "success",
          delegator: config.hybridDelegator,
          sessionKey: config.session.sessionKeyAddress,
          chainId: monadChain.id,
          mode: config.session.mode,
          tokenIn: toReceiptToken(config.intent.from),
          tokenOut: toReceiptToken(config.intent.to),
          amountInWei: result.amountIn.toString(),
          amountOutWei: result.amountOut.toString(),
          minAmountOutWei: result.minAmountOut.toString(),
          slippageBps: config.slippageBps,
          quoteId: preview.plan.quote.quoteId,
          planHash,
          txHash: result.txHash,
          blockNumber: Number(result.blockNumber),
          gasUsedWei: result.gasUsed.toString(),
          createdAt: startedAt,
          executedAt: Date.now(),
          summary: receiptDisplay.summary,
        });
      } catch (error) {
        const failureSummary = `Swap ${config.amountInput} ${config.intent.from.symbol ?? shortHex(config.intent.from.address)} → ${config.intent.to.symbol ?? shortHex(config.intent.to.address)} failed`;
        const errorMessage = parseUserFriendlyError(error);

        // Update message status to error to prevent UI freeze
        // Clear presentation to ensure error message is displayed instead of quote
        updateMessage(statusId, (current) => ({
          ...current,
          content: `${failureSummary}: ${errorMessage}`,
          status: "error",
          presentation: undefined,
        }));

        recordSwapReceipt({
          type: "swap",
          status: "failed",
          delegator: config.hybridDelegator,
          sessionKey: config.session.sessionKeyAddress,
          chainId: monadChain.id,
          mode: config.session.mode,
          tokenIn: toReceiptToken(config.intent.from),
          tokenOut: toReceiptToken(config.intent.to),
          amountInWei: preview.plan.amountIn.toString(),
          minAmountOutWei: preview.plan.minAmountOut.toString(),
          slippageBps: config.slippageBps,
          quoteId: preview.plan.quote.quoteId,
          planHash: computeSwapPlanHash({
            chainId: monadChain.id,
            tokenIn: getAddress(config.intent.from.address),
            tokenOut: getAddress(config.intent.to.address),
            amountInWei: preview.plan.amountIn,
            minAmountOutWei: preview.plan.minAmountOut,
            slippageBps: config.slippageBps,
            quoteId: preview.plan.quote.quoteId,
          }),
          createdAt: startedAt,
          executedAt: Date.now(),
          summary: `${failureSummary}: ${errorMessage}`,
          error: serializeError(error),
        });

        // Don't throw error - we've already updated the message status
        // This prevents duplicate error handling in outer catch blocks
      } finally {
        updateMessage(statusId, (current) => ({ ...current, logs: current.logs ?? [] }));
      }
    },
    [buildSwapReceiptDisplay, createLogger, recordSwapReceipt, updateMessage],
  );

  const runNativeTransferExecution = React.useCallback(
    async (
      context: ChatSessionContext,
      recipient: string,
      amountInput: string,
      resolvedDisplay: string,
      statusId: string,
    ) => {
      const logger = createLogger(statusId);
      updateMessage(statusId, (current) => ({
        ...current,
        status: "loading",
        content: `${current.content}\n\nExecuting transfer…`,
      }));

      const result = await executeNativeTransfer(
        {
          session: context.session,
          environment: context.environment,
          hybridDelegator: context.delegator,
          recipient: getAddress(recipient),
          amountInput,
        },
        logger,
      );

      updateMessage(statusId, (current) => ({
        ...current,
        content: `Transferred ${resolvedDisplay} ${MONAD_NATIVE_TOKEN_SYMBOL} to ${recipient}\nTx hash: ${shortHex(result.txHash)}`,
        status: "success",
      }));
      updateMessage(statusId, (current) => ({ ...current, logs: current.logs ?? [] }));
    },
    [createLogger, updateMessage],
  );

  const runTokenTransferExecution = React.useCallback(
    async (
      context: ChatSessionContext,
      token: AllowedToken & { decimals: number },
      recipient: string,
      amountInput: string,
      resolvedDisplay: string,
      statusId: string,
    ) => {
      const logger = createLogger(statusId);
      updateMessage(statusId, (current) => ({
        ...current,
        status: "loading",
        content: `${current.content}\n\nExecuting transfer…`,
      }));

      const result = await executeTokenTransfer(
        {
          session: context.session,
          environment: context.environment,
          hybridDelegator: context.delegator,
          token,
          recipient: getAddress(recipient),
          amountInput,
        },
        logger,
      );

      updateMessage(statusId, (current) => ({
        ...current,
        content: `Transferred ${resolvedDisplay} ${token.symbol ?? shortHex(token.address)} to ${recipient}\nTx hash: ${shortHex(result.txHash)}`,
        status: "success",
      }));
      updateMessage(statusId, (current) => ({ ...current, logs: current.logs ?? [] }));
    },
    [createLogger, updateMessage],
  );

  const runWrapExecution = React.useCallback(
    async (
      context: ChatSessionContext,
      direction: "wrap" | "unwrap",
      amountInput: string,
      resolvedDisplay: string,
      statusId: string,
    ) => {
      const logger = createLogger(statusId);
      updateMessage(statusId, (current) => ({
        ...current,
        status: "loading",
        content: `${current.content}\n\nExecuting ${direction === "wrap" ? "wrap" : "unwrap"}…`,
      }));

      const result = direction === "wrap"
        ? await executeWrap(
            {
              session: context.session,
              environment: context.environment,
              hybridDelegator: context.delegator,
              amountInput,
            },
            logger,
          )
        : await executeUnwrap(
            {
              session: context.session,
              environment: context.environment,
              hybridDelegator: context.delegator,
              amountInput,
            },
            logger,
          );

      updateMessage(statusId, (current) => ({
        ...current,
        content: `${direction === "wrap" ? "Wrapped" : "Unwrapped"} ${resolvedDisplay} ${direction === "wrap" ? MONAD_NATIVE_TOKEN_SYMBOL : MONAD_WRAPPED_TOKEN_SYMBOL}\nTx hash: ${shortHex(result.txHash)}`,
        status: "success",
      }));
      updateMessage(statusId, (current) => ({ ...current, logs: current.logs ?? [] }));
    },
    [createLogger, updateMessage],
  );

  const executeSwapIntent = React.useCallback(
    async (intent: SwapIntentFields, statusId: string) => {
      if (!activeDelegator) {
        throw new Error("No connected delegator found. Connect your account before swapping.");
      }

      const context = loadChatSession("swap", undefined, activeDelegator);
      if (!context) {
        throw new Error("No active swap delegation found. Complete onboarding before swapping.");
      }

      const allowedTokens = context.session.allowedTokens ?? [];

      const fromToken = withDecimals(
        allowedTokens.find((token) => token.address.toLowerCase() === intent.tokenIn.address.toLowerCase())
          ?? intent.tokenIn,
      );
      const toToken = withDecimals(
        allowedTokens.find((token) => token.address.toLowerCase() === intent.tokenOut.address.toLowerCase())
          ?? intent.tokenOut,
      );

      if (!fromToken || !toToken) {
        throw new Error("Swap intent references a token outside of the delegation scope.");
      }

      if (fromToken.address.toLowerCase() === toToken.address.toLowerCase()) {
        throw new Error("Source and destination tokens must be different.");
      }

      if (!intent.amount) {
        throw new Error("Swap intent is missing an amount specification.");
      }

      const amountResolution = await resolveAmountInput({
        amount: intent.amount,
        tokenDecimals: fromToken.decimals,
        fetchBalance: () => fetchTokenBalance(fromToken, context.delegator),
      });
      const amountInput = amountResolution.amountInput;
      const slippageBps = intent.slippageBps ?? 500;

      const config: SwapExecutionConfig = {
        session: context.session,
        environment: context.environment,
        hybridDelegator: context.delegator,
        intent: { from: fromToken, to: toToken },
        amountInput,
        slippageBps,
      };

      const logger = createLogger(statusId);
      let preview: SwapPreviewResult;
      try {
        preview = await previewSwap(config, logger);
      } catch (error) {
        recordSwapReceipt({
          type: "swap",
          status: "failed",
          delegator: config.hybridDelegator,
          sessionKey: config.session.sessionKeyAddress,
          chainId: monadChain.id,
          mode: config.session.mode,
          tokenIn: toReceiptToken(config.intent.from),
          tokenOut: toReceiptToken(config.intent.to),
          amountInWei: (() => {
            try {
              return parseUnits(amountInput, fromToken.decimals).toString();
            } catch {
              return "0";
            }
          })(),
          minAmountOutWei: "0",
          slippageBps,
          createdAt: Date.now(),
          previewedAt: Date.now(),
          summary: `Swap preview failed: ${parseUserFriendlyError(error)}`,
          error: serializeError(error),
        });
        throw error;
      }
      const quoteDisplay = buildSwapQuoteDisplay(preview, config);
      updateMessage(statusId, (current) => ({
        ...current,
        content: quoteDisplay.summary,
        status: "default",
        presentation: quoteDisplay.presentation,
      }));

      if (!quickMode) {
        setPendingAction({
          kind: "swap",
          statusId,
          config,
          preview,
          summary: quoteDisplay.summary,
        });
        appendLog(statusId, { level: "info", message: "Awaiting confirmation" });
        return;
      }

      // Execute swap in quick mode - errors are handled gracefully in runSwapExecution
      await runSwapExecution(config, preview, statusId);
    },
    [
      activeDelegator,
      appendLog,
      createLogger,
      fetchTokenBalance,
      buildSwapQuoteDisplay,
      quickMode,
      runSwapExecution,
      setPendingAction,
      recordSwapReceipt,
      withDecimals,
      updateMessage,
    ],
  );

  const executeTransferIntent = React.useCallback(
    async (intent: TransferIntentFields, statusId: string) => {
      if (!activeDelegator) {
        throw new Error("No connected delegator found. Connect your account before transferring.");
      }
      if (!intent.recipient || !isAddress(intent.recipient)) {
        throw new Error("Transfer intent is missing a valid recipient address.");
      }
      if (!intent.amount) {
        throw new Error("Transfer intent is missing an amount specification.");
      }

      const nativeTransfer = !intent.token || isNativeTokenCandidate(intent.token);
      if (nativeTransfer) {
        const context = loadChatSession("transfer", "swap", activeDelegator);
        if (!context) {
          throw new Error("No active transfer delegation found. Reissue onboarding before transferring MON.");
        }

        const amountResolution = await resolveAmountInput({
          amount: intent.amount,
          tokenDecimals: 18,
          fetchBalance: () => fetchNativeBalance(context.delegator),
        });
        const amountInput = amountResolution.amountInput;
        const resolvedDisplay = amountResolution.resolvedDisplay ?? amountInput;
        const symbol = intent.token?.symbol ?? MONAD_NATIVE_TOKEN_SYMBOL;

        updateMessage(statusId, (current) => ({
          ...current,
          content: `Ready to transfer ${resolvedDisplay} ${symbol} to ${intent.recipient}.`,
          status: "default",
        }));

        if (!quickMode) {
          setPendingAction({
            kind: "transfer_native",
            statusId,
            context,
            recipient: intent.recipient,
            amountInput,
            resolvedDisplay,
          });
          appendLog(statusId, { level: "info", message: "Awaiting confirmation" });
          return;
        }

        await runNativeTransferExecution(context, intent.recipient, amountInput, resolvedDisplay, statusId);
        return;
      }

      const context = loadChatSession("swap", undefined, activeDelegator);
      if (!context) {
        throw new Error("No active swap delegation found. Complete onboarding before transferring tokens.");
      }

      const allowedTokens = context.session.allowedTokens ?? [];
      const token = withDecimals(
        allowedTokens.find((candidate) => candidate.address.toLowerCase() === intent.token!.address.toLowerCase())
          ?? intent.token,
      );

      if (!token) {
        throw new Error("Transfer intent references a token outside of the delegation scope.");
      }

      const amountResolution = await resolveAmountInput({
        amount: intent.amount,
        tokenDecimals: token.decimals,
        fetchBalance: () => fetchTokenBalance(token, context.delegator),
      });
      const amountInput = amountResolution.amountInput;
      const resolvedDisplay = amountResolution.resolvedDisplay ?? amountInput;

      updateMessage(statusId, (current) => ({
        ...current,
        content: `Ready to transfer ${resolvedDisplay} ${token.symbol ?? shortHex(token.address)} to ${intent.recipient}.`,
        status: "default",
      }));

      if (!quickMode) {
        setPendingAction({
          kind: "transfer_token",
          statusId,
          context,
          token,
          recipient: intent.recipient,
          amountInput,
          resolvedDisplay,
        });
        appendLog(statusId, { level: "info", message: "Awaiting confirmation" });
        return;
      }

      await runTokenTransferExecution(context, token, intent.recipient, amountInput, resolvedDisplay, statusId);
    },
    [
      activeDelegator,
      appendLog,
      fetchNativeBalance,
      fetchTokenBalance,
      quickMode,
      runNativeTransferExecution,
      runTokenTransferExecution,
      setPendingAction,
      updateMessage,
      withDecimals,
    ],
  );

  const executeWrapIntent = React.useCallback(
    async (intent: WrapIntentFields, statusId: string) => {
      if (!activeDelegator) {
        throw new Error("No connected delegator found. Connect your account before wrapping or unwrapping.");
      }

      const context = loadChatSession("swap", undefined, activeDelegator);
      if (!context) {
        throw new Error("No active swap delegation found. Complete onboarding before wrapping.");
      }

      const allowedTokens = context.session.allowedTokens ?? [];

      const hasWrappedAllowance = allowedTokens.some(
        (token) => token.kind === "wrappedNative" || token.address.toLowerCase() === MONAD_WMON_ADDRESS.toLowerCase(),
      );
      if (!hasWrappedAllowance) {
        throw new Error("Delegation does not permit WMON. Reissue with MON/WMON enabled before wrapping.");
      }

      if (!intent.amount) {
        throw new Error("Wrap intent is missing an amount specification.");
      }

      const wrappedToken =
        allowedTokens.find((token) => token.address.toLowerCase() === MONAD_WMON_ADDRESS.toLowerCase()) ??
        ({
          address: MONAD_WMON_ADDRESS,
          symbol: MONAD_WRAPPED_TOKEN_SYMBOL,
          decimals: 18,
          kind: "wrappedNative",
          name: "Wrapped Monad",
        } as AllowedToken);

      const amountResolution = await resolveAmountInput({
        amount: intent.amount,
        tokenDecimals: 18,
        fetchBalance: () =>
          intent.action === "wrap"
            ? fetchNativeBalance(context.delegator)
            : fetchTokenBalance(wrappedToken, context.delegator),
      });
      const amountInput = amountResolution.amountInput;
      const resolvedDisplay = amountResolution.resolvedDisplay ?? amountInput;

      updateMessage(statusId, (current) => ({
        ...current,
        content: `Ready to ${intent.action === "wrap" ? "wrap" : "unwrap"} ${resolvedDisplay} ${intent.action === "wrap" ? MONAD_NATIVE_TOKEN_SYMBOL : MONAD_WRAPPED_TOKEN_SYMBOL}.`,
        status: "default",
      }));

      if (!quickMode) {
        setPendingAction({
          kind: "wrap",
          statusId,
          context,
          direction: intent.action,
          amountInput,
          resolvedDisplay,
        });
        appendLog(statusId, { level: "info", message: "Awaiting confirmation" });
        return;
      }

      await runWrapExecution(context, intent.action, amountInput, resolvedDisplay, statusId);
    },
    [
      activeDelegator,
      appendLog,
      fetchNativeBalance,
      fetchTokenBalance,
      quickMode,
      runWrapExecution,
      setPendingAction,
      updateMessage,
    ],
  );

  const cancelPendingAction = React.useCallback(() => {
    setPendingAction((current) => {
      if (!current) {
        return null;
      }
      updateMessage(current.statusId, (message) => ({
        ...message,
        status: "default",
        content: `${message.content}\n\nCancelled.`,
      }));
      appendLog(current.statusId, { level: "info", message: "Action cancelled" });
      return null;
    });
  }, [appendLog, updateMessage]);

  const confirmPendingAction = React.useCallback(async () => {
    if (!pendingAction) return;
    const currentAction = pendingAction;
    setIsConfirming(true);
    try {
      switch (currentAction.kind) {
        case "swap":
          await runSwapExecution(currentAction.config, currentAction.preview, currentAction.statusId);
          appendLog(currentAction.statusId, { level: "success", message: "Swap executed" });
          setPendingAction(null);
          break;
        case "transfer_native":
          await runNativeTransferExecution(
            currentAction.context,
            currentAction.recipient,
            currentAction.amountInput,
            currentAction.resolvedDisplay,
            currentAction.statusId,
          );
          appendLog(currentAction.statusId, { level: "success", message: "Transfer executed" });
          setPendingAction(null);
          break;
        case "transfer_token":
          await runTokenTransferExecution(
            currentAction.context,
            currentAction.token,
            currentAction.recipient,
            currentAction.amountInput,
            currentAction.resolvedDisplay,
            currentAction.statusId,
          );
          appendLog(currentAction.statusId, { level: "success", message: "Transfer executed" });
          setPendingAction(null);
          break;
        case "wrap":
          await runWrapExecution(
            currentAction.context,
            currentAction.direction,
            currentAction.amountInput,
            currentAction.resolvedDisplay,
            currentAction.statusId,
          );
          appendLog(currentAction.statusId, { level: "success", message: "Action executed" });
          setPendingAction(null);
          break;
        default:
          break;
      }
    } catch (error) {
      const message = parseUserFriendlyError(error);
      updateMessage(currentAction.statusId, (current) => ({
        ...current,
        content: `${current.content}\n\n${message}`,
        status: "error",
      }));
      appendLog(currentAction.statusId, { level: "warn", message });
    } finally {
      setIsConfirming(false);
    }
  }, [appendLog, pendingAction, runNativeTransferExecution, runSwapExecution, runTokenTransferExecution, runWrapExecution, updateMessage]);

  const handleIntent = React.useCallback(
    async (intent: CanonicalIntent, statusId: string) => {
      switch (intent.action) {
        case "swap":
          await executeSwapIntent(intent as SwapIntentFields, statusId);
          return;
        case "transfer":
          await executeTransferIntent(intent as TransferIntentFields, statusId);
          return;
        case "wrap":
        case "unwrap":
          await executeWrapIntent(intent as WrapIntentFields, statusId);
          return;
        case "delegation_issue":
          updateMessage(statusId, (current) => ({
            ...current,
            content: "Delegation issuance must be completed via the Connected account modal in the web app.",
            status: "error",
          }));
          return;
        default:
          updateMessage(statusId, (current) => ({
            ...current,
            content: `Intent action "${(intent as { action: string }).action}" is not supported in the web console yet.`,
            status: "error",
          }));
      }
    },
    [executeSwapIntent, executeTransferIntent, executeWrapIntent, updateMessage],
  );

  const submitDraft = React.useCallback(async () => {
    const input = draft.trim();
    if (!input || isSubmitting) return;

    setDraft("");
    setIsSubmitting(true);
    setPendingAction(null);
    setIsConfirming(false);

    appendMessage({
      id: nanoid(),
      role: "user",
      content: input,
    });

    const statusId = appendMessage({
      id: nanoid(),
      role: "system",
      content: "Thinking",
      status: "loading",
    });

    try {
      let connectedDelegator = activeDelegator;
      if (!connectedDelegator) {
        connectedDelegator = selectStoredDelegator();
        if (connectedDelegator) {
          setActiveDelegatorState(connectedDelegator);
        }
      }

      const swapContext = connectedDelegator
        ? loadChatSession("swap", undefined, connectedDelegator)
        : undefined;

      if (!connectedDelegator) {
        throw new Error("No connected delegator found. Connect your account before using the chat console.");
      }

      if (!swapContext) {
        throw new Error("No active delegation found. Connect and issue a delegation from the Connected account menu first.");
      }

      const sanitizedArtifact = {
        ...swapContext.artifact,
        sessionKeyPrivateKey: "0x" as Hex,
      };

      const allowedTokens = swapContext.session.allowedTokens ?? [];

      let streamedContent = "";
      let hasSetInsightPresentation = false;

      const response = await callAgent(
        {
          message: input,
          delegation: {
            artifact: sanitizedArtifact,
            tokens: allowedTokens.length > 0 ? allowedTokens : effectiveTokens,
          },
          quickMode,
        },
        {
          onStream: (chunk) => {
            streamedContent += chunk;

            // Set insight presentation immediately on first chunk to show "Pragma Insight" badge
            if (!hasSetInsightPresentation && streamedContent.trim().length > 0) {
              hasSetInsightPresentation = true;
              updateMessage(statusId, (current) => ({
                ...current,
                content: streamedContent,
                status: "default",
                presentation: {
                  type: "insight",
                  heading: "Pragma Insight",
                  body: streamedContent,
                },
              }));
            } else {
              updateMessage(statusId, (current) => ({
                ...current,
                content: streamedContent,
                status: "default",
                ...(hasSetInsightPresentation && current.presentation ? {
                  presentation: {
                    ...current.presentation,
                    body: streamedContent,
                  },
                } : {}),
              }));
            }
          },
          onControl: (event: AgentControlEvent) => {
            if (event.type === "quick_mode") {
              const enabled = Boolean((event.payload as { enabled?: unknown })?.enabled);
              setQuickMode(enabled);
            }
          },
        },
      );

      if (response.type === "intent") {
        const intent = response.intent as CanonicalIntent;
        const summary = await describeIntent(intent, swapContext, fetchTokenBalance, fetchNativeBalance);
        updateMessage(statusId, (current) => ({
          ...current,
          content: `Recognized intent: ${summary}${formatWarnings(response.warnings)}`,
        }));
        await handleIntent(intent, statusId);
        return;
      }

      if (response.type === "clarification") {
        const clarification = response.clarification as ClarificationRequest;
        const prompts = clarification.questions
          .map((question, index) => `${index + 1}. ${question.prompt}`)
          .join("\n");
        updateMessage(statusId, (current) => ({
          ...current,
          content: `I need a bit more detail:${formatWarnings(response.warnings)}\n\n${prompts}`,
          status: "default",
        }));
        return;
      }

      if (response.type === "insight") {
        const finalBody = typeof response.body === "string" ? response.body : "";
        const combined = (finalBody || streamedContent || "No additional insight is available for this request.").trim();
        const normalizedCombined = combined
          .replace(/(Session key:[^\n]*?)\s+(Session holdings:)/g, "$1\n$2")
          .replace(/(Session holdings:[^\n]*?)\s+(Top balances:)/g, "$1\n$2");
        updateMessage(statusId, (current) => ({
          ...current,
          content: `${normalizedCombined}${formatWarnings(response.warnings)}`,
          status: "default",
          presentation: {
            type: "insight",
            heading:
              typeof response.title === "string" && response.title.trim().length > 0
                ? response.title.trim()
                : "Pragma Insight",
            body: normalizedCombined,
          },
        }));
        return;
      }

      if (response.type === "error") {
        const violations = (response.violations as PolicyViolation[] | undefined)?.map((violation) => `- ${violation.message}`) ?? [];
        updateMessage(statusId, (current) => ({
          ...current,
          content: `Unable to fulfil the request:${formatWarnings(response.warnings)}${violations.length > 0 ? `\n\n${violations.join("\n")}` : ""}`,
          status: "error",
        }));
        return;
      }

      updateMessage(statusId, (current) => ({
        ...current,
        content: "Agent returned an unsupported response type.",
        status: "error",
      }));
    } catch (error) {
      const message = parseUserFriendlyError(error);
      updateMessage(statusId, (current) => ({
        ...current,
        content: message,
        status: "error",
      }));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    activeDelegator,
    appendMessage,
    draft,
    effectiveTokens,
    fetchNativeBalance,
    fetchTokenBalance,
    handleIntent,
    isSubmitting,
    quickMode,
    selectStoredDelegator,
    setActiveDelegatorState,
    setQuickMode,
    updateMessage,
  ]);

  const handleSubmit = React.useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      await submitDraft();
    },
    [submitDraft],
  );

  return {
    messages,
    loadingTokens,
    isSubmitting,
    draft,
    setDraft,
    handleSubmit,
    quickMode,
    setQuickMode,
    pendingAction,
    confirmPendingAction,
    cancelPendingAction,
    isConfirming,
  };
};
