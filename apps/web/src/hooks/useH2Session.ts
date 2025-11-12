/**
 * useH2Session Hook
 *
 * Manages H2 session state in localStorage and React state.
 * Handles session data persistence and synchronization.
 */

import { useEffect, useCallback } from "react";
import { useH2ChatStore } from "@/stores/useH2ChatStore";
import { useIdentity } from "@/hooks/useIdentity";
import type { H2SessionState } from "@/lib/h2/types";

// ============================================================================
// Constants
// ============================================================================

const SESSION_STORAGE_KEY = "pragma-h2-session";

// ============================================================================
// Utilities
// ============================================================================

/**
 * Load session from localStorage
 */
function loadSessionFromStorage(): H2SessionState | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as H2SessionState;
    return parsed;
  } catch (error) {
    console.error("Failed to load session from localStorage:", error);
    return null;
  }
}

/**
 * Save session to localStorage
 */
function saveSessionToStorage(session: H2SessionState | null): void {
  if (typeof window === "undefined") return;

  try {
    if (session) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch (error) {
    console.error("Failed to save session to localStorage:", error);
  }
}

/**
 * Clear session from localStorage
 */
function clearSessionFromStorage(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear session from localStorage:", error);
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useH2Session() {
  const sessionData = useH2ChatStore((state) => state.sessionData);
  const setSessionData = useH2ChatStore((state) => state.setSessionData);
  const { status, wallet } = useIdentity();

  /**
   * Load and validate session on mount and when wallet changes
   * This prevents race condition by validating BEFORE loading into state
   */
  useEffect(() => {
    const stored = loadSessionFromStorage();

    // No stored session - nothing to do
    if (!stored) {
      return;
    }

    // User not connected - clear stale session
    if (status !== "connected" || !wallet) {
      console.log("[H2Session] User not connected, clearing stored session");
      clearSessionFromStorage();
      setSessionData(null);
      return;
    }

    // Validate session matches current wallet BEFORE loading
    if (stored.ownerAddress) {
      const currentAddress = wallet.address.toLowerCase();
      const sessionAddress = stored.ownerAddress.toLowerCase();

      if (currentAddress !== sessionAddress) {
        console.log(
          `[H2Session] Session mismatch: current=${currentAddress}, session=${sessionAddress}. Clearing.`
        );
        clearSessionFromStorage();
        setSessionData(null);
        return;
      }
    }

    // Validation passed - load session into state
    console.log("[H2Session] Valid session found, loading");
    setSessionData(stored);
  }, [status, wallet, setSessionData]);

  /**
   * Save session when it changes
   */
  useEffect(() => {
    if (sessionData) {
      saveSessionToStorage(sessionData);
    }
  }, [sessionData]);

  /**
   * Clear session when user disconnects (runtime disconnect, not page load)
   */
  useEffect(() => {
    // Only react to disconnect after initial mount
    if (status !== "connected" && sessionData) {
      console.log("[H2Session] User disconnected during session, clearing");
      setSessionData(null);
      clearSessionFromStorage();
    }
  }, [status, sessionData, setSessionData]);

  /**
   * Update session data
   */
  const updateSession = useCallback(
    (updates: Partial<H2SessionState>) => {
      setSessionData({
        ...sessionData,
        ...updates,
      } as H2SessionState);
    },
    [sessionData, setSessionData]
  );

  /**
   * Clear session
   */
  const clearSession = useCallback(() => {
    setSessionData(null);
    clearSessionFromStorage();
  }, [setSessionData]);

  /**
   * Check if session is complete (has all required fields)
   */
  const isSessionComplete = useCallback(() => {
    return !!(
      sessionData?.delegator &&
      sessionData?.sessionKeyAddress &&
      sessionData?.sessionKeyPrivateKey &&
      sessionData?.ownerAddress &&
      sessionData?.chainId
    );
  }, [sessionData]);

  /**
   * Check if user needs onboarding
   */
  const needsOnboarding = useCallback(() => {
    return !sessionData || !isSessionComplete();
  }, [sessionData, isSessionComplete]);

  return {
    // State
    sessionData,
    hasSession: !!sessionData,
    isSessionComplete: isSessionComplete(),
    needsOnboarding: needsOnboarding(),

    // Actions
    updateSession,
    clearSession,
    setSessionData,
  };
}
