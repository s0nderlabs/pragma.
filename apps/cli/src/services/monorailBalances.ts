import { getAddress } from "viem";

import { MONORAIL_DATA_API_URL, MONORAIL_API_KEY } from "./config.js";
import type { AllowedToken } from "./monorailTokens.js";

interface RawTokenBalance {
  address: string;
  symbol?: string;
  name?: string;
  decimals: number;
  balance: string;
  mon_value?: string;
  usd_per_token?: string;
  usd_value?: string;
  categories?: string[];
  pconf?: string;
}

export interface TokenBalance {
  address: `0x${string}`;
  symbol?: string;
  name?: string;
  decimals: number;
  balance: string;
  monValue?: string;
  usdPerToken?: string;
  usdValue?: string;
  categories?: string[];
  priceConfidence?: string;
}

export interface PortfolioValueResponse {
  value: string;
}

const buildHeaders = () => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (MONORAIL_API_KEY) {
    headers["x-api-key"] = MONORAIL_API_KEY;
  }
  return headers;
};

export const fetchWalletBalances = async (address: string): Promise<RawTokenBalance[]> => {
  const url = new URL(`${MONORAIL_DATA_API_URL}/wallet/${getAddress(address)}/balances`);
  const response = await fetch(url.toString(), { headers: buildHeaders() });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Monorail balance request failed (${response.status}): ${text}`);
  }
  return (await response.json()) as RawTokenBalance[];
};

export const fetchPortfolioValue = async (address: string): Promise<PortfolioValueResponse> => {
  const url = new URL(`${MONORAIL_DATA_API_URL}/portfolio/${getAddress(address)}/value`);
  const response = await fetch(url.toString(), { headers: buildHeaders() });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Monorail portfolio value request failed (${response.status}): ${text}`);
  }
  return (await response.json()) as PortfolioValueResponse;
};

export const normalizeTokenBalance = (token: RawTokenBalance): TokenBalance => ({
  address: getAddress(token.address),
  symbol: token.symbol,
  name: token.name,
  decimals: token.decimals,
  balance: token.balance,
  monValue: token.mon_value,
  usdPerToken: token.usd_per_token,
  usdValue: token.usd_value,
  categories: token.categories ?? [],
  priceConfidence: token.pconf,
});

export const normalizeBalances = (balances: RawTokenBalance[]): TokenBalance[] =>
  balances.map(normalizeTokenBalance);

export const formatTokenDisplay = (token: TokenBalance, includeUsd = true): string => {
  const parts = [token.symbol ?? token.name ?? token.address, token.balance];
  if (includeUsd && token.usdValue) {
    parts.push(`(~$${token.usdValue})`);
  }
  return parts.join(" ");
};

export const mapBalancesToAllowedTokens = (
  balances: TokenBalance[],
): AllowedToken[] =>
  balances.map((balance) => ({
    address: balance.address,
    symbol: balance.symbol,
    decimals: balance.decimals,
    kind: "erc20",
    categories: balance.categories,
  }));
