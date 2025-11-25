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

    console.log("[H2Onboarding] Starting auto-onboarding for", wallet.address);
    setIsOnboarding(true);
    setError(null);

    (async () => {
      try {
        // Step 1: Create hybrid delegator handle (derives delegator address)
        const handle = await createHybridDelegatorHandle(wallet.walletClient, wallet.address);
        console.log("[H2Onboarding] Delegator address:", handle.delegator);

        // Step 2: Ensure smart account is deployed before creating session
        const isDeployed = await isSmartAccountDeployed(handle);
        if (!isDeployed) {
          console.log("[H2Onboarding] Deploying smart account...");
          const deployResult = await ensureHybridDelegatorDeployed(handle, {
            allowDirectFallback: true,
          });
          if (deployResult) {
            console.log("[H2Onboarding] Smart account deployed:", {
              userOpHash: deployResult.userOpHash,
              transactionHash: deployResult.transactionHash,
            });
          }
        } else {
          console.log("[H2Onboarding] Smart account already deployed");
        }

        // Step 2.5: CRITICAL - Store smartAccount and bundlerClient from onboarding
        // This preserves the SAME instance used for deployment, preventing AA34 signature errors
        // when funding session key later (recreating smartAccount causes signature mismatch)
        const store = useH2ChatStore.getState();
        store.setSmartAccount(handle.smartAccount);
        store.setBundlerClient(handle.bundlerClient);
        console.log("[H2Onboarding] Stored smartAccount and bundlerClient for session key funding");

        // Step 3: Get or create session key for this delegator
        const sessionKey = getOrCreateSessionKey(handle.delegator);
        console.log(
          "[H2Onboarding] Session key:",
          sessionKey.address,
          sessionKey.isNew ? "(new)" : "(existing)"
        );

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

        console.log("[H2Onboarding] Session created successfully");
      } catch (err) {
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

    console.log("[H2Onboarding] Token loading check:", {
      status,
      hasWallet: !!wallet,
      currentTokenCount: allowedTokens.length,
      minimumRequired: MINIMUM_EXPECTED_TOKENS,
      isComplete,
      tokensLoading,
      shouldLoad: status === "connected" && wallet && !isComplete && !tokensLoading,
    });

    // Load if: connected + has wallet + incomplete tokens + not already loading
    // Incomplete means: token count < 50
    if (status === "connected" && wallet && !isComplete && !tokensLoading) {
      const reason = allowedTokens.length === 0
        ? "empty"
        : `incomplete (${allowedTokens.length} < ${MINIMUM_EXPECTED_TOKENS})`;

      console.log(`[H2Onboarding] 🔄 Starting token load (reason: ${reason})...`);
      store.setTokensLoading(true);

      (async () => {
        try {
          console.log("[H2Onboarding] 📡 Calling loadAllowedTokens()...");
          const tokens = await loadAllowedTokens();
          console.log("[H2Onboarding] 📦 Received tokens from loadAllowedTokens:", {
            count: tokens?.length || 0,
            firstToken: tokens?.[0],
            sample: tokens?.slice(0, 5).map(t => t.symbol),
          });

          // Validate tokens before storing (prevent empty array race)
          if (!tokens || tokens.length === 0) {
            console.error("[H2Onboarding] ❌ Empty token list received!");
            return;
          }

          console.log("[H2Onboarding] 💾 Calling setAllowedTokens with", tokens.length, "tokens");
          store.setAllowedTokens(tokens);

          // Verify tokens were stored
          const updatedStore = useH2ChatStore.getState();
          console.log("[H2Onboarding] ✅ Tokens stored! Verification:", {
            storedCount: updatedStore.allowedTokens.length,
            meetsMinimum: updatedStore.allowedTokens.length >= MINIMUM_EXPECTED_TOKENS,
            sample: updatedStore.allowedTokens.slice(0, 5).map(t => t.symbol),
          });
        } catch (error) {
          console.error("[H2Onboarding] ❌ Failed to load tokens:", error);
          // Don't set allowedTokens on error - keep existing (may be from localStorage)
        } finally {
          store.setTokensLoading(false);
          console.log("[H2Onboarding] 🏁 Token loading complete");
        }
      })();
    }
  }, [status, wallet]);

  return {
    isOnboarding, // Block chat only during initial session creation
    error,
  };
}
