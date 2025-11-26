'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { formatUnits } from 'viem'
import { saveBalanceSnapshot, get24hChange } from '@/lib/balanceSnapshots'
import { authenticatedFetch } from '@/lib/api/authenticatedFetch'
import { createMonadPublicClient } from '@/lib/clients'
import type { RawTokenBalance } from '@pragma/core/monorail/balances'

/**
 * Calculate total USD value from individual token balances
 * Used as fallback when portfolio API returns stale/invalid data
 */
function calculateTotalUsdFromTokens(tokens: RawTokenBalance[]): number {
  return tokens.reduce((sum, token) => {
    try {
      // Parse balance (comes as raw string or bigint)
      let balanceNum: number;
      try {
        const balanceBigInt = BigInt(token.balance);
        balanceNum = parseFloat(formatUnits(balanceBigInt, token.decimals));
      } catch {
        balanceNum = parseFloat(token.balance);
      }

      // Get price per token
      const pricePerToken = parseFloat(token.usd_per_token || '0');

      // Only add if both values are valid and positive
      if (!isNaN(balanceNum) && !isNaN(pricePerToken) &&
          balanceNum > 0 && pricePerToken > 0) {
        return sum + (balanceNum * pricePerToken);
      }
    } catch {
      // Skip invalid tokens
    }
    return sum;
  }, 0);
}

/**
 * Validate portfolio USD value
 * Returns true if the value appears valid
 */
function isValidPortfolioValue(value: number): boolean {
  return (
    !isNaN(value) &&
    isFinite(value) &&
    value >= 0 // Portfolio can't be negative
  );
}

/**
 * Fetch MON/USD price from Monorail price API
 * Used as fallback when portfolio API returns $0.00
 */
async function fetchMonPrice(): Promise<number> {
  try {
    const response = await fetch('/api/monorail/price');
    if (!response.ok) return 0;
    const data = await response.json();
    return parseFloat(data.price || '0');
  } catch {
    return 0;
  }
}

interface WalletBalanceData {
  monBalance: string
  usdValue: number
  change24h: number
  allTokens: RawTokenBalance[]
  isLoading: boolean
  isFetching: boolean
  error: string | null
  refresh: () => void
}

/**
 * useWalletBalance Hook
 *
 * Fetches real wallet data from Monorail API with smart auto-refresh:
 * - Total portfolio USD value
 * - MON token balance
 * - Uses smart account address from sessionData
 *
 * Refresh Strategy:
 * - Active tab: Every 10 seconds
 * - Hidden tab: Every 60 seconds (battery/API efficient)
 * - On focus: Immediate refresh when user returns
 * - Manual: Expose refresh() function for immediate updates
 * - Pauses when no wallet connected
 */
export function useWalletBalance(): WalletBalanceData {
  // Read from Zustand store (shared state across all hook instances)
  const sessionData = useH2ChatStore((state) => state.sessionData)
  const isTokenReady = useH2ChatStore((state) => state.isTokenReady)
  const monBalance = useH2ChatStore((state) => state.monBalance)
  const usdValue = useH2ChatStore((state) => state.usdValue)
  const change24h = useH2ChatStore((state) => state.change24h)
  const allTokens = useH2ChatStore((state) => state.allTokens)
  const isLoading = useH2ChatStore((state) => state.isLoadingBalance)
  const isFetching = useH2ChatStore((state) => state.isFetchingBalance)
  const error = useH2ChatStore((state) => state.balanceError)

  // Store actions
  const setWalletBalance = useH2ChatStore((state) => state.setWalletBalance)
  const setBalanceLoading = useH2ChatStore((state) => state.setBalanceLoading)
  const setBalanceFetching = useH2ChatStore((state) => state.setBalanceFetching)
  const setBalanceError = useH2ChatStore((state) => state.setBalanceError)

  const [refreshInterval, setRefreshInterval] = useState(10000) // 10s default
  const mountedRef = useRef(true)

  // Create publicClient for direct RPC calls (fresh MON balance)
  const publicClient = useMemo(() => createMonadPublicClient(), [])

  // Fetch balance function (can be called manually or by polling)
  const fetchBalance = useCallback(async () => {
    // Skip if authentication token not ready (prevents race condition)
    if (!isTokenReady) {
      return
    }

    // Skip if no smart account address
    if (!sessionData?.delegator) {
      if (mountedRef.current) {
        setBalanceError('No wallet connected')
        setBalanceLoading(false)
      }
      return
    }

    // Set fetching state (different from initial loading)
    if (mountedRef.current) {
      setBalanceFetching(true)
    }

    try {
      // Fetch from Next.js API routes (authenticated with JWT + signature)
      const [portfolioResponse, balancesResponse] = await Promise.all([
        authenticatedFetch(`/api/monorail/portfolio?address=${sessionData.delegator}`),
        authenticatedFetch(`/api/monorail/balances?address=${sessionData.delegator}`),
      ])

      // Check for errors
      if (!portfolioResponse.ok) {
        throw new Error(`Portfolio API error: ${portfolioResponse.status}`)
      }
      if (!balancesResponse.ok) {
        throw new Error(`Balances API error: ${balancesResponse.status}`)
      }

      // Parse responses
      const portfolioValueRes = await portfolioResponse.json()
      const balancesRes = await balancesResponse.json()

      // Fetch MON balance directly from RPC (always fresh, never stale)
      let monBalance = '0';
      let monBalanceWei: bigint = 0n;

      try {
        monBalanceWei = await publicClient.getBalance({
          address: sessionData.delegator as `0x${string}`,
        });
        // Format to 4 decimal places for precision
        monBalance = parseFloat(formatUnits(monBalanceWei, 18)).toFixed(4);
      } catch (rpcError) {
        console.warn('[useWalletBalance] RPC balance fetch failed, falling back to Monorail:', rpcError);
        // Fallback to Monorail API data if RPC fails
        const monToken = balancesRes.find(
          (token: { symbol?: string; address: string }) =>
            token.symbol === 'MON' || token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
        );
        if (monToken) {
          try {
            monBalanceWei = BigInt(monToken.balance);
            monBalance = parseFloat(formatUnits(monBalanceWei, monToken.decimals)).toFixed(4);
          } catch {
            monBalance = parseFloat(monToken.balance).toFixed(4);
          }
        }
      }

      // Patch MON token in balancesRes with fresh RPC balance + recalculated USD
      const monTokenIndex = balancesRes.findIndex(
        (token: { symbol?: string; address: string }) =>
          token.symbol === 'MON' || token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      );

      if (monTokenIndex !== -1) {
        const monToken = balancesRes[monTokenIndex];
        const monPricePerToken = parseFloat(monToken.usd_per_token || '0');
        const monBalanceNum = parseFloat(monBalance);

        // Update MON token with fresh RPC balance and recalculated USD value
        balancesRes[monTokenIndex] = {
          ...monToken,
          balance: monBalanceWei.toString(), // Raw wei value for BalancesTab parsing
          usd_value: (monBalanceNum * monPricePerToken).toString(),
        };
      }

      // Parse USD value from portfolio API
      let usdValue = parseFloat(portfolioValueRes.value || '0');

      // Validate portfolio value - if stale/invalid, calculate manually from tokens
      if (!isValidPortfolioValue(usdValue)) {
        console.warn(
          '[useWalletBalance] Invalid portfolio value from API:',
          portfolioValueRes.value,
          '- calculating from individual tokens'
        );
        usdValue = calculateTotalUsdFromTokens(balancesRes);
      }

      // Fallback: If USD value is still 0 but MON balance exists, fetch MON price
      const monBalanceNum = parseFloat(monBalance);
      if (usdValue === 0 && monBalanceNum > 0) {
        const monPrice = await fetchMonPrice();
        if (monPrice > 0) {
          usdValue = monBalanceNum * monPrice;

          // Update MON token's usd_per_token so BalancesTab shows the price
          if (monTokenIndex !== -1) {
            balancesRes[monTokenIndex] = {
              ...balancesRes[monTokenIndex],
              usd_per_token: monPrice.toString(),
              usd_value: usdValue.toString(),
            };
          }
        }
      }

      // If MON balance exists but wasn't in API response, create synthetic entry
      // This handles stale/empty Monorail API responses while RPC has fresh balance
      if (monTokenIndex === -1 && monBalanceNum > 0) {
        const syntheticMonPrice = monBalanceNum > 0 ? usdValue / monBalanceNum : 0;
        balancesRes.push({
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          symbol: 'MON',
          name: 'Monad',
          decimals: 18,
          balance: monBalanceWei.toString(),
          usd_per_token: syntheticMonPrice.toString(),
          usd_value: usdValue.toString(),
          categories: ['verified', 'native'],
        });
      }

      // Save balance snapshot for 24h change tracking
      saveBalanceSnapshot(sessionData.delegator, usdValue)

      // Calculate 24h change from snapshots
      const change24h = get24hChange(sessionData.delegator)

      if (mountedRef.current) {
        setWalletBalance({
          monBalance,
          usdValue,
          change24h,
          allTokens: balancesRes,
        })
      }
    } catch (err) {
      console.error('[useWalletBalance] Error fetching balance:', err)
      if (mountedRef.current) {
        setBalanceError(err instanceof Error ? err.message : 'Failed to fetch balance')
      }
    }
  }, [isTokenReady, sessionData?.delegator, publicClient, setWalletBalance, setBalanceError, setBalanceFetching, setBalanceLoading])

  // Visibility detection: Adjust polling based on tab visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab hidden: slow down to 60s
        setRefreshInterval(60000)
      } else {
        // Tab visible: speed up to 10s
        setRefreshInterval(10000)
        // Immediate fetch when user returns to tab
        // (will be handled by the main polling effect)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Main polling effect
  useEffect(() => {
    // Initial fetch
    fetchBalance()

    // Auto-refresh with dynamic interval (10s active, 60s hidden)
    const pollTimer = setInterval(fetchBalance, refreshInterval)

    return () => {
      if (pollTimer) {
        clearInterval(pollTimer)
      }
    }
  }, [fetchBalance, refreshInterval])

  // Cleanup mounted ref on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  return {
    monBalance,
    usdValue,
    change24h,
    allTokens,
    isLoading,
    isFetching,
    error,
    refresh: fetchBalance,
  }
}
