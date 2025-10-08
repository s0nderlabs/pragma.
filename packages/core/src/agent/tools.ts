import { formatUnits, parseUnits } from "viem";
import type { Address } from "viem";

import type { AgentContext, AgentInsightResult } from "./types.js";
import type { DelegationContext } from "../intent/types.js";
import {
  fetchPortfolioValue,
  fetchWalletBalances,
  normalizeBalances,
  type MonorailBalancesConfig,
  type TokenBalance,
} from "../monorail/balances.js";
import {
  classifyToken,
  formatTokenLabel,
  loadMonorailTokens,
  normalizeAllowedTokensList,
  sortAllowedTokens,
  type AllowedToken,
  type LoadMonorailTokensOptions,
  type TokenAddressMetadata,
} from "../monorail/tokens.js";

const toAtomicBalance = (balance: TokenBalance): bigint => {
  const raw = balance.balance ?? "0";
  try {
    if (raw.includes(".")) {
      return parseUnits(raw, balance.decimals);
    }
    return BigInt(raw);
  } catch {
    return 0n;
  }
};

const formatBalanceLine = (balance: TokenBalance): string => {
  const amount = (() => {
    try {
      return formatUnits(toAtomicBalance(balance), balance.decimals);
    } catch {
      return balance.balance;
    }
  })();
  const symbol = balance.symbol ?? balance.address.slice(0, 6);
  const monValue = (() => {
    if (!balance.monValue) return undefined;
    const numeric = Number.parseFloat(balance.monValue);
    if (Number.isFinite(numeric)) {
      return numeric.toFixed(4);
    }
    return undefined;
  })();
  const suffix = monValue ? ` (~${monValue} MON)` : "";
  return `${symbol}: ${amount}${suffix}`;
};

const formatDelegationSummary = (delegation: DelegationContext): string[] => {
  const lines: string[] = [];
  lines.push(`Mode: ${delegation.mode}`);
  const limits: string[] = [];
  const slippageBps = delegation.defaultSlippageBps ?? (delegation.mode === "safe" ? 50 : 100);
  const deadlineMinutes =
    delegation.defaultDeadlineMinutes ?? (delegation.mode === "safe" ? 15 : 30);
  limits.push(`Default slippage ${slippageBps / 100}%`);
  limits.push(`Default deadline ${deadlineMinutes} min`);
  lines.push(`Limits: ${limits.join(", ")}`);

  const tokens = delegation.allowedTokens ?? [];
  if (tokens.length === 0) {
    lines.push("Allowed tokens: none recorded");
  } else {
    const sorted = sortAllowedTokens(tokens);
    lines.push("Allowed tokens:");
    sorted.slice(0, 10).forEach((token) => {
      lines.push(`  • ${formatTokenLabel(token)}`);
    });
    if (sorted.length > 10) {
      lines.push(`  • … and ${sorted.length - 10} more`);
    }
  }
  return lines;
};

const sumUsdValue = (balances: TokenBalance[]): number =>
  balances.reduce((accumulator, balance) => {
    const value = balance.usdValue ?? balance.usdPerToken;
    if (!value) return accumulator;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? accumulator + parsed : accumulator;
  }, 0);

const sumMonValue = (balances: TokenBalance[]): number =>
  balances.reduce((accumulator, balance) => {
    const parsed = Number.parseFloat(balance.monValue ?? "0");
    return Number.isFinite(parsed) ? accumulator + parsed : accumulator;
  }, 0);

const formatUsd = (value: number): string => {
  if (!Number.isFinite(value) || value === 0) return "0";
  if (value >= 1000) return value.toFixed(0);
  if (value >= 100) return value.toFixed(1);
  return value.toFixed(2);
};

const DEFAULT_SESSION_WARN_THRESHOLD = 100_000_000_000_000_000n; // 0.1 MON

export interface BalancesInsightOptions extends MonorailBalancesConfig {
  delegator: Address;
  mode?: string;
  nativeTokenAddress?: Address;
  nativeTokenSymbol?: string;
  sessionKey?: Address;
  lowSessionBalanceReminder?: bigint;
}

const appendTopBalances = (lines: string[], balances: TokenBalance[]) => {
  if (balances.length === 0) {
    lines.push("No token balances detected.");
    return;
  }
  lines.push("Top balances:");
  balances.slice(0, 10).forEach((balance) => {
    lines.push(`  • ${formatBalanceLine(balance)}`);
  });
  if (balances.length > 10) {
    lines.push(`  • … and ${balances.length - 10} more`);
  }
};

const findNativeBalance = (
  balances: TokenBalance[],
  nativeTokenAddress?: Address,
): bigint => {
  if (!nativeTokenAddress) return 0n;
  const match = balances.find(
    (entry) => entry.address.toLowerCase() === nativeTokenAddress.toLowerCase(),
  );
  return match ? toAtomicBalance(match) : 0n;
};

export const buildBalancesInsight = async (
  options: BalancesInsightOptions,
): Promise<AgentInsightResult> => {
  const {
    delegator,
    mode,
    nativeTokenAddress,
    nativeTokenSymbol,
    sessionKey,
    lowSessionBalanceReminder = DEFAULT_SESSION_WARN_THRESHOLD,
    ...config
  } = options;

  const [rawDelegatorBalances, delegatorPortfolio] = await Promise.all([
    fetchWalletBalances(delegator, config),
    fetchPortfolioValue(delegator, config),
  ]);

  const delegatorBalances = normalizeBalances(rawDelegatorBalances)
    .filter((entry) => toAtomicBalance(entry) > 0n)
    .sort((left, right) => {
      const leftValue = Number.parseFloat(left.monValue ?? "0");
      const rightValue = Number.parseFloat(right.monValue ?? "0");
      return (Number.isNaN(rightValue) ? 0 : rightValue) - (Number.isNaN(leftValue) ? 0 : leftValue);
    });

  const lines: string[] = [];
  lines.push(`Delegator: ${delegator}${mode ? ` (mode: ${mode})` : ""}`);
  const totalMon = Number.parseFloat(delegatorPortfolio.value ?? "0");
  const totalUsd = sumUsdValue(delegatorBalances);
  const monSummary = Number.isFinite(totalMon) && totalMon > 0 ? totalMon.toFixed(4) : "unknown";
  const usdSummary = totalUsd > 0 ? formatUsd(totalUsd) : undefined;
  lines.push(`Portfolio value: ${monSummary} MON${usdSummary ? ` (~$${usdSummary})` : ""}`);
  appendTopBalances(lines, delegatorBalances);

  if (sessionKey) {
    const rawSessionBalances = await fetchWalletBalances(sessionKey, config);
    const sessionBalances = normalizeBalances(rawSessionBalances).filter((entry) => toAtomicBalance(entry) > 0n);

    const sessionUsd = sumUsdValue(sessionBalances);
    const nativeBalance = findNativeBalance(sessionBalances, nativeTokenAddress);
    lines.push("");
    lines.push(`Session key: ${sessionKey}`);
    const sessionUsdSummary = sessionUsd > 0 ? formatUsd(sessionUsd) : undefined;
    if (sessionBalances.length > 0) {
      const sessionMon = sumMonValue(sessionBalances);
      const sessionMonSummary = sessionMon > 0 ? sessionMon.toFixed(4) : undefined;
      if (sessionMonSummary || sessionUsdSummary) {
        lines.push(
          `Session holdings: ${sessionMonSummary ? `${sessionMonSummary} MON` : "<0.0001 MON"}${
            sessionUsdSummary ? ` (~$${sessionUsdSummary})` : ""
          }`,
        );
      }
    }
    appendTopBalances(lines, sessionBalances);

    if (nativeBalance < lowSessionBalanceReminder) {
      const symbol = nativeTokenSymbol ?? "MON";
      lines.push(
        `⚠ Session key ${symbol} balance is only ${formatUnits(nativeBalance, 18)} ${symbol}. Top up to at least ${formatUnits(lowSessionBalanceReminder, 18)} ${symbol} to ensure delegated actions succeed.`,
      );
    }
  }

  return {
    type: "insight",
    title: "Portfolio overview",
    body: lines.join("\n"),
  } satisfies AgentInsightResult;
};

export const buildDelegationInsight = (
  context: AgentContext,
): AgentInsightResult => {
  const lines = formatDelegationSummary(context.delegation);
  const metadata = context.metadata ?? {};
  if (metadata.delegator) {
    lines.unshift(`Delegator: ${metadata.delegator}`);
  }
  return {
    type: "insight",
    title: "Delegation summary",
    body: lines.join("\n"),
  } satisfies AgentInsightResult;
};

export interface TrendingTokensConfig extends LoadMonorailTokensOptions {
  tokenMetadata: TokenAddressMetadata;
  limit?: number;
}

const selectTrendingCandidates = (tokens: AllowedToken[]): AllowedToken[] => {
  const interesting = tokens.filter((token) =>
    (token.categories ?? []).some((category) => {
      const normalized = category.toLowerCase();
      return normalized.includes("trending") || normalized.includes("verified") || normalized.includes("top");
    }),
  );
  if (interesting.length >= 5) return interesting;
  const fallback = tokens.filter((token) => !interesting.includes(token));
  return interesting.concat(fallback.slice(0, Math.max(0, 5 - interesting.length)));
};

export const buildTrendingTokensInsight = async (
  config: TrendingTokensConfig,
): Promise<AgentInsightResult> => {
  const rawTokens = await loadMonorailTokens(config);
  const allowed = normalizeAllowedTokensList(
    rawTokens.map((token) => classifyToken(token, config.tokenMetadata)),
  );
  const sorted = sortAllowedTokens(selectTrendingCandidates(allowed));
  const limit = config.limit ?? 5;

  const bodyLines = sorted.slice(0, limit).map((token) => `  • ${formatTokenLabel(token)}`);

  if (bodyLines.length === 0) {
    bodyLines.push("No tokens available from Monorail data API.");
  }

  return {
    type: "insight",
    title: "Trending Monad tokens",
    body: bodyLines.join("\n"),
  } satisfies AgentInsightResult;
};

export const buildAgentTools = (context: AgentContext) => ({
  delegation: () => buildDelegationInsight(context),
});
