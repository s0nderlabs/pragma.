/**
 * Resolve Name Tool - NAD + ENS Lookup
 *
 * Standalone name resolution without executing transfers.
 * Supports both forward (name → address) and reverse (address → name) lookups.
 *
 * Example flows:
 * - User: "what is the address of salmo.nad?"
 * - Agent: calls resolveName({ name: "salmo.nad" })
 * - Agent: "salmo.nad resolves to 0x1234..."
 *
 * - User: "who owns 0x1234...?"
 * - Agent: calls resolveName({ name: "0x1234..." })
 * - Agent: "0x1234... is registered as salmo.nad"
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { type Address, type PublicClient, isAddress, getAddress } from "viem";

import { resolveName, getNameForAddress } from "../utils/nameResolution.js";
import { createErrorFromCode } from "../../errors/index.js";

// ============================================================================
// Tool Implementation
// ============================================================================

const resolveNameSchema = z.object({
  name: z
    .string()
    .describe(
      "Name to resolve: NAD name (.nad), ENS name (.eth), or 0x address for reverse lookup"
    ),
});

/**
 * Resolve NAD/ENS names to addresses and vice versa
 *
 * @example
 * // Forward resolution (name → address)
 * resolveName({ name: "salmo.nad" }) → "0x1234..."
 *
 * @example
 * // Reverse resolution (address → name)
 * resolveName({ name: "0x1234..." }) → "salmo.nad"
 */
export const resolveNameTool = tool(
  async ({ name }, config) => {
    try {
      const publicClient = config?.configurable?.publicClient as
        | PublicClient
        | undefined;

      if (!publicClient) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Public client not available for name resolution",
        });
      }

      const trimmed = name.trim();

      // Check if input is an address (reverse lookup)
      if (trimmed.startsWith("0x") && isAddress(trimmed)) {
        const address = getAddress(trimmed);
        const resolvedName = await getNameForAddress(address, publicClient);

        if (resolvedName) {
          const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`;
          return `**Reverse Lookup Result**

Address: \`${address}\`
Registered Name: **${resolvedName.name}** (${resolvedName.type.toUpperCase()})

This address is registered as ${resolvedName.name} on the ${resolvedName.type === "nad" ? "NAD Name Service (Monad)" : "ENS (Ethereum)"}.`;
        } else {
          return `**Reverse Lookup Result**

Address: \`${trimmed}\`
Registered Name: None found

This address does not have a registered NAD (.nad) or ENS (.eth) name.`;
        }
      }

      // Forward resolution (name → address)
      if (
        trimmed.toLowerCase().endsWith(".nad") ||
        trimmed.toLowerCase().endsWith(".eth")
      ) {
        const resolved = await resolveName(trimmed, publicClient);
        const serviceType =
          resolved.nameType === "nad"
            ? "NAD Name Service (Monad)"
            : "ENS (Ethereum)";

        return `**Name Resolution Result**

Name: **${resolved.originalInput}**
Address: \`${resolved.address}\`
Service: ${serviceType}

You can use "${resolved.originalInput}" for transfers instead of the full address.`;
      }

      // Invalid input
      return `**Invalid Input**

"${trimmed}" is not a valid name or address.

**Supported formats:**
- NAD names: \`name.nad\` (e.g., salmo.nad)
- ENS names: \`name.eth\` (e.g., vitalik.eth)
- Addresses: \`0x...\` (for reverse lookup)`;
    } catch (error) {
      const errorMessage = (error as Error).message;

      // Handle specific resolution errors gracefully
      if (
        errorMessage.includes("not found") ||
        errorMessage.includes("not configured")
      ) {
        return `**Name Not Found**

"${name}" could not be resolved.

This name may not be registered or configured on the name service.`;
      }

      throw createErrorFromCode("RPC_UNAVAILABLE", {
        message: `Name resolution failed: ${errorMessage}`,
        cause: error,
      });
    }
  },
  {
    name: "resolveName",
    description: "Resolve NAD (.nad) or ENS (.eth) names to addresses, or reverse lookup address to name. Use for 'what is [name] address', 'who owns 0x...'. LOOKUP only - transfer tool handles names automatically.",
    schema: resolveNameSchema,
  }
);
