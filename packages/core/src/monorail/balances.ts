import { Address, getAddress } from "viem";

import { createErrorFromCode } from "../errors/index.js";

export interface MonorailBalancesConfig {
  dataApiUrl: string;
  fetch?: typeof fetch;
}

export interface RawTokenBalance {
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
  address: Address;
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

const HEADERS: Record<string, string> = { "content-type": "application/json" };

const getFetchFn = (config: MonorailBalancesConfig): typeof fetch => config.fetch ?? fetch;

export const fetchWalletBalances = async (
  address: Address,
  config: MonorailBalancesConfig,
): Promise<RawTokenBalance[]> => {
  const url = new URL(`${config.dataApiUrl}/wallet/${getAddress(address)}/balances`);
  const response = await getFetchFn(config)(url.toString(), { headers: HEADERS });
  if (!response.ok) {
    const text = await response.text();
    throw createErrorFromCode("RPC_UNAVAILABLE", {
      message: `Monorail balance request failed (${response.status}): ${text}`,
      context: { provider: "MonorailData" },
    });
  }
  return (await response.json()) as RawTokenBalance[];
};

export const fetchPortfolioValue = async (
  address: Address,
  config: MonorailBalancesConfig,
): Promise<PortfolioValueResponse> => {
  const url = new URL(`${config.dataApiUrl}/portfolio/${getAddress(address)}/value`);
  const response = await getFetchFn(config)(url.toString(), { headers: HEADERS });
  if (!response.ok) {
    const text = await response.text();
    throw createErrorFromCode("RPC_UNAVAILABLE", {
      message: `Monorail portfolio value request failed (${response.status}): ${text}`,
      context: { provider: "MonorailData" },
    });
  }
  return (await response.json()) as PortfolioValueResponse;
};

export const normalizeTokenBalance = (token: RawTokenBalance): TokenBalance => ({
  address: getAddress(token.address as Address),
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
