import { formatUnits, parseUnits, getAddress } from "viem";
import type { Address, PublicClient } from "viem";

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
  publicClient?: PublicClient;
  allowedTokens?: AllowedToken[];
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

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type TokenSourceMeta = {
  address: Address;
  decimals: number;
  symbol?: string;
  name?: string;
  categories?: string[];
  kind?: string;
};

const applyValuations = (formattedBalance: string, monorail?: TokenBalance) => {
  const result: Pick<TokenBalance, "monValue" | "usdValue" | "usdPerToken" | "priceConfidence"> = {};
  if (!monorail) return result;

  const newAmount = Number.parseFloat(formattedBalance);
  const oldAmount = Number.parseFloat(monorail.balance ?? "0");
  const ratio = Number.isFinite(newAmount) && Number.isFinite(oldAmount) && oldAmount > 0 ? newAmount / oldAmount : undefined;

  const scaleValue = (value?: string, digits = 4) => {
    if (!value) return undefined;
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) return undefined;
    const scaled = ratio !== undefined ? numeric * ratio : numeric;
    if (!Number.isFinite(scaled)) return undefined;
    const formatted = scaled.toFixed(digits);
    return formatted.replace(/\.0+$/, "").replace(/(?<=\.\d*[1-9])0+$/, "").replace(/\.$/, "");
  };

  result.monValue = scaleValue(monorail.monValue, 4) ?? monorail.monValue ?? undefined;
  const usdPerToken = monorail.usdPerToken ? Number.parseFloat(monorail.usdPerToken) : undefined;
  const derivedUsd =
    Number.isFinite(newAmount) && Number.isFinite(usdPerToken)
      ? (usdPerToken as number) * newAmount
      : undefined;
  result.usdValue = scaleValue(monorail.usdValue, 2)
    ?? (derivedUsd !== undefined ? derivedUsd.toFixed(2) : monorail.usdValue)
    ?? undefined;
  result.usdPerToken = monorail.usdPerToken ?? undefined;
  result.priceConfidence = monorail.priceConfidence ?? undefined;
  return result;
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
    publicClient,
    allowedTokens,
    ...config
  } = options;

  const [rawDelegatorBalances, delegatorPortfolio] = await Promise.all([
    config.dataApiUrl ? fetchWalletBalances(delegator, config).catch(() => []) : Promise.resolve([]),
    config.dataApiUrl ? fetchPortfolioValue(delegator, config).catch(() => ({ value: "0" })) : Promise.resolve({ value: "0" }),
  ]);

  const monorailBalances = normalizeBalances(rawDelegatorBalances);
  const monorailLookup = new Map<string, TokenBalance>();
  monorailBalances.forEach((balance) => {
    monorailLookup.set(balance.address.toLowerCase(), balance);
  });

  const tokenSources = new Map<string, TokenSourceMeta>();

  if (allowedTokens) {
    allowedTokens.forEach((token) => {
      try {
        const address = getAddress(token.address);
        tokenSources.set(address.toLowerCase(), {
          address,
          decimals: typeof token.decimals === "number" ? token.decimals : Number(token.decimals ?? 18),
          symbol: token.symbol,
          name: token.name,
          categories: token.categories,
          kind: token.kind,
        });
      } catch {
        /* ignore malformed token addresses */
      }
    });
  }

  if (nativeTokenAddress) {
    const nativeAddress = getAddress(nativeTokenAddress);
    if (!tokenSources.has(nativeAddress.toLowerCase())) {
      tokenSources.set(nativeAddress.toLowerCase(), {
        address: nativeAddress,
        decimals: 18,
        symbol: nativeTokenSymbol ?? "MON",
        kind: "native",
      });
    }
  }

  monorailBalances.forEach((balance) => {
    const key = balance.address.toLowerCase();
    if (!tokenSources.has(key)) {
      tokenSources.set(key, {
        address: getAddress(balance.address),
        decimals: balance.decimals,
        symbol: balance.symbol,
        name: balance.name,
        categories: balance.categories,
      });
    }
  });

  const readOnChainBalances = async (owner: Address): Promise<TokenBalance[]> => {
    if (!publicClient || tokenSources.size === 0) return [];
    const results = await Promise.all(
      [...tokenSources.entries()].map(async ([key, meta]) => {
        let raw = 0n;
        try {
          raw = meta.kind === "native"
            ? await publicClient.getBalance({ address: owner })
            : ((await publicClient.readContract({
                address: meta.address,
                abi: ERC20_BALANCE_ABI,
                functionName: "balanceOf",
                args: [owner],
              })) as bigint);
        } catch {
          raw = 0n;
        }

        const decimals = Number.isFinite(meta.decimals) ? Number(meta.decimals) : 18;
        const formatted = formatUnits(raw, decimals);
        const monorail = monorailLookup.get(key);
        const valuations = applyValuations(formatted, monorail);

        return {
          meta,
          raw,
          balance: {
            address: meta.address,
            symbol: meta.symbol ?? monorail?.symbol ?? meta.address.slice(0, 6),
            name: meta.name ?? monorail?.name,
            decimals,
            balance: formatted,
            monValue: valuations.monValue,
            usdPerToken: valuations.usdPerToken,
            usdValue: valuations.usdValue,
            categories: meta.categories ?? monorail?.categories ?? [],
            priceConfidence: valuations.priceConfidence,
          } satisfies TokenBalance,
        };
      }),
    );

    return results
      .filter((entry) => entry.raw > 0n)
      .map((entry) => entry.balance)
      .sort((left, right) => {
        const leftValue = Number.parseFloat(left.monValue ?? "0");
        const rightValue = Number.parseFloat(right.monValue ?? "0");
        return (Number.isNaN(rightValue) ? 0 : rightValue) - (Number.isNaN(leftValue) ? 0 : leftValue);
      });
  };

  let delegatorBalances: TokenBalance[];
  if (publicClient) {
    delegatorBalances = await readOnChainBalances(delegator);
  } else {
    delegatorBalances = monorailBalances
      .filter((entry) => toAtomicBalance(entry) > 0n)
      .sort((left, right) => {
        const leftValue = Number.parseFloat(left.monValue ?? "0");
        const rightValue = Number.parseFloat(right.monValue ?? "0");
        return (Number.isNaN(rightValue) ? 0 : rightValue) - (Number.isNaN(leftValue) ? 0 : leftValue);
      });
  }

  const lines: string[] = [];
  lines.push(`Delegator: ${delegator}${mode ? ` (mode: ${mode})` : ""}`);
  const delegatorMonTotal = sumMonValue(delegatorBalances);
  const totalMon = delegatorMonTotal > 0 ? delegatorMonTotal : Number.parseFloat(delegatorPortfolio.value ?? "0");
  const totalUsd = sumUsdValue(delegatorBalances);
  const monSummary = totalMon > 0 ? totalMon.toFixed(4) : "unknown";
  const usdSummary = totalUsd > 0 ? formatUsd(totalUsd) : undefined;
  lines.push(`Portfolio value: ${monSummary} MON${usdSummary ? ` (~$${usdSummary})` : ""}`);
  appendTopBalances(lines, delegatorBalances);

  if (sessionKey) {
    const sessionBalances = publicClient
      ? await readOnChainBalances(sessionKey)
      : normalizeBalances(await fetchWalletBalances(sessionKey, config).catch(() => [])).filter(
          (entry) => toAtomicBalance(entry) > 0n,
        );

    const sessionUsd = sumUsdValue(sessionBalances);
    const nativeBalance = findNativeBalance(sessionBalances, nativeTokenAddress);
    const sessionMon = sumMonValue(sessionBalances);
    lines.push("");
    lines.push(`Session key: ${sessionKey}`);
    const sessionUsdSummary = sessionUsd > 0 ? formatUsd(sessionUsd) : undefined;
    if (sessionBalances.length > 0) {
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
