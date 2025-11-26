import { Address, getAddress, formatUnits } from "viem";

import {
  fetchWalletBalances as fetchWalletBalancesCore,
  fetchPortfolioValue as fetchPortfolioValueCore,
  normalizeBalances,
  normalizeTokenBalance,
  createReadOnlyPublicClient,
  type MonorailBalancesConfig,
  type PortfolioValueResponse,
  type RawTokenBalance,
  type TokenBalance,
} from "@pragma/core";

import {
  MONORAIL_DATA_API_URL,
  MONAD_READ_RPC_URL,
  MONAD_EXECUTION_RPC_URL,
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONAD_NATIVE_TOKEN_SYMBOL,
} from "./config.js";
import { monadChain } from "./web3authClients.js";
import type { AllowedToken } from "./monorailTokens.js";

const CONFIG: MonorailBalancesConfig = {
  dataApiUrl: MONORAIL_DATA_API_URL,
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

// Utility: Chunk array into batches
const chunkArray = <T,>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

// ERC20 balanceOf ABI
const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Fetch wallet balances using direct RPC calls (real-time, accurate)
 * Alternative to fetchWalletBalances which uses indexed Monorail API (fast but may be stale)
 */
export async function fetchWalletBalancesRPC(
  address: string | Address,
  tokens?: AllowedToken[]
): Promise<RawTokenBalance[]> {
  const checksummedAddress = getAddress(address as Address);

  // Build token list: native MON + provided tokens (or empty if none)
  const tokensMeta = (() => {
    const map = new Map<
      string,
      { address: Address; symbol?: string; decimals: number; kind?: string }
    >();

    // Always include native MON
    try {
      const nativeAddress = getAddress(MONAD_NATIVE_TOKEN_ADDRESS);
      map.set(nativeAddress.toLowerCase(), {
        address: nativeAddress,
        symbol: MONAD_NATIVE_TOKEN_SYMBOL,
        decimals: 18,
        kind: "native",
      });
    } catch {
      // ignore invalid native token address
    }

    // Add provided tokens
    if (tokens) {
      tokens.forEach((token) => {
        if (!token?.address) return;
        try {
          const tokenAddress = getAddress(token.address as Address);
          if (map.has(tokenAddress.toLowerCase())) return;
          const decimalsCandidate =
            typeof token.decimals === "number"
              ? token.decimals
              : Number(token.decimals ?? 18);
          map.set(tokenAddress.toLowerCase(), {
            address: tokenAddress,
            symbol: token.symbol ?? undefined,
            decimals: Number.isFinite(decimalsCandidate) ? decimalsCandidate : 18,
            kind: token.kind,
          });
        } catch {
          // ignore malformed addresses
        }
      });
    }

    return Array.from(map.values());
  })();

  // Create RPC client
  const client = createReadOnlyPublicClient({
    chain: monadChain,
    readUrl: MONAD_READ_RPC_URL,
    fallbackUrl: MONAD_READ_RPC_URL === MONAD_EXECUTION_RPC_URL ? undefined : MONAD_EXECUTION_RPC_URL,
  });

  // Chunk tokens into batches of 25 to respect Ankr's batch size limit
  const chunks = chunkArray(tokensMeta, 25);
  const allBalances: RawTokenBalance[] = [];

  // Process chunks sequentially to avoid batch size errors
  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(async (meta) => {
        let raw = 0n;
        try {
          if (
            meta.kind === "native" ||
            meta.address.toLowerCase() === MONAD_NATIVE_TOKEN_ADDRESS.toLowerCase()
          ) {
            raw = await client.getBalance({ address: checksummedAddress });
          } else {
            raw = (await client.readContract({
              address: meta.address,
              abi: ERC20_BALANCE_ABI,
              functionName: "balanceOf",
              args: [checksummedAddress],
            })) as bigint;
          }
        } catch {
          raw = 0n;
        }

        // Skip zero balances
        if (raw <= 0n) {
          return null;
        }

        // Convert to Monorail format
        const decimals = Number.isFinite(meta.decimals) ? meta.decimals : 18;
        const balance = formatUnits(raw, decimals);

        return {
          address: meta.address,
          symbol: meta.symbol ?? "UNKNOWN",
          decimals,
          balance,
        } as RawTokenBalance;
      })
    );

    // Add non-null results
    chunkResults.forEach((result) => {
      if (result) allBalances.push(result);
    });
  }

  return allBalances;
}
