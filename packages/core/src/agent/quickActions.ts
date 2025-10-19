import type { AgentInsightResult } from "./types.js";

const HELP_MESSAGE = `I can help you:
- Swap tokens that are authorised in your delegation.
- Wrap or unwrap MON and WMON.
- Transfer MON or any allowed ERC-20.
- Show your balances, delegation scope, remaining call budget, and token allowlist.
- Surface trending Monad tokens based on Monorail data.
- Reissue or revoke delegations (ask me when you need those flows).
Let me know what you’d like to do in plain language.`;

export type QuickModeCommand = "toggle" | "status" | "enable" | "disable";

export type QuickAction =
  | { type: "balances" }
  | { type: "delegation" }
  | { type: "status" }
  | { type: "trending" }
  | { type: "help" }
  | { type: "about" }
  | { type: "builders" }
  | { type: "quick"; command: QuickModeCommand }
  | { type: "revoke" }
  | { type: "logout" };

const contains = (source: string, keywords: string[]): boolean =>
  keywords.some((keyword) => source.includes(keyword));

export const detectQuickAction = (raw: string): QuickAction | undefined => {
  if (typeof raw !== "string") {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (contains(normalized, ["balance", "portfolio", "net worth", "holdings"])) {
    return { type: "balances" };
  }

  if (
    contains(normalized, [
      "delegation",
      "allowlist",
      "scope",
      "limits",
      "ttl",
      "session",
    ])
  ) {
    if (
      contains(normalized, [
        "issue",
        "reissue",
        "create",
        "new",
        "renew",
        "refresh",
        "rotate",
        "reset",
        "update",
        "generate",
        "setup",
        "set up",
        "recreate",
        "redo",
      ])
    ) {
      return undefined;
    }
    return { type: "delegation" };
  }

  if (contains(normalized, ["status", "overview", "summary", "snapshot"])) {
    return { type: "status" };
  }

  if (
    contains(normalized, [
      "trending",
      "popular token",
      "hot token",
      "top token",
      "rising token",
      "featured token",
    ])
  ) {
    return { type: "trending" };
  }

  if (
    contains(normalized, [
      "help",
      "what can you do",
      "capabilities",
      "abilities",
      "how do you work",
      "command list",
    ])
  ) {
    return { type: "help" };
  }

  if (contains(normalized, ["what is pragma", "about pragma", "tell me about pragma", "pragma info"])) {
    return { type: "about" };
  }

  if (contains(normalized, ["who built", "who created", "who made pragma", "s0nderlabs", "team"])) {
    return { type: "builders" };
  }

  if (
    contains(normalized, [
      "quick mode",
      "quick toggle",
      "toggle quick",
      "/quick",
      "fast mode",
      "auto execute",
      "quick on",
      "quick off",
      "enable quick",
      "disable quick",
    ])
  ) {
    return { type: "quick", command: interpretQuickModeCommand(normalized) };
  }

  if (
    contains(normalized, [
      "revoke",
      "remove delegation",
      "invalidate delegation",
      "cancel delegation",
      "disable delegation",
    ])
  ) {
    return { type: "revoke" };
  }

  if (contains(normalized, ["logout", "log out", "sign out", "disconnect", "exit account"])) {
    return { type: "logout" };
  }

  return undefined;
};

const interpretQuickModeCommand = (normalized: string): QuickModeCommand => {
  if (
    normalized.includes(" status") ||
    normalized.includes(" quick status") ||
    normalized.includes(" quick mode status") ||
    normalized.includes("show quick") ||
    normalized.includes("is quick mode")
  ) {
    return "status";
  }

  if (
    normalized.includes(" quick on") ||
    normalized.endsWith(" quick on") ||
    normalized.includes(" quick mode on") ||
    normalized.includes("enable quick") ||
    normalized.includes("enable fast") ||
    normalized.includes("turn on quick")
  ) {
    return "enable";
  }

  if (
    normalized.includes(" quick off") ||
    normalized.includes(" quick mode off") ||
    normalized.includes("disable quick") ||
    normalized.includes("turn off quick")
  ) {
    return "disable";
  }

  return "toggle";
};

export const buildHelpInsight = (): AgentInsightResult => ({
  type: "insight",
  title: "What I can do",
  body: HELP_MESSAGE,
});

export const buildAboutInsight = (): AgentInsightResult => ({
  type: "insight",
  title: "What is pragma",
  body: `pragma is an on-chain intent engine that turns natural language into executable transactions on Monad.

How it works:
• Parse natural language
• Enforce delegation policies
• Query Monorail for routing
• Simulate and preview
• Execute via session keys

Built by: s0nderlabs, led by elpabl0.eth
More info: https://s0nderlabs.xyz`,
});

export const buildBuildersInsight = (): AgentInsightResult => ({
  type: "insight",
  title: "Who built pragma",
  body: `pragma is built by s0nderlabs, a team focused on intent-driven blockchain infrastructure.

Founder: elpabl0.eth
Mission: Making on-chain interactions feel natural through intents and delegations on Monad

Learn more: https://s0nderlabs.xyz`,
});

export const buildQuickModeStatusInsight = (enabled: boolean): AgentInsightResult => ({
  type: "insight",
  title: "Quick mode",
  body: enabled
    ? "Quick mode is currently enabled – swaps execute immediately without preview or confirmation."
    : "Quick mode is currently disabled – swaps require preview and confirmation before execution.",
});

export const buildQuickModeToggleInsight = (enabled: boolean): AgentInsightResult => ({
  type: "insight",
  title: "Quick mode updated",
  body: enabled
    ? "Quick mode enabled – swaps will execute immediately without preview or confirmation."
    : "Quick mode disabled – swap previews and confirmations restored.",
});
