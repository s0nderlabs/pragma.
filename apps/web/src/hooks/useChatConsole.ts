"use client";

import * as React from "react";
import { nanoid } from "nanoid/non-secure";
import { formatUnits, isAddress } from "viem";
import type { AllowedToken } from "@pragma/core/monorail/tokens";
import type {
  ExecutionLogger,
  SwapExecutionConfig,
  SwapPreviewResult,
  SwapResult,
} from "@pragma/core/execution/swap";

import { fetchAllowlist } from "../lib/onboarding/service";
import { loadChatSession } from "../lib/chat/session";
import { previewSwap, executeSwap } from "../lib/chat/swap";
import { executeNativeTransfer, executeTokenTransfer } from "../lib/chat/transfer";
import { executeWrap, executeUnwrap } from "../lib/chat/wrap";
import {
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_WRAPPED_TOKEN_SYMBOL,
  MONAD_WMON_ADDRESS,
} from "../lib/config";
import { monadChain } from "../lib/clients";

type ChatCommand = "swap" | "transfer" | "wrap";

type LogLevel = "info" | "success" | "warn";

export interface ChatMessageLog {
  level: LogLevel;
  message: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "system";
  content: string;
  status?: "default" | "loading" | "success" | "error";
  logs?: ChatMessageLog[];
}

interface SwapFormState {
  fromAddress?: string;
  toAddress?: string;
  amount: string;
  slippageBps: number;
}

interface TransferFormState {
  type: "native" | "token";
  tokenAddress?: string;
  recipient: string;
  amount: string;
}

interface WrapFormState {
  direction: "wrap" | "unwrap";
  amount: string;
}

const shortHex = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const toNumber = (value: unknown, fallback = 18): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const initialSwapForm: SwapFormState = {
  amount: "0.1",
  slippageBps: 50,
};

const initialTransferForm: TransferFormState = {
  type: "native",
  recipient: "",
  amount: "",
};

const initialWrapForm: WrapFormState = {
  direction: "wrap",
  amount: "",
};

const parseError = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return String(error);
};

const formatTokenAmount = (amount: bigint, token: AllowedToken, decimalsOverride?: number) => {
  const decimals = decimalsOverride ?? toNumber(token.decimals);
  return formatUnits(amount, decimals);
};

export const useChatConsole = () => {
  const [command, setCommand] = React.useState<ChatCommand>("swap");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [allowedTokens, setAllowedTokens] = React.useState<AllowedToken[]>([]);
  const [delegationTokens, setDelegationTokens] = React.useState<AllowedToken[] | undefined>(undefined);
  const [loadingTokens, setLoadingTokens] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [swapForm, setSwapForm] = React.useState<SwapFormState>(initialSwapForm);
  const [transferForm, setTransferForm] = React.useState<TransferFormState>(initialTransferForm);
  const [wrapForm, setWrapForm] = React.useState<WrapFormState>(initialWrapForm);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoadingTokens(true);
      try {
        const tokens = await fetchAllowlist();
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
    const updateContext = () => {
      const context = loadChatSession("swap");
      setDelegationTokens(
        context?.session.allowedTokens && context.session.allowedTokens.length > 0
          ? context.session.allowedTokens
          : undefined,
      );
    };

    updateContext();

    const handler = () => updateContext();
    window.addEventListener("pragma:delegation:updated", handler);
    return () => {
      window.removeEventListener("pragma:delegation:updated", handler);
    };
  }, []);

  const effectiveTokens = React.useMemo<AllowedToken[]>(
    () => (delegationTokens && delegationTokens.length > 0 ? delegationTokens : allowedTokens),
    [delegationTokens, allowedTokens],
  );

  const tokensByAddress = React.useMemo(() => {
    const map = new Map<string, AllowedToken>();
    effectiveTokens.forEach((token) => {
      map.set(token.address.toLowerCase(), token);
    });
    return map;
  }, [effectiveTokens]);

  React.useEffect(() => {
    if (effectiveTokens.length === 0) return;
    setSwapForm((prev) => {
      const tokensMap = new Map(effectiveTokens.map((token) => [token.address.toLowerCase(), token]));
      const fromValid = prev.fromAddress && tokensMap.has(prev.fromAddress.toLowerCase());
      const toValid = prev.toAddress && tokensMap.has(prev.toAddress.toLowerCase());
      if (fromValid && toValid) {
        return prev;
      }
      const [first, second] = effectiveTokens;
      const fallbackTo = second ?? first;
      return {
        ...prev,
        fromAddress: fromValid ? prev.fromAddress : first?.address,
        toAddress: toValid ? prev.toAddress : fallbackTo?.address,
      };
    });

    setTransferForm((prev) => {
      if (prev.type !== "token") {
        return prev;
      }
      const tokensMap = new Map(effectiveTokens.map((token) => [token.address.toLowerCase(), token]));
      const valid = prev.tokenAddress && tokensMap.has(prev.tokenAddress.toLowerCase());
      if (valid) return prev;
      return {
        ...prev,
        tokenAddress: effectiveTokens[0]?.address,
      };
    });
  }, [effectiveTokens]);

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

  const buildSwapConfig = React.useCallback(
    (override?: Partial<SwapExecutionConfig>): SwapExecutionConfig => {
      const context = loadChatSession("swap");
      if (!context) {
        throw new Error("No active swap delegation found. Complete onboarding before swapping.");
      }

      const fromToken = withDecimals(tokensByAddress.get((swapForm.fromAddress ?? "").toLowerCase()));
      const toToken = withDecimals(tokensByAddress.get((swapForm.toAddress ?? "").toLowerCase()));

      if (!fromToken || !toToken) {
        throw new Error("Select both source and destination tokens before swapping.");
      }

      if (fromToken.address.toLowerCase() === toToken.address.toLowerCase()) {
        throw new Error("Source and destination tokens must be different.");
      }

      if (!swapForm.amount || Number(swapForm.amount) <= 0) {
        throw new Error("Swap amount must be greater than zero.");
      }

      const slippageBps = Number.isFinite(swapForm.slippageBps)
        ? swapForm.slippageBps
        : 50;

      return {
        session: context.session,
        environment: context.environment,
        hybridDelegator: context.delegator,
        intent: { from: fromToken, to: toToken },
        amountInput: swapForm.amount,
        slippageBps,
        ...override,
      } satisfies SwapExecutionConfig;
    },
    [swapForm, tokensByAddress, withDecimals],
  );

  const formatQuoteSummary = (preview: SwapPreviewResult, config: SwapExecutionConfig) => {
    const amountIn = formatTokenAmount(preview.plan.amountIn, config.intent.from, config.intent.from.decimals);
    const expectedOut = formatTokenAmount(preview.plan.expectedAmountOut, config.intent.to, config.intent.to.decimals);
    const minOut = formatTokenAmount(preview.plan.minAmountOut, config.intent.to, config.intent.to.decimals);
    return `Quote ${preview.plan.quote.quoteId}
${amountIn} ${config.intent.from.symbol ?? shortHex(config.intent.from.address)} → ${expectedOut} ${config.intent.to.symbol ?? shortHex(config.intent.to.address)}
Minimum out: ${minOut} ${config.intent.to.symbol ?? shortHex(config.intent.to.address)}`;
  };

  const formatSwapResult = (result: SwapResult, config: SwapExecutionConfig) => {
    const amountIn = formatTokenAmount(result.amountIn, config.intent.from, config.intent.from.decimals);
    const amountOut = formatTokenAmount(result.amountOut, config.intent.to, config.intent.to.decimals);
    const explorerUrl = monadChain.blockExplorers?.default?.url;
    const txLabel = shortHex(result.txHash);
    const txLink = explorerUrl ? `${explorerUrl}/tx/${result.txHash}` : undefined;
    return `Swap executed successfully
${amountIn} ${config.intent.from.symbol ?? shortHex(config.intent.from.address)} → ${amountOut} ${config.intent.to.symbol ?? shortHex(config.intent.to.address)}
Tx hash: ${txLabel}${txLink ? `
Explorer: ${txLink}` : ""}`;
  };

  const submitSwap = React.useCallback(async () => {
    setIsSubmitting(true);
    const userMessageId = appendMessage({
      id: nanoid(),
      role: "user",
      content: `Swap ${swapForm.amount} ${tokensByAddress.get((swapForm.fromAddress ?? "").toLowerCase())?.symbol ?? "token"} → ${tokensByAddress.get((swapForm.toAddress ?? "").toLowerCase())?.symbol ?? "token"}`,
      status: "default",
    });

    const statusId = appendMessage({
      id: nanoid(),
      role: "system",
      content: "Fetching quote…",
      status: "loading",
    });

    try {
      const config = buildSwapConfig();
      const logger = createLogger(statusId);
      const preview = await previewSwap(config, logger);
      updateMessage(statusId, (current) => ({
        ...current,
        content: formatQuoteSummary(preview, config),
      }));

      const result = await executeSwap({ ...config, preparedPlan: preview.plan }, logger);
      updateMessage(statusId, (current) => ({
        ...current,
        content: formatSwapResult(result, config),
        status: "success",
      }));

      // ensure logs array at least empty for consistent UI
      updateMessage(statusId, (current) => ({ ...current, logs: current.logs ?? [] }));
    } catch (error) {
      const message = parseError(error);
      updateMessage(statusId, (current) => ({
        ...current,
        content: message,
        status: "error",
      }));
    } finally {
      setIsSubmitting(false);
      updateMessage(userMessageId, (current) => current);
    }
  }, [appendMessage, buildSwapConfig, createLogger, swapForm, tokensByAddress, updateMessage]);

  const submitTransfer = React.useCallback(async () => {
    setIsSubmitting(true);
    const labelToken =
      transferForm.type === "token"
        ? tokensByAddress.get((transferForm.tokenAddress ?? "").toLowerCase())?.symbol ?? "token"
        : MONAD_NATIVE_TOKEN_SYMBOL;
    const userMessageId = appendMessage({
      id: nanoid(),
      role: "user",
      content: `Transfer ${transferForm.amount || "?"} ${labelToken} to ${transferForm.recipient || "?"}`,
      status: "default",
    });

    const statusId = appendMessage({
      id: nanoid(),
      role: "system",
      content: "Preparing transfer…",
      status: "loading",
    });

    try {
      if (!transferForm.amount || Number(transferForm.amount) <= 0) {
        throw new Error("Transfer amount must be greater than zero.");
      }
      if (!isAddress(transferForm.recipient)) {
        throw new Error("Recipient must be a valid address.");
      }

      const logger = createLogger(statusId);

      if (transferForm.type === "native") {
        const context = loadChatSession("transfer", "swap");
        if (!context) {
          throw new Error("No active transfer delegation found. Reissue onboarding before transferring MON.");
        }

        const result = await executeNativeTransfer(
          {
            session: context.session,
            environment: context.environment,
            hybridDelegator: context.delegator,
            recipient: transferForm.recipient,
            amountInput: transferForm.amount,
          },
          logger,
        );

        updateMessage(statusId, (current) => ({
          ...current,
          content: `Transferred ${transferForm.amount} ${MONAD_NATIVE_TOKEN_SYMBOL} to ${transferForm.recipient}
Tx hash: ${shortHex(result.txHash)}`,
          status: "success",
        }));
      } else {
        const token = withDecimals(tokensByAddress.get((transferForm.tokenAddress ?? "").toLowerCase()));
        if (!token) {
          throw new Error("Select a token to transfer.");
        }

        const context = loadChatSession("swap");
        if (!context) {
          throw new Error("No active swap delegation found. Reissue onboarding before transferring tokens.");
        }

        const result = await executeTokenTransfer(
          {
            session: context.session,
            environment: context.environment,
            hybridDelegator: context.delegator,
            token,
            recipient: transferForm.recipient,
            amountInput: transferForm.amount,
          },
          logger,
        );

        const formatted = formatTokenAmount(result.amount, token, token.decimals);
        updateMessage(statusId, (current) => ({
          ...current,
          content: `Transferred ${formatted} ${token.symbol ?? shortHex(token.address)} to ${transferForm.recipient}
Tx hash: ${shortHex(result.txHash)}`,
          status: "success",
        }));
      }

      updateMessage(statusId, (current) => ({ ...current, logs: current.logs ?? [] }));
    } catch (error) {
      const message = parseError(error);
      updateMessage(statusId, (current) => ({
        ...current,
        content: message,
        status: "error",
      }));
    } finally {
      setIsSubmitting(false);
      updateMessage(userMessageId, (current) => current);
    }
  }, [appendMessage, createLogger, tokensByAddress, transferForm, updateMessage, withDecimals]);

  const submitWrap = React.useCallback(async () => {
    setIsSubmitting(true);
    const userMessageId = appendMessage({
      id: nanoid(),
      role: "user",
      content: `${wrapForm.direction === "wrap" ? "Wrap" : "Unwrap"} ${wrapForm.amount || "?"} ${wrapForm.direction === "wrap" ? MONAD_NATIVE_TOKEN_SYMBOL : MONAD_WRAPPED_TOKEN_SYMBOL}`,
      status: "default",
    });

    const statusId = appendMessage({
      id: nanoid(),
      role: "system",
      content: `${wrapForm.direction === "wrap" ? "Wrapping" : "Unwrapping"}…`,
      status: "loading",
    });

    try {
      if (!wrapForm.amount || Number(wrapForm.amount) <= 0) {
        throw new Error("Amount must be greater than zero.");
      }

      const context = loadChatSession("swap");
      if (!context) {
        throw new Error("No active delegation found. Reissue onboarding before wrapping.");
      }

      const hasWrappedAllowance = context.session.allowedTokens?.some(
        (token) => token.kind === "wrappedNative" || token.address.toLowerCase() === MONAD_WMON_ADDRESS.toLowerCase(),
      );
      if (!hasWrappedAllowance) {
        throw new Error(
          "Current delegation does not allow wrapped MON operations. Reissue the delegation after selecting tokens to refresh wrap permissions.",
        );
      }

      const logger = createLogger(statusId);
      const config = {
        session: context.session,
        environment: context.environment,
        hybridDelegator: context.delegator,
        amountInput: wrapForm.amount,
      };

      const result = wrapForm.direction === "wrap"
        ? await executeWrap(config, logger)
        : await executeUnwrap(config, logger);

      updateMessage(statusId, (current) => ({
        ...current,
        content: `${wrapForm.direction === "wrap" ? "Wrapped" : "Unwrapped"} ${wrapForm.amount} ${wrapForm.direction === "wrap" ? MONAD_NATIVE_TOKEN_SYMBOL : MONAD_WRAPPED_TOKEN_SYMBOL}
Tx hash: ${shortHex(result.txHash)}`,
        status: "success",
      }));
      updateMessage(statusId, (current) => ({ ...current, logs: current.logs ?? [] }));
    } catch (error) {
      const message = parseError(error);
      updateMessage(statusId, (current) => ({
        ...current,
        content: message,
        status: "error",
      }));
    } finally {
      setIsSubmitting(false);
      updateMessage(userMessageId, (current) => current);
    }
  }, [appendMessage, createLogger, updateMessage, wrapForm]);

  const updateSwapForm = React.useCallback((patch: Partial<SwapFormState>) => {
    setSwapForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateTransferForm = React.useCallback((patch: Partial<TransferFormState>) => {
    setTransferForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateWrapForm = React.useCallback((patch: Partial<WrapFormState>) => {
    setWrapForm((prev) => ({ ...prev, ...patch }));
  }, []);

  return {
    command,
    setCommand,
    messages,
    availableTokens: effectiveTokens,
    loadingTokens,
    isSubmitting,
    swapForm,
    updateSwapForm,
    transferForm,
    updateTransferForm,
    wrapForm,
    updateWrapForm,
    submitSwap,
    submitTransfer,
    submitWrap,
  };
};
