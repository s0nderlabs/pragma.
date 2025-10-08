import { Address, getAddress } from "viem";

import {
  fetchWalletBalances as fetchWalletBalancesCore,
  fetchPortfolioValue as fetchPortfolioValueCore,
  normalizeBalances,
  normalizeTokenBalance,
  type MonorailBalancesConfig,
  type PortfolioValueResponse,
  type RawTokenBalance,
  type TokenBalance,
} from "@pragma/core";

import {
  MONORAIL_API_KEY,
  MONORAIL_DATA_API_URL,
} from "./config.js";
import type { AllowedToken } from "./monorailTokens.js";

const CONFIG: MonorailBalancesConfig = {
  dataApiUrl: MONORAIL_DATA_API_URL,
  apiKey: MONORAIL_API_KEY,
};

export type { TokenBalance, PortfolioValueResponse };

export const fetchWalletBalances = (address: string | Address): Promise<RawTokenBalance[]> =>
  fetchWalletBalancesCore(getAddress(address as Address), CONFIG);

export const fetchPortfolioValue = (address: string | Address): Promise<PortfolioValueResponse> =>
  fetchPortfolioValueCore(getAddress(address as Address), CONFIG);

export { normalizeTokenBalance, normalizeBalances };

export const formatTokenDisplay = (token: TokenBalance, includeUsd = true): string => {
  const parts = [token.symbol ?? token.name ?? token.address, token.balance];
  if (includeUsd && token.usdValue) {
    parts.push(`(~$${token.usdValue})`);
  }
  return parts.join(" ");
};

export const mapBalancesToAllowedTokens = (balances: TokenBalance[]): AllowedToken[] =>
  balances.map((balance) => ({
    address: balance.address,
    symbol: balance.symbol,
    decimals: balance.decimals,
    kind: "erc20",
    categories: balance.categories,
  }));
