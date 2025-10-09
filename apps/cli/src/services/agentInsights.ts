import { getAddress } from "viem";

import {
  buildBalancesInsight,
  buildDelegationInsight,
  buildTrendingTokensInsight,
  type AgentContext,
  type AgentInsightResult,
  type RawTokenBalance,
  type RawMonorailToken,
} from "@pragma/core";

import {
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_WMON_ADDRESS,
  MONORAIL_API_KEY,
  MONORAIL_DATA_API_URL,
} from "./config.js";
import { createMonadPublicClient } from "./web3authClients.js";
import type { AllowedToken } from "./monorailTokens.js";
import { isFixtureMode, loadFixtureJson } from "../testing/fixtureRuntime.js";

interface FixtureInsightDataset {
  walletBalances?: Record<string, RawTokenBalance[]>;
  portfolioValues?: Record<string, { value: string }>;
  tokens?: RawMonorailToken[];
  trendingTokens?: RawMonorailToken[];
}

const toLowerAddress = (value: string | undefined) => value?.toLowerCase() ?? "";

const buildFixtureFetch = (dataset: FixtureInsightDataset | undefined): typeof fetch => {
  const response = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  const toUrlString = (input: RequestInfo | URL): string => {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.toString();
    if (typeof input === "object" && input !== null && "url" in input) {
      const candidate = (input as { url?: unknown }).url;
      if (typeof candidate === "string") return candidate;
    }
    return String(input);
  };

  return async (input: RequestInfo | URL) => {
    const parsed = new URL(toUrlString(input));
    const pathname = parsed.pathname.toLowerCase();

    const walletMatch = pathname.match(/\/wallet\/(0x[0-9a-f]{40})\/balances/);
    if (walletMatch) {
      const address = toLowerAddress(walletMatch[1]);
      const balances = dataset?.walletBalances?.[address] ?? [];
      return response(balances);
    }

    const portfolioMatch = pathname.match(/\/portfolio\/(0x[0-9a-f]{40})\/value/);
    if (portfolioMatch) {
      const address = toLowerAddress(portfolioMatch[1]);
      const portfolio = dataset?.portfolioValues?.[address] ?? { value: "0" };
      return response(portfolio);
    }

    if (pathname.endsWith("/tokens/category/verified")) {
      const tokens = dataset?.trendingTokens ?? dataset?.tokens ?? [];
      return response(tokens);
    }

    if (pathname.endsWith("/tokens")) {
      const tokens = dataset?.tokens ?? [];
      return response(tokens);
    }

    return response({ message: "fixture endpoint not implemented" }, 404);
  };
};

export interface BalanceInsightRequest {
  delegator: `0x${string}`;
  sessionKey?: `0x${string}`;
  mode?: string;
  allowedTokens?: AllowedToken[];
}

export const fetchBalancesInsight = async (
  request: BalanceInsightRequest,
): Promise<AgentInsightResult> => {
  if (isFixtureMode()) {
    const dataset = await loadFixtureJson<FixtureInsightDataset>("insights");
    return buildBalancesInsight({
      delegator: getAddress(request.delegator),
      sessionKey: request.sessionKey ? getAddress(request.sessionKey) : undefined,
      mode: request.mode,
      nativeTokenAddress: getAddress(MONAD_NATIVE_TOKEN_ADDRESS),
      nativeTokenSymbol: MONAD_NATIVE_TOKEN_SYMBOL,
      dataApiUrl: MONORAIL_DATA_API_URL,
      apiKey: MONORAIL_API_KEY,
      fetch: buildFixtureFetch(dataset),
      allowedTokens: request.allowedTokens,
    });
  }

  const publicClient = createMonadPublicClient();
  return buildBalancesInsight({
    delegator: getAddress(request.delegator),
    sessionKey: request.sessionKey ? getAddress(request.sessionKey) : undefined,
    mode: request.mode,
    nativeTokenAddress: getAddress(MONAD_NATIVE_TOKEN_ADDRESS),
    nativeTokenSymbol: MONAD_NATIVE_TOKEN_SYMBOL,
    dataApiUrl: MONORAIL_DATA_API_URL,
    apiKey: MONORAIL_API_KEY,
    allowedTokens: request.allowedTokens,
    publicClient,
  });
};

export const fetchDelegationInsight = (context: AgentContext): AgentInsightResult =>
  buildDelegationInsight(context);

export const fetchTrendingTokensInsight = async (): Promise<AgentInsightResult> => {
  const base = {
    dataApiUrl: MONORAIL_DATA_API_URL,
    apiKey: MONORAIL_API_KEY,
    tokenMetadata: {
      nativeTokenAddress: getAddress(MONAD_NATIVE_TOKEN_ADDRESS),
      wrappedNativeTokenAddress: getAddress(MONAD_WMON_ADDRESS),
    },
  } as const;

  if (isFixtureMode()) {
    const dataset = await loadFixtureJson<FixtureInsightDataset>("insights");
    return buildTrendingTokensInsight({ ...base, fetch: buildFixtureFetch(dataset) });
  }

  return buildTrendingTokensInsight(base);
};
