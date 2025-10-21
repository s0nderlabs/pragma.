"use client";

import { useCallback, useEffect, useState } from "react";
import type { DelegationArtifact } from "@pragma/core/delegations/types";
import type { PublicClient } from "viem";
import {
  fetchDelegationCallCount,
  isCallCountError,
  type CallCountResult,
  type CallCountResponse,
} from "../lib/delegations/callCounter";

export interface UseCallCountsOptions {
  /**
   * Public client for reading blockchain state
   */
  publicClient: PublicClient | null;

  /**
   * Delegation artifact to fetch call counts for
   */
  artifact: DelegationArtifact | null;

  /**
   * Whether to automatically fetch on mount (default: true)
   */
  autoFetch?: boolean;

  /**
   * Refresh interval in milliseconds (0 = no auto refresh)
   */
  refreshInterval?: number;
}

export interface UseCallCountsReturn {
  /**
   * Call count data (null if unlimited, loading, or error)
   */
  data: CallCountResult | null;

  /**
   * Whether the delegation has unlimited calls
   */
  isUnlimited: boolean;

  /**
   * Loading state
   */
  isLoading: boolean;

  /**
   * Error message if fetch failed
   */
  error: string | null;

  /**
   * Manually refresh call counts
   */
  refresh: () => Promise<void>;
}

/**
 * React hook for fetching and managing on-chain call counts for delegations
 *
 * @example
 * ```tsx
 * const { data, isLoading, error, refresh } = useCallCounts({
 *   publicClient,
 *   artifact: delegation.artifact,
 * });
 *
 * if (isLoading) return <div>Loading...</div>;
 * if (error) return <div>Error: {error}</div>;
 * if (data) {
 *   return (
 *     <div>
 *       Used: {data.used.toString()} / {data.limit.toString()}
 *       Remaining: {data.remaining.toString()}
 *     </div>
 *   );
 * }
 * ```
 */
export const useCallCounts = ({
  publicClient,
  artifact,
  autoFetch = true,
  refreshInterval = 0,
}: UseCallCountsOptions): UseCallCountsReturn => {
  const [data, setData] = useState<CallCountResult | null>(null);
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCallCounts = useCallback(async () => {
    // Reset state
    setError(null);

    // Validate inputs
    if (!publicClient) {
      setError("Public client not available");
      return;
    }

    if (!artifact) {
      setError("Delegation artifact not provided");
      return;
    }

    // Check if unlimited calls
    if (artifact.callsUnlimited || !artifact.callLimit) {
      setIsUnlimited(true);
      setData(null);
      setIsLoading(false);
      return;
    }

    setIsUnlimited(false);
    setIsLoading(true);

    try {
      const response: CallCountResponse = await fetchDelegationCallCount(
        publicClient,
        artifact,
      );

      if (isCallCountError(response)) {
        setError(response.error);
        setData(null);
      } else {
        setData(response);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, artifact]);

  // Auto-fetch on mount or when dependencies change
  useEffect(() => {
    if (autoFetch) {
      void fetchCallCounts();
    }
  }, [autoFetch, fetchCallCounts]);

  // Auto-refresh at interval if specified
  useEffect(() => {
    if (refreshInterval > 0 && !isUnlimited) {
      const interval = setInterval(() => {
        void fetchCallCounts();
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [refreshInterval, isUnlimited, fetchCallCounts]);

  return {
    data,
    isUnlimited,
    isLoading,
    error,
    refresh: fetchCallCounts,
  };
};
