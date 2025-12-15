/**
 * Get Session Key Private Key Tool
 *
 * Returns the session key private key for user export.
 * Use when user explicitly requests to see or export their session key private key.
 *
 * Security:
 * - Session key only holds ~1 MON for gas (low risk)
 * - Cannot access smart account tokens directly
 * - User owns the session key and should have full transparency
 * - Private key is ephemeral (regenerated on each login)
 *
 * Use Cases:
 * - User wants to see their session key private key
 * - User wants to import session key into MetaMask
 * - User wants to verify session key address independently
 * - User wants full transparency over session key
 */

import { tool } from "langchain";
import { z } from "zod";

import { createErrorFromCode } from "../../errors/index.js";

// ============================================================================
// Get Session Key Private Key Tool Implementation
// ============================================================================

export const getSessionKeyPrivateKeyTool = tool(
  async (_input, config) => {
    try {
      const sessionData = config?.configurable?.sessionData as any;

      if (!sessionData) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Session data not available",
        });
      }

      // Validate session data completeness
      const missingFields = [
        !sessionData.sessionKeyAddress && "sessionKeyAddress",
        !sessionData.sessionKeyPrivateKey && "sessionKeyPrivateKey",
      ].filter(Boolean);

      if (missingFields.length > 0) {
        throw createErrorFromCode("SESSION_INCOMPLETE", {
          message: `Session data is incomplete. Missing required fields: ${missingFields.join(", ")}`,
        });
      }

      // ⚠️ SECURITY FIX: Do NOT return private key in LLM response (P1 vulnerability)
      // Private keys should never be sent to OpenAI's API servers
      // Instead, return only the address and security context
      return `🔑 **Session Key Information**

**Session Key Address:** ${sessionData.sessionKeyAddress}
**Status:** Active and operational

⚠️ **SECURITY NOTICE:**

For your security, the private key is stored client-side only and is **never sent to AI servers**.

**What this session key controls:**
• Session key holds ~1 MON for gas payments only
• Cannot access your smart account tokens directly
• Can only execute delegations you explicitly sign
• Private key is ephemeral - regenerated on each login

**To access your private key securely:**
The private key is stored in your browser and can be retrieved client-side through the developer console:
1. Open browser developer tools (F12)
2. Navigate to Application → Local Storage
3. Find the session key data

**Why we don't show private keys here:**
• Private keys should never be transmitted through AI APIs
• Your security is more important than convenience
• Client-side storage keeps your keys under your control
• OpenAI's data retention policies mean transmitted keys are logged

**Session Key Security:**
• Maximum risk: ~1 MON gas funds (not your main tokens)
• Smart account assets remain protected by owner key
• Session key regenerates on logout/login
• No permanent security impact from session key exposure

Your session key is working securely for you! 🔒`;
    } catch (error) {
      throw createErrorFromCode("SESSION_KEY_EXPORT_FAILED", {
        message: `Failed to get session key private key: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "getSessionKeyPrivateKey",
    description: "Export session key private key. SECURITY: Only call when user explicitly requests. Session key only holds ~1 MON for gas, cannot access smart account tokens.",
    schema: z.object({}),
  }
);
