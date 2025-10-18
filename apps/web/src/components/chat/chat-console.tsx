"use client";

import * as React from "react";
import { ArrowRightLeft, ArrowUpRight, CheckCircle2, Info, AlertTriangle, Loader2, Sparkles } from "lucide-react";

import type {
  ChatMessagePresentation,
  InsightPresentation,
  SwapQuotePresentation,
  SwapReceiptPresentation,
} from "../../hooks/useChatConsole";
import { useChatConsole } from "../../hooks/useChatConsole";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { cn } from "../../lib/utils";
import { ConnectedAccount } from "../account/connected-account";
import { ThemeToggle } from "../theme-toggle";

const LoadingDots = ({ tone = "#846FFA", inline = false }: { tone?: string; inline?: boolean }) => (
  <div
    data-testid="loading-dots"
    className={cn("flex items-center gap-1.5", inline ? undefined : "mt-3")}
  >
    {[0, 120, 240].map((delay) => (
      <span
        key={delay}
        className="h-1.5 w-1.5 rounded-full animate-bounce"
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
  | { kind: "list"; items: string[]; ordered?: boolean; start?: number };

type InsightSection = {
  heading?: string;
  segments: MessageSegment[];
};

const parseMessageSegments = (content: string): MessageSegment[] => {
  const segments: MessageSegment[] = [];
  const lines = content.split("\n");
  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];
  let listType: "unordered" | "ordered" | null = null;
  let listStart = 1;

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
    segments.push({
      kind: "list",
      items: listBuffer.map((item) => item.trim()),
      ordered: listType === "ordered",
      start: listType === "ordered" ? listStart : undefined,
    });
    listBuffer = [];
    listType = null;
    listStart = 1;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed.length === 0) {
      commitParagraph();
      commitList();
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+/);
    const bulletMatch = /^•\s+/.test(trimmed);

    if (/^- /.test(trimmed) || bulletMatch) {
      if (paragraphBuffer.length > 0) {
        commitParagraph();
      }
      if (listType !== "unordered") {
        commitList();
        listType = "unordered";
      }
      listBuffer.push(trimmed.replace(/^(-|•)\s+/, ""));
      continue;
    }

    if (orderedMatch) {
      if (paragraphBuffer.length > 0) {
        commitParagraph();
      }
      const index = Number.parseInt(orderedMatch[1], 10);
      if (listType !== "ordered") {
        commitList();
        listType = "ordered";
        listStart = Number.isFinite(index) ? index : 1;
      } else if (listBuffer.length === 0) {
        listStart = Number.isFinite(index) ? index : 1;
      }
      listBuffer.push(trimmed.replace(/^\d+\.\s+/, ""));
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
      const colonIndex = segment.text.indexOf(":");
      if (colonIndex > 0 && colonIndex < 80) {
        const key = segment.text.slice(0, colonIndex).trim();
        const value = segment.text.slice(colonIndex + 1).trim();
        const normalizedKey = key.toLowerCase();
        return (
          <p key={`${keyPrefix}-paragraph-${index}`}>
            <strong>{key}:</strong>
            {value ? (
              normalizedKey === "delegator" ? (
                <>
                  {" "}
                  <span className="font-semibold text-[#2a2742] dark:text-[#EAE9FF]">{value}</span>
                </>
              ) : (
                ` ${value}`
              )
            ) : null}
          </p>
        );
      }
      return <p key={`${keyPrefix}-paragraph-${index}`}>{segment.text}</p>;
    }
    if (segment.ordered) {
      const start = Number.isFinite(segment.start) ? segment.start ?? 1 : 1;
      return (
        <ol key={`${keyPrefix}-list-${index}`} className="ml-1 space-y-1 text-[#433B51] dark:text-[#EAE9FF]">
          {segment.items.map((item, itemIndex) => (
            <li key={`${keyPrefix}-list-${index}-item-${itemIndex}`} className="flex items-start gap-2">
              <span className="font-semibold text-[#433B51] dark:text-[#EAE9FF]">{start + itemIndex}.</span>
              <span className="flex-1">{item}</span>
            </li>
          ))}
        </ol>
      );
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

const splitInlineLabels = (line: string): string[] => {
  const trimmed = line.trim();
  if (trimmed.length === 0) return [];
  if (/^[-•]/.test(trimmed)) return [trimmed];

  const extras: string[] = [];
  let working = trimmed.replace(/\((mode:\s*[^)]+)\)/gi, (_, group) => {
    const value = group.replace(/^mode:\s*/i, "").trim();
    if (value.length > 0) {
      extras.push(`Mode: ${value}`);
    }
    return "";
  });

  working = working.replace(/\s{2,}/g, " ").trim();

  const labelMatches = Array.from(working.matchAll(/(^|\s)([A-Z][A-Za-z0-9()/%+-]*(?:\s+[A-Za-z][A-Za-z0-9()/%+-]*)*):/g));

  if (labelMatches.length === 0) {
    return extras.length > 0 ? [working, "", ...extras] : [trimmed];
  }

  const parts: string[] = [];
  labelMatches.forEach((match, index) => {
    const leadingWhitespace = match[1].length;
    const label = match[2];
    const labelStart = (match.index ?? 0) + leadingWhitespace;
    const valueStart = labelStart + label.length + 1;
    const nextStart = index + 1 < labelMatches.length ? labelMatches[index + 1].index ?? working.length : working.length;
    const value = working.slice(valueStart, nextStart).trim();

    if (label.toLowerCase() === "session holdings") {
      parts.push(`${label}:`);
      if (value.length > 0) {
        parts.push(value);
      }
      return;
    }

    parts.push(value.length > 0 ? `${label}: ${value}` : `${label}:`);
  });

  const result: string[] = [];
  result.push(parts[0]);

  extras.forEach((extra) => {
    result.push("");
    result.push(extra);
  });

  for (let index = 1; index < parts.length; index += 1) {
    result.push("");
    result.push(parts[index]);
  }

  return result;
};

const buildInsightSections = (body: string): InsightSection[] => {
  const blocks = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  if (blocks.length === 0) {
    return [{ heading: undefined, segments: parseMessageSegments(body) }];
  }

  return blocks.map((block) => {
    const lines = block.split("\n");
    let heading: string | undefined;
    let detailLines = lines;

    // Only treat first line as heading if it's short (< 60 chars), contains a colon, 
    // and doesn't look like conversational text (no em-dash, no periods before colon)
    const firstLine = lines[0] || "";
    const headingMatch = firstLine.match(/^([^:]+):\s*(.*)$/);
    if (headingMatch && firstLine.length < 60 && !firstLine.includes("—") && !firstLine.includes(".")) {
      heading = headingMatch[1].trim();
      const remainder = headingMatch[2].trim();
      detailLines = [
        ...(remainder.length > 0 ? [remainder] : []),
        ...lines.slice(1),
      ];
    }
    // Also detect standalone short lines as headings (e.g., "Simple breakdown")
    else if (
      firstLine.length > 0 &&
      firstLine.length < 40 &&
      !firstLine.includes(".") &&
      !firstLine.includes("?") &&
      !firstLine.includes("!") &&
      lines.length > 1 &&
      !/^[-•\d]/.test(firstLine) // Not a list item
    ) {
      heading = firstLine.trim();
      detailLines = lines.slice(1);
    }

    const normalizedLines = detailLines.flatMap(splitInlineLabels);
    const colonRegex = /^[A-Za-z][A-Za-z0-9\s()/%+-]*:\s*/;
    const expandedLines: string[] = [];
    normalizedLines.forEach((line, index) => {
      expandedLines.push(line);
      if (line && colonRegex.test(line) && !/^[-•]/.test(line)) {
        const next = normalizedLines[index + 1];
        if (typeof next !== "undefined" && next !== "") {
          expandedLines.push("");
        }
      }
    });

    const sectionBody = expandedLines.join("\n");
    const segments = parseMessageSegments(sectionBody);

    return {
      heading,
      segments,
    };
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

const SwapQuoteNote = ({ presentation }: { presentation: SwapQuotePresentation }) => (
  <div className="flex flex-col gap-3 text-sm leading-relaxed text-[#2a2742] dark:text-[#EAE9FF]">
    <p>
      Swap <strong>{presentation.amountIn} {presentation.from.symbol}</strong> → <strong>{presentation.expectedOut} {presentation.to.symbol}</strong>.
    </p>
    <ul className="ml-5 list-disc space-y-1 marker:text-[#6f63ff] dark:marker:text-[#cfcaff]">
      <li>Minimum out: {presentation.minAmountOut} {presentation.to.symbol}</li>
      <li>Slippage: {presentation.slippage}</li>
      <li>Quote ID: {presentation.quoteId}</li>
      <li>Prepared at {new Date(presentation.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</li>
    </ul>
  </div>
);

const SwapReceiptNote = ({ presentation }: { presentation: SwapReceiptPresentation }) => (
  <div className="flex flex-col gap-3 text-sm leading-relaxed text-[#2a2742] dark:text-[#EAE9FF]">
    <p>
      Executed swap <strong>{presentation.amountIn} {presentation.from.symbol}</strong> → <strong>{presentation.amountOut} {presentation.to.symbol}</strong>.
    </p>
    <ul className="ml-5 list-disc space-y-1 marker:text-[#6f63ff] dark:marker:text-[#cfcaff]">
      <li>Minimum out: {presentation.minAmountOut} {presentation.to.symbol}</li>
      <li>Slippage: {presentation.slippageLabel}</li>
      {presentation.quoteId ? <li>Quote ID: {presentation.quoteId}</li> : null}
      {presentation.planHash ? <li>Plan hash: {presentation.planHash}</li> : null}
      <li>Executed at {new Date(presentation.executedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</li>
      {presentation.txHash ? (
        <li>
          Tx {presentation.txHash}
          {presentation.explorerUrl ? (
            <>
              {" · "}
              <a
                className="underline decoration-dotted underline-offset-2 text-[#674CF9] dark:text-[#CFCBFF]"
                href={presentation.explorerUrl}
                target="_blank"
                rel="noreferrer"
              >
                View on explorer
              </a>
            </>
          ) : null}
        </li>
      ) : null}
    </ul>
  </div>
);

type PortfolioInsightData = {
  delegator?: string;
  mode?: string;
  portfolioValue?: string;
  delegatorBalances: string[];
  delegatorEmptyNote?: string;
  sessionKey?: string;
  sessionHoldings?: string;
  sessionBalances: string[];
  sessionEmptyNote?: string;
  sessionTopUpHint?: string;
  warning?: string;
};

type DelegationInsightData = {
  delegator?: string;
  mode?: string;
  limits: string[];
  allowedTokens: string[];
};

const parsePortfolioInsight = (body: string): PortfolioInsightData => {
  const queue = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const data: PortfolioInsightData = {
    delegatorBalances: [],
    sessionBalances: [],
  };
  let inSessionSection = false;
  let collecting: "delegator" | "session" | null = null;
  const splitClauses = (text: string): string[] => {
    const clauses: string[] = [];
    const labelRegex = /([A-Za-z][A-Za-z0-9()\[\]\s/%+-]*?):/g;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = labelRegex.exec(text)) !== null) {
      const start = match.index;
      const label = match[1];

      if (start > cursor) {
        const prefix = text.slice(cursor, start).trim();
        if (prefix.length > 0) {
          clauses.push(prefix);
        }
      }

      const valueStart = labelRegex.lastIndex;
      const nextMatch = labelRegex.exec(text);
      const valueEnd =
        nextMatch && typeof nextMatch.index === "number" ? nextMatch.index : text.length;
      const value = text.slice(valueStart, valueEnd).trim();

      clauses.push(value.length > 0 ? `${label}: ${value}` : `${label}:`);

      cursor = valueEnd;

      if (nextMatch) {
        labelRegex.lastIndex = nextMatch.index;
      }
    }

    if (cursor < text.length) {
      const suffix = text.slice(cursor).trim();
      if (suffix.length > 0) {
        clauses.push(suffix);
      }
    }

    return clauses.filter((clause) => clause.length > 0);
  };

  const extractValueAndRest = (text: string) => {
    const working = text.trim();
    if (working.length === 0) {
      return { value: "", rest: "" };
    }
    const nextLabelMatch = working.match(/\s+[A-Z][A-Za-z0-9\s]+:/);
    if (nextLabelMatch && nextLabelMatch.index !== undefined) {
      return {
        value: working.slice(0, nextLabelMatch.index).trim(),
        rest: working.slice(nextLabelMatch.index).trim(),
      };
    }
    return { value: working, rest: "" };
  };

  const normalizeValue = (value: string) => {
    const clauses = splitClauses(value);
    if (clauses.length <= 1) {
      return { primary: value.trim(), spillover: [] as string[] };
    }
    const [primary, ...spill] = clauses;
    return {
      primary: primary.trim(),
      spillover: spill,
    };
  };

  const enqueueClauses = (clauses: string[]) => {
    if (clauses.length === 0) return;
    clauses
      .slice()
      .reverse()
      .forEach((clause) => queue.unshift(clause));
  };

  while (queue.length > 0) {
    const rawLine = queue.shift() ?? "";
    const line = rawLine.trim();
    if (line.length === 0) continue;

    if (line.startsWith("Delegator:")) {
      const remainder = line.slice("Delegator:".length);
      const { value, rest } = extractValueAndRest(remainder);
      const { primary, spillover } = normalizeValue(value);
      data.delegator = primary;
      enqueueClauses(spillover);
      enqueueClauses(splitClauses(rest));
      continue;
    }

    if (line.startsWith("Mode:")) {
      const { value, rest } = extractValueAndRest(line.slice("Mode:".length));
      const { primary, spillover } = normalizeValue(value);
      data.mode = primary;
      enqueueClauses(spillover);
      enqueueClauses(splitClauses(rest));
      continue;
    }

    if (line.startsWith("Portfolio value:")) {
      const { value, rest } = extractValueAndRest(line.slice("Portfolio value:".length));
      const { primary, spillover } = normalizeValue(value);
      data.portfolioValue = primary;
      enqueueClauses(spillover);
      enqueueClauses(splitClauses(rest));
      continue;
    }

    if (line.startsWith("Session key:")) {
      const { value, rest } = extractValueAndRest(line.slice("Session key:".length));
      const { primary, spillover } = normalizeValue(value);
      data.sessionKey = primary;
      inSessionSection = true;
      collecting = null;
      enqueueClauses(spillover);
      enqueueClauses(splitClauses(rest));
      continue;
    }

    if (line.startsWith("Session holdings:")) {
      const { value, rest } = extractValueAndRest(line.slice("Session holdings:".length));
      const { primary, spillover } = normalizeValue(value);
      data.sessionHoldings = primary;
      enqueueClauses(spillover);
      enqueueClauses(splitClauses(rest));
      continue;
    }

    if (line.toLowerCase().startsWith("top balances")) {
      collecting = inSessionSection ? "session" : "delegator";
      continue;
    }

    if (line.startsWith("Top up to")) {
      data.sessionTopUpHint = line;
      continue;
    }

    if (line.startsWith("No token balances detected")) {
      if (collecting === "delegator") {
        data.delegatorEmptyNote = line;
      } else if (collecting === "session") {
        data.sessionEmptyNote = line;
      }
      continue;
    }

    if (line.startsWith("⚠")) {
      data.warning = line;
      continue;
    }

    if (collecting === "delegator") {
      let entry = line;
      if (entry.startsWith("•")) entry = entry.slice(1).trim();
      if (entry.startsWith("-")) entry = entry.slice(1).trim();
      if (entry.length > 0) {
        data.delegatorBalances.push(entry);
      }
      continue;
    }

    if (collecting === "session") {
      let entry = line;
      if (entry.startsWith("•")) entry = entry.slice(1).trim();
      if (entry.startsWith("-")) entry = entry.slice(1).trim();
      if (entry.length > 0) {
        data.sessionBalances.push(entry);
      }
      continue;
    }

    // If we reached here and the line still contains labeled clauses,
    // break them up and reprocess.
    const clauses = splitClauses(line);
    if (clauses.length <= 1) {
      if (collecting === "delegator") {
        data.delegatorBalances.push(line);
      } else if (collecting === "session") {
        data.sessionBalances.push(line);
      }
      continue;
    }

    clauses
      .reverse()
      .forEach((clause) => queue.unshift(clause));
  }

  return data;
};

const parseDelegationInsight = (body: string): DelegationInsightData => {
  const lines = body.split("\n");
  const data: DelegationInsightData = {
    limits: [],
    allowedTokens: [],
  };
  let inAllowedTokens = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    if (line.startsWith("Delegator:")) {
      data.delegator = line.slice("Delegator:".length).trim();
      continue;
    }

    if (line.startsWith("Mode:")) {
      data.mode = line.slice("Mode:".length).trim();
      continue;
    }

    if (line.startsWith("Limits:")) {
      const value = line.slice("Limits:".length).trim();
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .forEach((entry) => {
          data.limits.push(entry);
        });
      continue;
    }

    if (line.startsWith("Allowed tokens:")) {
      inAllowedTokens = true;
      continue;
    }

    if (inAllowedTokens) {
      let entry = line;
      if (entry.startsWith("•")) entry = entry.slice(1).trim();
      if (entry.startsWith("-")) entry = entry.slice(1).trim();
      if (entry.length > 0) {
        data.allowedTokens.push(entry);
      }
      continue;
    }
  }

  return data;
};

const InsightList = ({
  items,
  emptyMessage,
}: {
  items: string[];
  emptyMessage?: string;
}) => {
  if (items.length === 0) {
    return emptyMessage ? <p>{emptyMessage}</p> : null;
  }
  return (
    <ul className="ml-5 list-disc space-y-1 marker:text-[#6f63ff] dark:marker:text-[#cfcaff]">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
};

const PortfolioInsightView = ({ body }: { body: string }) => {
  const data = parsePortfolioInsight(body);
  return (
    <div className="flex flex-col gap-4 text-sm leading-relaxed text-[#2a2742] dark:text-[#EAE9FF]">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          {data.delegator ? (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold tracking-[0.08em] text-[#433B51] dark:text-[#EAE9FF]/80">
                Delegator
              </span>
              <code className="select-text rounded-md bg-[#433B51]/5 px-2 py-1 font-semibold tracking-wide text-[#1c1640] dark:bg-white/5 dark:text-[#EFEFFF]">
                {data.delegator}
              </code>
            </div>
          ) : null}
          {data.mode ? (
            <p>
              <strong>Mode:</strong> {data.mode}
            </p>
          ) : null}
          {data.portfolioValue ? (
            <p>
              <strong>Portfolio value:</strong> {data.portfolioValue}
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-[#433B51] dark:text-[#EAE9FF]">Top balances:</p>
            <InsightList
              items={data.delegatorBalances}
              emptyMessage={data.delegatorEmptyNote}
            />
          </div>
        </div>
      </div>

      {data.sessionKey ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-[#433B51] dark:text-[#EAE9FF]/80">
              Session key
            </span>
            <code className="select-text rounded-md bg-[#433B51]/5 px-2 py-1 font-semibold tracking-wide text-[#1c1640] dark:bg-white/5 dark:text-[#EFEFFF]">
              {data.sessionKey}
            </code>
          </div>
          {data.sessionHoldings ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold tracking-[0.1em] text-[#433B51] dark:text-[#EAE9FF]">
                Session holdings
              </span>
              <span className="font-medium text-[#2a2742] dark:text-[#EAE9FF]">
                {data.sessionHoldings}
              </span>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-[#433B51] dark:text-[#EAE9FF]">Top balances:</p>
            <InsightList
              items={data.sessionBalances}
              emptyMessage={data.sessionEmptyNote}
            />
          </div>
          {data.sessionTopUpHint ? <p>{data.sessionTopUpHint}</p> : null}
        </div>
      ) : null}

      {data.warning ? (
        <p className="text-xs text-amber-600 dark:text-amber-300">{data.warning}</p>
      ) : null}
    </div>
  );
};

const DelegationInsightView = ({ body }: { body: string }) => {
  const data = parseDelegationInsight(body);
  return (
    <div className="flex flex-col gap-4 text-sm leading-relaxed text-[#2a2742] dark:text-[#EAE9FF]">
      <div className="flex flex-col gap-1">
        {data.delegator ? (
          <p>
            <strong>Delegator:</strong>{" "}
            <span className="font-semibold text-[#2a2742] dark:text-[#EAE9FF]">
              {data.delegator}
            </span>
          </p>
        ) : null}
        {data.mode ? (
          <p>
            <strong>Mode:</strong> {data.mode}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <p className="font-semibold text-[#433B51] dark:text-[#EAE9FF]">Limits:</p>
        {data.limits.length > 0 ? (
          <ul className="ml-5 list-disc space-y-1 marker:text-[#6f63ff] dark:marker:text-[#cfcaff]">
            {data.limits.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ul>
        ) : (
          <p>No limit details available.</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <p className="font-semibold text-[#433B51] dark:text-[#EAE9FF]">Allowed tokens:</p>
        <InsightList
          items={data.allowedTokens}
          emptyMessage="No allowed tokens recorded."
        />
      </div>
    </div>
  );
};

const AgentInsightNote = ({ presentation, content }: { presentation: InsightPresentation; content: string }) => {
  const body = (presentation.body ?? content).trim();
  const headingKey = presentation.heading.toLowerCase();

  const Heading = () => (
    <div className="flex items-center gap-2 text-sm font-semibold text-[#6f63ff] dark:text-[#cfcaff]">
      <Sparkles className="h-4 w-4" />
      <span>{presentation.heading}</span>
    </div>
  );

  if (headingKey === "portfolio overview") {
    return (
      <div className="flex flex-col gap-3">
        <Heading />
        <PortfolioInsightView body={body} />
      </div>
    );
  }

  if (headingKey === "delegation summary") {
    return (
      <div className="flex flex-col gap-3">
        <Heading />
        <DelegationInsightView body={body} />
      </div>
    );
  }

  const sections = buildInsightSections(body);

  return (
    <div className="flex flex-col gap-3">
      <Heading />
      <div className="flex flex-col gap-4 text-sm leading-relaxed text-[#2a2742] dark:text-[#EAE9FF]">
        {sections.length === 0 ? (
          <p>{body}</p>
        ) : (
          sections.map((section, index) => (
            <div key={`insight-section-${index}`} className="flex flex-col gap-2">
              {section.heading ? (
                <div className="text-sm font-semibold text-[#433B51] dark:text-[#EAE9FF]">
                  {section.heading}
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                {renderSegments(section.segments, `insight-${index}`)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const renderPresentation = (presentation: ChatMessagePresentation | undefined, rawContent: string) => {
  if (!presentation) return null;
  switch (presentation.type) {
    case "swap_quote":
      return <SwapQuoteNote presentation={presentation} />;
    case "swap_receipt":
      return <SwapReceiptNote presentation={presentation} />;
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
  const showStatus =
    status !== "loading" &&
    presentation !== undefined &&
    (presentation.type !== "insight" || status !== "default");

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
          status === "loading" ? (
            <div className="flex items-center gap-2 text-sm leading-relaxed text-[#1A120F] dark:text-[#EAE9FF]">
              <span>{content || "Thinking"}</span>
              <LoadingDots inline tone="#846FFA" />
            </div>
          ) : (
            <div className="flex flex-col gap-2 text-sm leading-relaxed text-[#1A120F] dark:text-[#EAE9FF]">
              {renderSegments(parseMessageSegments(content), "system-default")}
            </div>
          )
        )}
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
