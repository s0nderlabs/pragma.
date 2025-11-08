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

      // Return private key with comprehensive security warning
      return `🔑 **Session Key Private Key**

**Private Key:** ${sessionData.sessionKeyPrivateKey}
**Address:** ${sessionData.sessionKeyAddress}

⚠️ **SECURITY WARNING:**

**What this key controls:**
• Session key only holds ~1 MON for gas payments
• Compromise = max 1 MON loss (NOT your main tokens)
• Cannot access your smart account tokens directly
• Session key can only execute delegations you sign
• Private key is ephemeral - generated fresh on each login

**Why we share this:**
• Full transparency - you control everything
• Can import into MetaMask if needed
• Can verify session key address independently
• You own the session key, you should see the key

**Important reminders:**
• Store securely if saving (offline storage recommended)
• Treat like any private key (don't share publicly)
• Session key regenerates on logout/login (this key won't work after re-login)
• Your main tokens in smart account are NOT at risk from session key compromise

**How to use this:**
1. Copy the private key above
2. Import into MetaMask: Settings → Import Account → Private Key
3. Verify the address matches: ${sessionData.sessionKeyAddress}
4. You can now see session key transactions in MetaMask

Your session key is working for you - full transparency guaranteed! 🔓`;
    } catch (error) {
      throw createErrorFromCode("SESSION_KEY_EXPORT_FAILED", {
        message: `Failed to get session key private key: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "getSessionKeyPrivateKey",
    description: `Get session key private key for user export/verification.

**WHEN TO USE:**
Call this tool ONLY when user explicitly requests to see or export their session key private key.

**User Requests That Trigger This Tool:**
- "show my session key private key"
- "export session key"
- "give me my session key private key"
- "what is my session key private key"
- "I want to see my session key"

**What This Returns:**
- Session key private key (0x... hex string)
- Session key address (for verification)
- Comprehensive security warning
- Instructions for importing into MetaMask

**Security Context:**
- Session key only holds ~1 MON for gas (low financial risk)
- Cannot access smart account tokens (delegations required)
- User owns session key and deserves full transparency
- Private key is ephemeral (regenerates on each login)

**DO NOT call this tool unless:**
- User explicitly asks for private key export
- User confirms they want to see the private key
- You've explained what the session key is

Always include the security warning from the tool response when showing the private key.`,
    schema: z.object({}),
  }
);
