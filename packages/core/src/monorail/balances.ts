import { Address, getAddress, formatUnits } from "viem";

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
  image_uri?: string; // Monorail v2 API field for token logo
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
  logoURI?: string; // Token logo URL (mapped from image_uri)
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

/**
 * Calculate portfolio value from wallet balances
 * v2 Migration: /portfolio/{addr}/value endpoint removed, calculate client-side
 */
export const fetchPortfolioValue = async (
  address: Address,
  config: MonorailBalancesConfig,
): Promise<PortfolioValueResponse> => {
  const balances = await fetchWalletBalances(address, config);

  // Calculate total USD value from balances
  let totalValue = 0;
  for (const balance of balances) {
    const usdPerToken = parseFloat(balance.usd_per_token ?? "0");

    // Parse raw balance (wei) and format to human-readable
    let tokenBalance = 0;
    try {
      const balanceBigInt = BigInt(balance.balance ?? "0");
      tokenBalance = parseFloat(formatUnits(balanceBigInt, balance.decimals));
    } catch {
      // Fallback: if balance is already formatted, parse directly
      tokenBalance = parseFloat(balance.balance ?? "0");
    }

    if (usdPerToken > 0 && tokenBalance > 0) {
      totalValue += tokenBalance * usdPerToken;
    }
  }

  return { value: totalValue.toFixed(2) };
};

/**
 * Normalize token balance from API response
 * v2 Migration: mon_value, usd_value, pconf fields removed - calculate client-side
 */
export const normalizeTokenBalance = (token: RawTokenBalance): TokenBalance => {
  const balance = parseFloat(token.balance ?? "0");
  const usdPerToken = parseFloat(token.usd_per_token ?? "0");

  // Calculate usd_value client-side if not provided (v2 API)
  const calculatedUsdValue = balance > 0 && usdPerToken > 0
    ? (balance * usdPerToken).toFixed(6)
    : token.usd_value;

  return {
    address: getAddress(token.address as Address),
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    balance: token.balance,
    monValue: token.mon_value, // May be undefined in v2
    usdPerToken: token.usd_per_token,
    usdValue: calculatedUsdValue ?? token.usd_value,
    categories: token.categories ?? [],
    priceConfidence: token.pconf, // May be undefined in v2
    logoURI: token.image_uri, // Map image_uri to logoURI
  };
};

export const normalizeBalances = (balances: RawTokenBalance[]): TokenBalance[] =>
  balances.map(normalizeTokenBalance);
