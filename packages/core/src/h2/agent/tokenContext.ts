/**
 * Token Context Loader
 *
 * Loads token allowlist from Monorail for use in H2 agent tools.
 */

import type { AllowedToken } from "../../monorail/tokens.js";

// ============================================================================
// Types
// ============================================================================

export interface TokenContext {
  allowedTokens: AllowedToken[];
  tokenCount: number;
}

// ============================================================================
// Token Context Loader
// ============================================================================

/**
 * Load token context for H2 agent.
 *
 * This is a minimal implementation that will be enhanced with actual
 * Monorail token loading when used in CLI/Web contexts.
 *
 * @returns Token context with allowlist
 */
export async function loadTokenContext(): Promise<TokenContext> {
  // In a real implementation, this would call buildAllowedTokens()
  // For now, return empty to avoid breaking the build
  // CLI will override this with actual token loading
  return {
    allowedTokens: [],
    tokenCount: 0,
  };
}

/**
 * Export types for use in tools
 */
export type { AllowedToken };
