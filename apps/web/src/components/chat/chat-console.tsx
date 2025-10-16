"use client";

import * as React from "react";
import { ArrowUpRight } from "lucide-react";

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
}

const MessageBubble = ({ role, content, status = "default", logs }: MessageBubbleProps) => {
  const isUser = role === "user";
  if (isUser) {
    return (
      <div className="flex w-full justify-end">
        <div
          data-testid="user-message"
          className="inline-flex max-w-[60%] overflow-hidden rounded-2xl border border-transparent bg-gradient-to-br from-[#846FFA] to-[#674CF9] px-4 py-2 text-xs font-medium leading-relaxed text-white shadow-[0_3px_12px_rgba(0,0,0,0.1)]"
        >
          <div className="whitespace-pre-wrap break-words leading-relaxed text-left">{content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full justify-start">
      <div data-testid="system-message" className="flex w-full flex-col">
        <p
          className={cn(
            "whitespace-pre-wrap break-words text-[15px] leading-relaxed text-[#1A120F] dark:text-[#EAE9FF]",
            status === "error" && "text-[#6F1A1A] dark:text-[#F19595]",
            status === "success" && "text-emerald-700 dark:text-emerald-300",
          )}
        >
          {content}
        </p>
        {status === "loading" && <LoadingDots />}
        {logs && logs.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-[#4A403B] dark:text-[#C7C3E8]">
            {logs.map((log, index) => (
              <li key={`${log.level}-${index}`}>{log.message}</li>
            ))}
          </ul>
        )}
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
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);

  const adjustTextareaHeight = React.useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = 160; // ~8 lines at 20px each
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
                    (isSubmitting || isConfirming) && "opacity-60"
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

            <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
              <div
                className="group flex items-center gap-3 rounded-full border border-[#1A1A1A]/12 bg-gradient-to-br from-white/45 via-[#ECEBF2]/80 to-white/30 px-4 py-2.5 shadow-[0_4px_16px_rgba(26,26,26,0.06)] backdrop-blur-xl transition focus-within:ring-2 focus-within:ring-[#846FFA]/35 dark:border-white/12 dark:bg-gradient-to-br dark:from-[#1E1E27]/75 dark:via-[#1E1E27]/65 dark:to-[#1E1E27]/55 dark:shadow-[0_8px_28px_rgba(0,0,0,0.45)] dark:focus-within:ring-[#846FFA]/45"
                onClick={() => inputRef.current?.focus()}
              >
                <textarea
                  ref={(node) => {
                    inputRef.current = node;
                    textareaRef.current = node;
                  }}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
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
                  className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-[#1A1A1A] placeholder:text-[#5C5C5C]/70 outline-none dark:text-[#F8F8FF] dark:placeholder:text-[#F8F8FF]/55"
                  rows={1}
                />
                <button
                  type="submit"
                  disabled={disableSend}
                  className={cn(
                    "group inline-flex shrink-0 items-center gap-1.5 rounded-full px-5 py-2 text-xs font-semibold transition bg-gradient-to-br from-[#846FFA] to-[#674CF9] text-white",
                    disableSend
                      ? "cursor-not-allowed opacity-50"
                      : "shadow-[0_4px_12px_rgba(132,111,250,0.3)] hover:shadow-[0_6px_20px_rgba(132,111,250,0.35)]",
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
