"use client";

import * as React from "react";

import { useChatConsole } from "../../hooks/useChatConsole";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { cn } from "../../lib/utils";
import { MONAD_NATIVE_TOKEN_SYMBOL, MONAD_WRAPPED_TOKEN_SYMBOL } from "../../lib/config";

const shortLabel = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

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
    command,
    setCommand,
    messages,
    availableTokens,
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
  } = useChatConsole();

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (command === "swap") {
        await submitSwap();
      } else if (command === "transfer") {
        await submitTransfer();
      } else {
        await submitWrap();
      }
    },
    [command, submitSwap, submitTransfer, submitWrap],
  );

  const commandButton = (value: typeof command, label: string) => (
    <Button
      type="button"
      variant={command === value ? "default" : "outline"}
      onClick={() => setCommand(value)}
      disabled={isSubmitting && command !== value}
    >
      {label}
    </Button>
  );

  const tokenOptions = availableTokens.map((token) => (
    <SelectItem key={token.address} value={token.address}>
      {token.symbol ?? shortLabel(token.address)}
    </SelectItem>
  ));

  const swapFormDisabled = isSubmitting || loadingTokens || availableTokens.length < 2;
  const transferFormDisabled = isSubmitting || (transferForm.type === "token" && availableTokens.length === 0);
  const wrapFormDisabled = isSubmitting;

  return (
    <Card className="mt-6 flex h-full flex-1 flex-col">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold">Chat console</CardTitle>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {commandButton("swap", "Swap")}
          {commandButton("transfer", "Transfer")}
          {commandButton("wrap", "Wrap/Unwrap")}
        </div>

        <div className="flex-1 overflow-hidden rounded-2xl border border-border/60 bg-muted/30">
          <div className="flex h-full flex-col gap-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Start by selecting a command and submitting details below.
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble key={message.id} {...message} />
              ))
            )}
          </div>
        </div>

        <form className="grid gap-4 rounded-2xl border border-border/70 bg-card/50 p-4" onSubmit={handleSubmit}>
          {command === "swap" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="swap-from">Token in</Label>
                <Select
                  value={swapForm.fromAddress}
                  onValueChange={(value) => updateSwapForm({ fromAddress: value })}
                  disabled={swapFormDisabled}
                >
                  <SelectTrigger id="swap-from">
                    <SelectValue placeholder={loadingTokens ? "Loading…" : "Select token"} />
                  </SelectTrigger>
                  <SelectContent>{tokenOptions}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="swap-to">Token out</Label>
                <Select
                  value={swapForm.toAddress}
                  onValueChange={(value) => updateSwapForm({ toAddress: value })}
                  disabled={swapFormDisabled}
                >
                  <SelectTrigger id="swap-to">
                    <SelectValue placeholder={loadingTokens ? "Loading…" : "Select token"} />
                  </SelectTrigger>
                  <SelectContent>{tokenOptions}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="swap-amount">Amount</Label>
                <Input
                  id="swap-amount"
                  type="number"
                  min={0}
                  step="any"
                  value={swapForm.amount}
                  onChange={(event) => updateSwapForm({ amount: event.target.value })}
                  disabled={swapFormDisabled}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="swap-slippage">Slippage (bps)</Label>
                <Input
                  id="swap-slippage"
                  type="number"
                  min={1}
                  max={500}
                  value={swapForm.slippageBps}
                  onChange={(event) => updateSwapForm({ slippageBps: Number(event.target.value) })}
                  disabled={swapFormDisabled}
                />
              </div>
            </div>
          ) : null}

          {command === "transfer" ? (
            <div className="grid gap-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={transferForm.type === "native" ? "default" : "outline"}
                  onClick={() => updateTransferForm({ type: "native" })}
                  disabled={isSubmitting}
                >
                  Native ({MONAD_NATIVE_TOKEN_SYMBOL})
                </Button>
                <Button
                  type="button"
                  variant={transferForm.type === "token" ? "default" : "outline"}
                  onClick={() => updateTransferForm({ type: "token" })}
                  disabled={isSubmitting}
                >
                  ERC-20 token
                </Button>
              </div>
              {transferForm.type === "token" ? (
                <div className="grid gap-2">
                  <Label htmlFor="transfer-token">Token</Label>
                  <Select
                    value={transferForm.tokenAddress}
                    onValueChange={(value) => updateTransferForm({ tokenAddress: value })}
                    disabled={transferFormDisabled}
                  >
                    <SelectTrigger id="transfer-token">
                      <SelectValue placeholder={loadingTokens ? "Loading…" : "Select token"} />
                    </SelectTrigger>
                    <SelectContent>{tokenOptions}</SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="transfer-recipient">Recipient</Label>
                <Input
                  id="transfer-recipient"
                  placeholder="0x…"
                  value={transferForm.recipient}
                  onChange={(event) => updateTransferForm({ recipient: event.target.value })}
                  disabled={transferFormDisabled}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="transfer-amount">Amount</Label>
                <Input
                  id="transfer-amount"
                  type="number"
                  min={0}
                  step="any"
                  value={transferForm.amount}
                  onChange={(event) => updateTransferForm({ amount: event.target.value })}
                  disabled={transferFormDisabled}
                />
              </div>
            </div>
          ) : null}

          {command === "wrap" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={wrapForm.direction === "wrap" ? "default" : "outline"}
                  onClick={() => updateWrapForm({ direction: "wrap" })}
                  disabled={wrapFormDisabled}
                >
                  Wrap ({MONAD_NATIVE_TOKEN_SYMBOL} → {MONAD_WRAPPED_TOKEN_SYMBOL})
                </Button>
                <Button
                  type="button"
                  variant={wrapForm.direction === "unwrap" ? "default" : "outline"}
                  onClick={() => updateWrapForm({ direction: "unwrap" })}
                  disabled={wrapFormDisabled}
                >
                  Unwrap ({MONAD_WRAPPED_TOKEN_SYMBOL} → {MONAD_NATIVE_TOKEN_SYMBOL})
                </Button>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wrap-amount">Amount</Label>
                <Input
                  id="wrap-amount"
                  type="number"
                  min={0}
                  step="any"
                  value={wrapForm.amount}
                  onChange={(event) => updateWrapForm({ amount: event.target.value })}
                  disabled={wrapFormDisabled}
                />
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {command === "swap"
                ? "Swaps use the active delegation scope and Monorail quotes."
                : command === "transfer"
                  ? "Transfers execute via your delegation session key."
                  : "Wrap/unwrap interacts with the WMON contract under your delegation."}
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="flex items-center gap-2"><Spinner className="h-4 w-4" /> Processing…</span>
              ) : command === "swap"
                ? "Execute swap"
                : command === "transfer"
                  ? "Send transfer"
                  : wrapForm.direction === "wrap"
                    ? "Wrap MON"
                    : "Unwrap WMON"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
