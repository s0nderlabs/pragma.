/**
 * useSessionKeyBalance Hook
 *
 * Fetches and caches session key balance for display in Settings.
 * Uses standard viem publicClient to read balance.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { type Address, formatEther, createPublicClient, http } from "viem";
import { MONAD_RPC_URL } from "@/lib/config";
import { monadDevnet } from "@/lib/chains";

// ============================================================================
// Types
// ============================================================================

export interface SessionKeyBalanceState {
  /** Raw balance in wei */
  balance: bigint | null;
  /** Formatted balance in MON */
  balanceFormatted: string | null;
  /** Whether balance is currently being fetched */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Refetch balance */
  refetch: () => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useSessionKeyBalance(
  sessionKeyAddress?: Address
): SessionKeyBalanceState {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);

  // Create a stable publicClient instance
  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: monadDevnet,
        transport: http(MONAD_RPC_URL),
      }),
    []
  );

  /**
   * Fetch balance from chain
   * @param isInitial - Whether this is the initial fetch (shows loading state)
   */
  const fetchBalance = useCallback(async (isInitial = false) => {
    if (!sessionKeyAddress || !publicClient) {
      setBalance(null);
      setError(null);
      return;
    }

    // Only show loading state on initial fetch, not during polling
    if (isInitial || !hasFetchedOnce) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const rawBalance = await publicClient.getBalance({
        address: sessionKeyAddress,
      });
      setBalance(rawBalance);
      setHasFetchedOnce(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[useSessionKeyBalance] Failed to fetch balance:", message);
      setError("Failed to fetch balance");
      // Don't clear balance on error - keep showing previous value
    } finally {
      setIsLoading(false);
    }
  }, [sessionKeyAddress, publicClient, hasFetchedOnce]);

  /**
   * Fetch on mount and when address changes
   */
  useEffect(() => {
    setHasFetchedOnce(false);
    fetchBalance(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKeyAddress, publicClient]);

  /**
   * Set up polling interval (every 30 seconds)
   * Uses silent refresh - no loading state shown
   */
  useEffect(() => {
    if (!sessionKeyAddress || !publicClient) return;

    const interval = setInterval(() => {
      fetchBalance(false); // Silent refresh
    }, 30_000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKeyAddress, publicClient]);

  /**
   * Format balance for display
   */
  const balanceFormatted =
    balance !== null ? formatEther(balance) : null;

  return {
    balance,
    balanceFormatted,
    isLoading,
    error,
    refetch: fetchBalance,
  };
}
