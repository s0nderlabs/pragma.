import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { AllowedToken } from "../../monorail/tokens.js";
import { emitProgress } from "../progress/emitter.js";

export const listVerifiedTokensTool = tool(
  async (_input, config) => {
    // Generate tool signature for progress routing
    const toolSignature = 'listVerifiedTokens';
    emitProgress("Loading verified tokens...", "listVerifiedTokens", toolSignature, "Listing Tokens");

    const allowedTokens = (config?.configurable?.allowedTokens as AllowedToken[]) || [];

    const verifiedTokens = allowedTokens.filter(
      (t) => t.categories?.includes("verified")
    );

    if (verifiedTokens.length === 0) {
      return "No verified tokens found. This might be a configuration issue.";
    }

    // Categorize tokens
    const categorized = {
      native: [] as AllowedToken[],
      stable: [] as AllowedToken[],
      lst: [] as AllowedToken[],
      ecosystem: [] as AllowedToken[],
      bridged: [] as AllowedToken[],
      meme: [] as AllowedToken[],
      synthetic: [] as AllowedToken[],
      other: [] as AllowedToken[]
    };

    for (const token of verifiedTokens) {
      if (token.kind === "native" || token.kind === "wrappedNative") {
        categorized.native.push(token);
      }
      if (token.categories?.includes("stable")) {
        categorized.stable.push(token);
      }
      if (token.categories?.includes("lst")) {
        categorized.lst.push(token);
      }
      if (token.categories?.includes("ecosystem")) {
        categorized.ecosystem.push(token);
      }
      if (token.categories?.includes("bridged")) {
        categorized.bridged.push(token);
      }
      if (token.categories?.includes("meme")) {
        categorized.meme.push(token);
      }
      if (token.categories?.includes("synthetic")) {
        categorized.synthetic.push(token);
      }

      // Check if token wasn't categorized
      const isCategorized =
        (token.kind === "native" || token.kind === "wrappedNative") ||
        token.categories?.some((c: string) => ["stable", "lst", "ecosystem", "bridged", "meme", "synthetic"].includes(c));

      if (!isCategorized) {
        categorized.other.push(token);
      }
    }

    // Format output
    let output = `**Verified Tokens on Monad (${verifiedTokens.length} tokens):**\n\n`;

    if (categorized.native.length > 0) {
      output += `**Native & Wrapped:**\n`;
      categorized.native.forEach(t => {
        output += `• ${t.symbol}${t.name ? ` (${t.name})` : ""}\n`;
      });
      output += "\n";
    }

    if (categorized.stable.length > 0) {
      output += `**Stablecoins:**\n`;
      categorized.stable.forEach(t => {
        output += `• ${t.symbol}${t.name ? ` (${t.name})` : ""}\n`;
      });
      output += "\n";
    }

    if (categorized.lst.length > 0) {
      output += `**Liquid Staking Tokens (LST):**\n`;
      categorized.lst.forEach(t => {
        output += `• ${t.symbol}${t.name ? ` (${t.name})` : ""}\n`;
      });
      output += "\n";
    }

    if (categorized.ecosystem.length > 0) {
      output += `**Ecosystem Tokens:**\n`;
      categorized.ecosystem.forEach(t => {
        output += `• ${t.symbol}${t.name ? ` (${t.name})` : ""}\n`;
      });
      output += "\n";
    }

    if (categorized.bridged.length > 0) {
      output += `**Bridged Assets:**\n`;
      categorized.bridged.forEach(t => {
        output += `• ${t.symbol}${t.name ? ` (${t.name})` : ""}\n`;
      });
      output += "\n";
    }

    if (categorized.synthetic.length > 0) {
      output += `**Synthetic Assets:**\n`;
      categorized.synthetic.forEach(t => {
        output += `• ${t.symbol}${t.name ? ` (${t.name})` : ""}\n`;
      });
      output += "\n";
    }

    if (categorized.meme.length > 0) {
      output += `**Meme Tokens:**\n`;
      categorized.meme.forEach(t => {
        output += `• ${t.symbol}${t.name ? ` (${t.name})` : ""}\n`;
      });
      output += "\n";
    }

    if (categorized.other.length > 0) {
      output += `**Other Tokens:**\n`;
      categorized.other.forEach(t => {
        output += `• ${t.symbol}${t.name ? ` (${t.name})` : ""}\n`;
      });
      output += "\n";
    }

    output += `You can swap, transfer, wrap, or unwrap any of these tokens.`;

    return output;
  },
  {
    name: "listVerifiedTokens",
    description: "List all verified tokens on Monad with symbols, names, addresses, decimals, categories. Use for 'what tokens are available', 'supported tokens', 'what can I swap'.",
    schema: z.object({}),
  }
);
