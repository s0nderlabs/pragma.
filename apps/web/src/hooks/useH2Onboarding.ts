/**
 * useH2Onboarding Hook
 *
 * Automatically creates H2 session after Web3Auth connection.
 * Bridges the gap between wallet connection and H2 agent readiness.
 *
 * Flow:
 * 1. Detects Web3Auth connection (wallet connected)
 * 2. Creates HybridDelegator handle (derives delegator address)
 * 3. Deploys smart account if not already deployed
 * 4. Generates or retrieves session key
 * 5. Stores complete H2 session in localStorage + Zustand
 *
 * Note: Session key funding is handled LAZILY on first transaction,
 * not during onboarding. This matches CLI behavior and avoids
 * unnecessary gas costs for inactive sessions.
 */

import { useEffect, useState } from "react";
import { useIdentity } from "./useIdentity";
import { useH2Session } from "./useH2Session";
import { useH2ChatStore } from "@/stores/useH2ChatStore";
import {
  createHybridDelegatorHandle,
  ensureHybridDelegatorDeployed,
  isSmartAccountDeployed,
} from "@/lib/onboarding/hybridDelegator";
import { useSidebarStore } from "@/stores/useSidebarStore";
import { getOrCreateSessionKey } from "@/lib/storage/session-keys";
import { loadAllowedTokens } from "@/lib/h2/tokens";
import { MONAD_CHAIN_ID } from "@/lib/config";

export function useH2Onboarding() {
  const { status, wallet } = useIdentity();
  const { sessionData, setSessionData } = useH2Session();
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only run if:
    // 1. Wallet is connected
    // 2. No existing H2 session with delegator
    // 3. Not already onboarding
    if (status !== "connected" || !wallet || sessionData?.delegator || isOnboarding) {
      return;
    }

    setIsOnboarding(true);
    setError(null);

    (async () => {
      try {
        // Step 1: Create hybrid delegator handle (derives delegator address)
        const handle = await createHybridDelegatorHandle(wallet.walletClient, wallet.address);

        // Step 2: Ensure smart account is deployed before creating session
        const isDeployed = await isSmartAccountDeployed(handle);
        if (!isDeployed) {
          // Show deploying notification
          useSidebarStore.getState().setIsDeploying(true);

          const deployResult = await ensureHybridDelegatorDeployed(handle, {
            allowDirectFallback: true,
          });

          // Hide deploying notification
          useSidebarStore.getState().setIsDeploying(false);

          if (deployResult) {
            // Show deployment success notification
            useSidebarStore.getState().setShowDeployNotification(true);
            setTimeout(() => useSidebarStore.getState().setShowDeployNotification(false), 3000);
          }
        }

        // Step 2.5: CRITICAL - Store smartAccount and bundlerClient from onboarding
        // This preserves the SAME instance used for deployment, preventing AA34 signature errors
        // when funding session key later (recreating smartAccount causes signature mismatch)
        const store = useH2ChatStore.getState();
        store.setSmartAccount(handle.smartAccount);
        store.setBundlerClient(handle.bundlerClient);

        // Step 3: Get or create session key for this delegator
        const sessionKey = getOrCreateSessionKey(handle.delegator);

        // Step 4: Create complete H2 session state
        // Note: Session key funding is handled lazily on first transaction,
        // not during onboarding. This matches CLI behavior and avoids unnecessary
        // gas costs for users who may not immediately use the session.
        const newSession = {
          delegator: handle.delegator,
          sessionKeyAddress: sessionKey.address,
          sessionKeyPrivateKey: sessionKey.privateKey,
          ownerAddress: wallet.address,
          chainId: MONAD_CHAIN_ID,
        };

        // Step 5: Store in Zustand (syncs to localStorage via useH2Session)
        setSessionData(newSession);
      } catch (err) {
        // Ensure deploying notification is hidden on error
        useSidebarStore.getState().setIsDeploying(false);
        const message = err instanceof Error ? err.message : String(err);
        console.error("[H2Onboarding] Failed to create session:", message);
        setError(message);
      } finally {
        setIsOnboarding(false);
      }
    })();
  }, [status, wallet, sessionData, isOnboarding, setSessionData]);

  /**
   * Load allowed tokens after wallet connection
   * This populates the token allowlist used by the agent for token resolution
   * Blocks chat input while loading to prevent race condition
   */
  useEffect(() => {
    const store = useH2ChatStore.getState();
    const { allowedTokens, tokensLoading } = store;

    // Validation: Match API's minimum expected tokens (51-token fallback)
    const MINIMUM_EXPECTED_TOKENS = 50;
    const isComplete = allowedTokens.length >= MINIMUM_EXPECTED_TOKENS;

    // Load if: connected + has wallet + incomplete tokens + not already loading
    // Incomplete means: token count < 50
    if (status === "connected" && wallet && !isComplete && !tokensLoading) {
      store.setTokensLoading(true);

      (async () => {
        try {
          const tokens = await loadAllowedTokens();

          // Validate tokens before storing (prevent empty array race)
          if (!tokens || tokens.length === 0) {
            console.error("[H2Onboarding] Empty token list received");
            return;
          }

          store.setAllowedTokens(tokens);
        } catch (error) {
          console.error("[H2Onboarding] Failed to load tokens:", error);
          // Don't set allowedTokens on error - keep existing (may be from localStorage)
        } finally {
          store.setTokensLoading(false);
        }
      })();
    }
  }, [status, wallet]);

  return {
    isOnboarding, // Block chat only during initial session creation
    error,
  };
}
