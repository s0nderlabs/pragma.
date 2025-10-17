"use client";

import * as React from "react";
import {
  ArrowRightLeft,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  Info,
  AlertTriangle,
  Loader2,
  Sparkles,
} from "lucide-react";

import type {
  ChatMessagePresentation,
  InsightPresentation,
  SwapQuotePresentation,
  SwapReceiptPresentation,
  TokenDisplaySummary,
} from "../../hooks/useChatConsole";
import { useChatConsole } from "../../hooks/useChatConsole";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { cn } from "../../lib/utils";
import { ConnectedAccount } from "../account/connected-account";
import { ThemeToggle } from "../theme-toggle";

const LoadingDots = ({ tone = "#846FFA" }: { tone?: string }) => (
  <div data-testid="loading-dots" className="mt-3 flex items-center gap-1.5">
    {[0, 120, 240].map((delay) => (
      <span
        key={delay}
        className="h-2.5 w-2.5 rounded-full animate-bounce"
        style={{ animationDelay: `${delay}ms`, backgroundColor: tone }}
      />
    ))}
  </div>
);

interface MessageBubbleProps {
  role: "user" | "system";
  content: string;
  status?: "default" | "loading" | "success" | "error";
  logs?: { level: "info" | "success" | "warn"; message: string }[];
  presentation?: ChatMessagePresentation;
}

type LogTone = {
  dotClass: string;
  cardClass: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const LOG_TONES: Record<NonNullable<MessageBubbleProps["logs"]>[number]["level"], LogTone> = {
  info: {
    dotClass: "text-[#6f63ff]",
    cardClass: "text-[#1f1b3f] dark:text-[#d7d4ff]",
    icon: Info,
  },
  success: {
    dotClass: "text-emerald-500",
    cardClass: "text-emerald-700 dark:text-emerald-200",
    icon: CheckCircle2,
  },
  warn: {
    dotClass: "text-amber-500",
    cardClass: "text-amber-700 dark:text-amber-200",
    icon: AlertTriangle,
  },
};

const LogTimeline = ({ logs }: { logs: NonNullable<MessageBubbleProps["logs"]> }) => (
  <div className="mt-3">
    <ol className="space-y-2 text-sm text-[#433B51] dark:text-[#EAE9FF]">
      {logs.map((log, index) => {
        const tone = LOG_TONES[log.level];
        return (
          <li key={`${log.level}-${index}`} className="flex items-start gap-2">
            <tone.icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", tone.dotClass)} />
            <span className={cn("leading-relaxed", tone.cardClass)}>{log.message}</span>
          </li>
        );
      })}
    </ol>
  </div>
);

type MessageSegment =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

const parseMessageSegments = (content: string): MessageSegment[] => {
  const segments: MessageSegment[] = [];
  const lines = content.split("\n");
  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];

  const commitParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join(" ").trim();
    if (text.length > 0) {
      segments.push({ kind: "paragraph", text });
    }
    paragraphBuffer = [];
  };

  const commitList = () => {
    if (listBuffer.length === 0) return;
    segments.push({ kind: "list", items: listBuffer.map((item) => item.trim()) });
    listBuffer = [];
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed.length === 0) {
      commitParagraph();
      commitList();
      continue;
    }

    if (/^- /.test(trimmed)) {
      if (paragraphBuffer.length > 0) {
        commitParagraph();
      }
      listBuffer.push(trimmed.replace(/^- /, ""));
      continue;
    }

    if (listBuffer.length > 0) {
      commitList();
    }

    paragraphBuffer.push(trimmed);
  }

  commitParagraph();
  commitList();

  return segments;
};

const renderSegments = (segments: MessageSegment[], keyPrefix: string) => {
  if (segments.length === 0) return null;
  return segments.map((segment, index) => {
    if (segment.kind === "paragraph") {
      return <p key={`${keyPrefix}-paragraph-${index}`}>{segment.text}</p>;
    }
    return (
      <ul
        key={`${keyPrefix}-list-${index}`}
        className="ml-5 list-disc space-y-1 marker:text-[#6f63ff] dark:marker:text-[#cfcaff]"
      >
        {segment.items.map((item, itemIndex) => (
          <li key={`${keyPrefix}-list-${index}-item-${itemIndex}`}>{item}</li>
        ))}
      </ul>
    );
  });
};

const StatusBadge = ({
  label,
  toneClass,
  icon: Icon,
  spin,
}: {
  label: string;
  toneClass: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  spin?: boolean;
}) => (
  <div className={cn("flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide", toneClass)}>
    <Icon className={cn("h-3.5 w-3.5", spin && "animate-spin")}/>
    <span>{label}</span>
  </div>
);

const getStatusMeta = (
  status: "default" | "loading" | "success" | "error",
  presentation?: ChatMessagePresentation,
) => {
  if (presentation?.type === "swap_quote") {
    return {
      label: "Swap Quote",
      toneClass: "text-[#4637dd] dark:text-[#d4d0ff]",
      icon: ArrowRightLeft,
    };
  }
  if (presentation?.type === "swap_receipt") {
    return {
      label: "Swap Executed",
      toneClass: "text-emerald-700 dark:text-emerald-200",
      icon: CheckCircle2,
    };
  }
  if (presentation?.type === "insight") {
    return {
      label: "Pragma Insight",
      toneClass: "text-[#6f63ff] dark:text-[#cfcaff]",
      icon: Sparkles,
    };
  }

  switch (status) {
    case "loading":
      return {
        label: "Working…",
        toneClass: "text-[#4637dd] dark:text-[#d4d0ff]",
        icon: Loader2,
        spin: true,
      };
    case "success":
      return {
        label: "Completed",
        toneClass: "text-emerald-700 dark:text-emerald-200",
        icon: CheckCircle2,
      };
    case "error":
      return {
        label: "Needs Attention",
        toneClass: "text-[#7f1d1d] dark:text-[#fecaca]",
        icon: AlertTriangle,
      };
    default:
      return {
        label: "Update",
        toneClass: "text-[#433B51] dark:text-[#EAE9FF]",
        icon: Info,
      };
  }
};

const TokenChip = ({ token, variant = "neutral" }: { token: TokenDisplaySummary; variant?: "neutral" | "from" | "to" }) => (
  <span
    className={cn(
      "inline-flex min-w-[3rem] items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
      variant === "from" &&
        "border-[#7564ff]/50 bg-[#7564ff]/15 text-[#4132d8] shadow-[0_6px_16px_rgba(117,100,255,0.2)] dark:border-[#7564ff]/40 dark:bg-[#7564ff]/25 dark:text-[#dad7ff]",
      variant === "to" &&
        "border-emerald-400/60 bg-emerald-400/15 text-emerald-700 shadow-[0_6px_16px_rgba(16,185,129,0.18)] dark:border-emerald-400/40 dark:bg-emerald-400/25 dark:text-emerald-200",
      variant === "neutral" &&
        "border-[#433B51]/20 bg-white/80 text-[#433B51] dark:border-white/10 dark:bg-white/10 dark:text-[#EAE9FF]",
    )}
  >
    {token.symbol}
  </span>
);

const QuoteStat = ({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "positive" | "muted" }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6B5BBB] dark:text-[#B7B2FF]">
      {label}
    </span>
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        tone === "positive" && "bg-emerald-400/20 text-emerald-600 dark:bg-emerald-400/20 dark:text-emerald-200",
        tone === "muted" && "bg-[#433B51]/15 text-[#433B51] dark:bg-white/15 dark:text-[#EAE9FF]",
        tone === "default" && "bg-white/80 text-[#433B51] shadow-sm dark:bg-white/12 dark:text-[#EAE9FF]",
      )}
    >
      {value}
    </span>
  </div>
);

const TokenPairRow = ({ from, to }: { from: TokenDisplaySummary; to: TokenDisplaySummary }) => (
  <div className="flex flex-wrap items-center gap-3 text-xs">
    <TokenChip token={from} variant="from" />
    <ArrowRightLeft className="h-4 w-4 text-[#7364ff] dark:text-[#a79fff]" />
    <TokenChip token={to} variant="to" />
  </div>
);

const SwapQuoteCard = ({ presentation }: { presentation: SwapQuotePresentation }) => (
  <div className="space-y-4">
    <TokenPairRow from={presentation.from} to={presentation.to} />
    <div className="grid gap-4 text-sm md:grid-cols-2">
      <QuoteStat label="Amount in" value={`${presentation.amountIn} ${presentation.from.symbol}`} tone="muted" />
      <QuoteStat label="Expected out" value={`${presentation.expectedOut} ${presentation.to.symbol}`} tone="positive" />
      <QuoteStat label="Minimum out" value={`${presentation.minAmountOut} ${presentation.to.symbol}`} />
      <QuoteStat label="Slippage" value={presentation.slippage} />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#6B5BBB] dark:text-[#B7B2FF]">
      <span>Quote #{presentation.quoteId}</span>
      <span>{new Date(presentation.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
    </div>
  </div>
);

const SwapReceiptCard = ({ presentation }: { presentation: SwapReceiptPresentation }) => {
  const executedLabel = new Date(presentation.executedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-4">
      <TokenPairRow from={presentation.from} to={presentation.to} />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
            Received
          </span>
          <span className="inline-flex items-center rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-200">
            + {presentation.amountOut} {presentation.to.symbol}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6B5BBB] dark:text-[#B7B2FF]">
            Sent
          </span>
          <span className="inline-flex items-center rounded-full bg-[#433B51]/15 px-3 py-1 text-xs font-semibold text-[#433B51] dark:bg-white/10 dark:text-[#EAE9FF]">
            - {presentation.amountIn} {presentation.from.symbol}
          </span>
        </div>
      </div>
      <div className="grid gap-4 text-xs sm:grid-cols-2">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#7A7196] dark:text-[#B7B2FF]/80">
            Minimum out
          </span>
          <p className="text-sm font-medium text-[#1A120F] dark:text-[#EAE9FF]">
            {presentation.minAmountOut} {presentation.to.symbol}
          </p>
        </div>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#7A7196] dark:text-[#B7B2FF]/80">
            Slippage
          </span>
          <p className="text-sm font-medium text-[#1A120F] dark:text-[#EAE9FF]">{presentation.slippageLabel}</p>
        </div>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#7A7196] dark:text-[#B7B2FF]/80">
            Executed at
          </span>
          <p className="text-sm font-medium text-[#1A120F] dark:text-[#EAE9FF]">{executedLabel}</p>
        </div>
        {presentation.planHash && (
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#7A7196] dark:text-[#B7B2FF]/80">
              Plan hash
            </span>
            <p className="text-sm font-medium text-[#1A120F] dark:text-[#EAE9FF]">{presentation.planHash}</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        {presentation.txHash && presentation.explorerUrl ? (
          <a
            href={presentation.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-400/20 px-3 py-1 text-emerald-700 transition hover:bg-emerald-400/30 dark:bg-emerald-400/25 dark:text-emerald-200 dark:hover:bg-emerald-400/35"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View on explorer
          </a>
        ) : presentation.txHash ? (
          <span className="inline-flex items-center rounded-full bg-[#433B51]/10 px-3 py-1 text-[#433B51] dark:bg-white/10 dark:text-[#EAE9FF]">
            Tx {presentation.txHash}
          </span>
        ) : null}
        {presentation.quoteId && (
          <span className="inline-flex items-center rounded-full bg-[#846FFA]/15 px-3 py-1 text-[#4333B3] dark:bg-[#846FFA]/20 dark:text-[#DAD7FF]">
            Quote {presentation.quoteId}
          </span>
        )}
      </div>
    </div>
  );
};

const AgentInsightNote = ({ presentation, content }: { presentation: InsightPresentation; content: string }) => {
  const body = (presentation.body ?? content).trim();
  const segments = parseMessageSegments(body);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#6f63ff] dark:text-[#cfcaff]">
        <Sparkles className="h-4 w-4" />
        <span>{presentation.heading}</span>
      </div>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-[#2a2742] dark:text-[#EAE9FF]">
        {segments.length === 0 ? <p>{body}</p> : renderSegments(segments, "insight")}
      </div>
    </div>
  );
};

const renderPresentation = (presentation: ChatMessagePresentation | undefined, rawContent: string) => {
  if (!presentation) return null;
  switch (presentation.type) {
    case "swap_quote":
      return <SwapQuoteCard presentation={presentation} />;
    case "swap_receipt":
      return <SwapReceiptCard presentation={presentation} />;
    case "insight":
      return <AgentInsightNote presentation={presentation} content={rawContent} />;
    default:
      return null;
  }
};

const MessageBubble = ({ role, content, status = "default", logs, presentation }: MessageBubbleProps) => {
  const isUser = role === "user";
  if (isUser) {
    return (
      <div className="flex w-full justify-end">
        <div
          data-testid="user-message"
          className="inline-flex max-w-[60%] overflow-hidden rounded-2xl border border-transparent bg-gradient-to-br from-[#846FFA] to-[#674CF9] px-4 py-2 text-xs font-medium text-white shadow-[0_3px_12px_rgba(0,0,0,0.1)]"
        >
          <div className="flex flex-col gap-2 text-sm leading-relaxed text-left">
            {renderSegments(parseMessageSegments(content), "user-message")}
          </div>
        </div>
      </div>
    );
  }

  const statusMeta = getStatusMeta(status, presentation);
  const showStatus = presentation?.type !== "insight" || status !== "default";

  return (
    <div className="flex w-full justify-start">
      <div data-testid="system-message" className="flex w-full flex-col gap-3 text-left">
        {showStatus ? <StatusBadge {...statusMeta} /> : null}
        {presentation ? (
          <>
            <span className="sr-only">{content}</span>
            {renderPresentation(presentation, content)}
          </>
        ) : (
          <div className="flex flex-col gap-2 text-sm leading-relaxed text-[#1A120F] dark:text-[#EAE9FF]">
            {renderSegments(parseMessageSegments(content), "system-default")}
          </div>
        )}
        {status === "loading" && <LoadingDots />}
        {logs && logs.length > 0 && <LogTimeline logs={logs} />}
      </div>
    </div>
  );
};

export const ChatConsole = () => {
  const {
    messages,
    isSubmitting,
    loadingTokens,
    draft,
    setDraft,
    handleSubmit,
    quickMode,
    setQuickMode,
    pendingAction,
    confirmPendingAction,
    cancelPendingAction,
    isConfirming,
  } = useChatConsole();

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);

  const adjustTextareaHeight = React.useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = 160;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (messages.length === 0) {
      container.scrollTop = container.scrollHeight;
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages]);

  React.useEffect(() => {
    adjustTextareaHeight();
  }, [draft, adjustTextareaHeight]);

  const pendingSummary = React.useMemo(() => {
    if (!pendingAction) return "";
    switch (pendingAction.kind) {
      case "swap":
        return pendingAction.summary;
      case "transfer_native":
        return `Transfer ${pendingAction.resolvedDisplay} MON to ${pendingAction.recipient}.`;
      case "transfer_token":
        return `Transfer ${pendingAction.resolvedDisplay} ${
          pendingAction.token.symbol ?? `${pendingAction.token.address.slice(0, 6)}…`
        } to ${pendingAction.recipient}.`;
      case "wrap":
        return `${pendingAction.direction === "wrap" ? "Wrap" : "Unwrap"} ${pendingAction.resolvedDisplay} ${
          pendingAction.direction === "wrap" ? "MON" : "WMON"
        }.`;
      default:
        return "";
    }
  }, [pendingAction]);

  const disableSend = isSubmitting || (!draft.trim() && !loadingTokens);

  return (
    <div className="flex w-full justify-center">
      <div className="w-full max-w-4xl">
        <h1 className="sr-only">Chat console</h1>
        <div
          data-testid="chat-shell"
          className="relative overflow-hidden rounded-[2.5rem] border border-[#846FFA]/30 bg-white/55 p-[5px] shadow-[0_35px_90px_rgba(132,111,250,0.22)] backdrop-blur-[30px] before:pointer-events-none before:absolute before:-inset-8 before:-z-10 before:rounded-[2.7rem] before:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.58)_0%,rgba(255,255,255,0.08)_64%,rgba(132,111,250,0)_85%),radial-gradient(circle_at_bottom_right,rgba(132,111,250,0.22)_18%,rgba(132,111,250,0)_74%)] before:opacity-95 before:blur-[24px] after:pointer-events-none after:absolute after:inset-0 after:rounded-[2.5rem] after:border after:border-white/20 after:opacity-70 after:bg-[radial-gradient(circle_at_center,rgba(132,111,250,0.12)_0%,rgba(132,111,250,0)_68%)] dark:border-[#846FFA]/35 dark:bg-[rgba(30,30,39,0.55)] dark:shadow-[0_40px_110px_rgba(0,0,0,0.45)] dark:before:bg-[radial-gradient(circle_at_top_left,rgba(132,111,250,0.28)_18%,rgba(132,111,250,0)_78%),radial-gradient(circle_at_bottom_right,rgba(132,111,250,0.26)_18%,rgba(132,111,250,0)_74%)] dark:after:border-white/10 dark:after:bg-[radial-gradient(circle_at_center,rgba(132,111,250,0.2)_0%,rgba(132,111,250,0)_72%)]"
        >
          <div
            className="flex flex-col rounded-[2.3rem] border border-[#846FFA]/24 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.68)_0%,rgba(255,255,255,0.5)_52%,rgba(255,255,255,0.62)_100%)] p-8 shadow-[0_20px_42px_rgba(26,26,26,0.06)] backdrop-blur-[32px] dark:border-[#846FFA]/30 dark:bg-[radial-gradient(circle_at_center,rgba(30,30,39,0.72)_0%,rgba(30,30,39,0.58)_55%,rgba(30,30,39,0.68)_100%)] dark:shadow-[0_30px_60px_rgba(0,0,0,0.55)]"
            style={{ height: "min(700px, calc(100dvh - 240px))", minHeight: "400px" }}
          >
            <div className="mb-6 flex w-full items-center justify-end gap-3">
              <div className="flex items-center gap-2 rounded-full border border-[#1A1A1A]/12 bg-white/70 px-4 py-2 text-xs font-medium text-[#5C5C5C] shadow-sm dark:border-white/10 dark:bg-[#1E1E27]/70 dark:text-[#F8F8FF]/75">
                <span className="text-[#5C5C5C] dark:text-[#F8F8FF]/80">Quick Mode</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setQuickMode((value) => !value)}
                  disabled={isSubmitting || isConfirming}
                  className={cn(
                    "h-7 rounded-full border border-[#846FFA]/30 px-3 text-xs font-semibold transition dark:border-[#846FFA]/40",
                    quickMode
                      ? "bg-gradient-to-br from-[#846FFA] to-[#674CF9] text-white shadow-[0_6px_18px_rgba(132,111,250,0.35)]"
                      : "bg-transparent text-[#846FFA] hover:bg-[#846FFA]/10 dark:hover:bg-[#846FFA]/15",
                    (isSubmitting || isConfirming) && "opacity-60",
                  )}
                >
                  {quickMode ? "On" : "Off"}
                </Button>
              </div>
              <ConnectedAccount />
              <ThemeToggle />
            </div>

            <div className="flex-1 overflow-hidden">
              <div
                ref={scrollContainerRef}
                className="flex h-full flex-col space-y-6 overflow-y-auto pr-2 scrollbar-hide"
              >
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[#1A1A1A]/12 bg-white/60 p-8 text-center text-sm text-[#5C5C5C] dark:border-white/10 dark:bg-[#1E1E27]/60 dark:text-[#E2E1FF]/70">
                    Open the Connected account menu to configure your delegation, then ask Pragma to execute swaps, transfers, wraps, or answer questions here.
                  </div>
                ) : (
                  messages.map((message) => <MessageBubble key={message.id} {...message} />)
                )}
              </div>
            </div>

            {pendingAction && (
              <div className="mt-6 rounded-[1.5rem] border border-[#846FFA]/30 bg-[#846FFA]/10 p-4 text-sm text-[#2F285F] shadow-inner dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/80 dark:text-[#DAD7FF]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-[#846FFA]">Confirmation required</p>
                    <p className="mt-1 whitespace-pre-wrap text-[#3F356F] dark:text-[#CFCBFF]">{pendingSummary}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={cancelPendingAction}
                      disabled={isConfirming}
                      className="rounded-full border border-transparent px-4 text-xs font-semibold text-[#3F356F] hover:bg-[#846FFA]/20 dark:text-[#F8F8FF] dark:hover:bg-[#846FFA]/25"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={confirmPendingAction}
                      disabled={isConfirming}
                      className="rounded-full bg-gradient-to-br from-[#846FFA] to-[#674CF9] px-4 text-xs font-semibold text-white shadow-[0_6px_18px_rgba(132,111,250,0.35)] hover:opacity-90"
                    >
                      {isConfirming ? (
                        <span className="flex items-center gap-2">
                          <Spinner className="h-3 w-3" /> Confirming…
                        </span>
                      ) : (
                        "Confirm"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
              <div className="flex items-center gap-3 rounded-[1.5rem] border border-[#846FFA]/35 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,255,255,0.75))] px-4 py-3 shadow-[0_18px_40px_rgba(89,79,200,0.12)] backdrop-blur-xl dark:border-[#7364ff]/40 dark:bg-[linear-gradient(135deg,rgba(22,20,42,0.9),rgba(11,18,35,0.92))] dark:shadow-[0_28px_60px_rgba(9,14,40,0.55)]">
                <textarea
                  ref={textareaRef}
                  placeholder={
                    loadingTokens
                      ? "Loading delegation context…"
                      : "Ask Pragma to swap, transfer, wrap, or explain capabilities. Example: swap 0.5 MON to USDC."
                  }
                  disabled={isSubmitting}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  className="flex-1 resize-none bg-transparent text-sm text-[#1A1A1A] placeholder:text-[#5C5C5C]/70 outline-none dark:text-[#F8F8FF] dark:placeholder:text-[#F8F8FF]/55"
                  rows={1}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button
                  type="submit"
                  disabled={disableSend}
                  className={cn(
                    "group inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition bg-gradient-to-br from-[#846FFA] to-[#674CF9] text-white shadow-[0_4px_12px_rgba(132,111,250,0.3)]",
                    disableSend
                      ? "cursor-not-allowed opacity-50"
                      : "hover:shadow-[0_6px_20px_rgba(132,111,250,0.35)]",
                  )}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Spinner className="h-4 w-4" /> Sending…
                    </span>
                  ) : (
                    <>
                      <span>Send</span>
                      <ArrowUpRight className="h-4 w-4 transition group-active:-rotate-45" />
                    </>
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between text-xs text-[#5C5C5C] dark:text-[#F8F8FF]/60">
                <span>Shift+Enter for a new line. Press Enter to send immediately.</span>
                {loadingTokens && (
                  <div className="flex items-center gap-2 text-[#846FFA]">
                    <Spinner className="h-3.5 w-3.5" /> Preparing delegation context…
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
