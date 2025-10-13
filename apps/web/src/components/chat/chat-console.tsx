"use client";

import * as React from "react";

import { useChatConsole } from "../../hooks/useChatConsole";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Spinner } from "../ui/spinner";
import { Textarea } from "../ui/textarea";
import { cn } from "../../lib/utils";

const MessageBubble = ({
  role,
  content,
  status,
  logs,
}: {
  role: "user" | "system";
  content: string;
  status?: "default" | "loading" | "success" | "error";
  logs?: { level: "info" | "success" | "warn"; message: string }[];
}) => {
  const isUser = role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[90%] rounded-2xl border px-4 py-3 text-sm shadow-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-card/80 text-foreground",
          status === "error" && "border-destructive/60 bg-destructive/10 text-destructive",
          status === "success" && !isUser && "border-emerald-500/70 bg-emerald-500/10",
        )}
      >
        <div className="whitespace-pre-wrap leading-relaxed">{content}</div>
        {status === "loading" && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="h-3 w-3" />
            Processing…
          </div>
        )}
        {logs && logs.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {logs.map((log, index) => (
              <li key={`${log.level}-${index}`}>
                <span
                  className={cn(
                    "font-medium",
                    log.level === "success" && "text-emerald-500",
                    log.level === "warn" && "text-amber-500",
                  )}
                >
                  {log.level === "info" ? "Info" : log.level === "warn" ? "Warn" : "Success"}
                </span>
                {": "}
                {log.message}
              </li>
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
        return `${pendingAction.direction === "wrap" ? "Wrap" : "Unwrap"} ${pendingAction.resolvedDisplay} ${pendingAction.direction === "wrap" ? "MON" : "WMON"}.`;
      default:
        return "";
    }
  }, [pendingAction]);

  return (
    <Card className="flex h-full w-full flex-col">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold">Chat console</CardTitle>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-4">
        <div className="flex-1 overflow-hidden rounded-2xl border border-border/60 bg-muted/30">
          <div className="flex h-full flex-col gap-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Open the Connected account menu to configure your delegation, then ask Pragma to execute swaps, transfers, wraps, or answer questions here.
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble key={message.id} {...message} />
              ))
            )}
          </div>
        </div>

        {pendingAction && (
          <div className="rounded-2xl border border-amber-400/50 bg-amber-500/10 p-4 text-sm text-foreground shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">Confirmation required</p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{pendingSummary}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={cancelPendingAction}
                  variant="ghost"
                  disabled={isConfirming}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={confirmPendingAction}
                  disabled={isConfirming}
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

        <form className="grid gap-4 rounded-2xl border border-border/70 bg-card/50 p-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={loadingTokens ? "Loading delegation context…" : "Ask Pragma to swap, transfer, wrap, or explain capabilities. Example: swap 0.5 MON to USDC."}
              className="min-h-[80px] resize-none"
              disabled={isSubmitting}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Enter natural language requests. Shift+Enter for a new line.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-2 text-xs text-muted-foreground">
              <span>Delegation-driven execution with CLI parity. Try “swap 0.1 MON to NOM” or “what tokens can I trade?”</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">Quick mode:</span>
                <Button
                  type="button"
                  size="sm"
                  variant={quickMode ? "default" : "outline"}
                  onClick={() => setQuickMode((value) => !value)}
                  disabled={isSubmitting || isConfirming}
                >
                  {quickMode ? "On" : "Off"}
                </Button>
              </div>
            </div>
            <Button type="submit" disabled={isSubmitting || (!draft.trim() && !loadingTokens)}>
              {isSubmitting ? <span className="flex items-center gap-2"><Spinner className="h-4 w-4" /> Processing…</span> : "Send"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
