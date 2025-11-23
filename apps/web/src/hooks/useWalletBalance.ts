'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { formatUnits } from 'viem'
import { saveBalanceSnapshot, get24hChange } from '@/lib/balanceSnapshots'
import type { RawTokenBalance } from '@pragma/core/monorail/balances'

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

  // Fetch balance function (can be called manually or by polling)
  const fetchBalance = useCallback(async () => {
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
      // Fetch from Next.js API routes (avoids CORS issues)
      const [portfolioResponse, balancesResponse] = await Promise.all([
        fetch(`/api/monorail/portfolio?address=${sessionData.delegator}`),
        fetch(`/api/monorail/balances?address=${sessionData.delegator}`),
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

      // Find MON token balance (native token)
      const monToken = balancesRes.find(
        (token: { symbol?: string; address: string }) =>
          token.symbol === 'MON' || token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      )

      // Format MON balance
      // Balance comes as raw string from API, need to parse carefully
      const monBalance = monToken
        ? (() => {
            try {
              // Try to parse as bigint first (raw balance)
              const balanceBigInt = BigInt(monToken.balance)
              return parseFloat(formatUnits(balanceBigInt, monToken.decimals)).toFixed(1)
            } catch {
              // If already formatted, just parse and format
              return parseFloat(monToken.balance).toFixed(1)
            }
          })()
        : '0'

      // Parse USD value
      const usdValue = parseFloat(portfolioValueRes.value || '0')

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
  }, [sessionData?.delegator, setWalletBalance, setBalanceError, setBalanceFetching, setBalanceLoading])

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
