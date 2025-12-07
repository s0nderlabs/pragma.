/**
 * Get NFT Details Tool
 *
 * Fetch traits and rarity for specific NFTs via OpenSea API.
 * Returns detailed attributes including rarity rank.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getAddress, type Address } from "viem";
import { emitProgress } from "../progress/emitter.js";

// ============================================================================
// Configuration
// ============================================================================

const MAX_TOKEN_IDS = 10;

// ============================================================================
// Types
// ============================================================================

interface NFTTrait {
  trait_type: string;
  value: string;
  display_type?: string;
  max_value?: string;
}

interface NFTRarity {
  rank: number;
  strategy_id?: string;
  strategy_version?: string;
}

interface NFTDetailsResponse {
  nft: {
    identifier: string;
    name?: string;
    collection: string;
    contract: string;
    traits: NFTTrait[];
    rarity?: NFTRarity;
    image_url?: string;
    display_image_url?: string;
  };
}

// ============================================================================
// Tool Schema
// ============================================================================

const getNFTDetailsSchema = z.object({
  contract: z
    .string()
    .describe(
      "NFT contract address OR collection slug. " +
        "Examples: '0x6919f8b7e312d5d7c374e679de8c728e474e1557' or 'monad-punks'. " +
        "Both formats work - the endpoint auto-resolves slugs to contract addresses."
    ),
  tokenIds: z
    .array(z.string())
    .describe("Token IDs to fetch. Max 10. Example: ['123', '456']"),
});

// ============================================================================
// Helper Functions
// ============================================================================

function formatNFTDetails(nft: NFTDetailsResponse["nft"]): string {
  const lines: string[] = [];

  // Name
  const name = nft.name || `#${nft.identifier}`;
  lines.push(`**${name}**`);

  // Rarity
  if (nft.rarity?.rank) {
    lines.push(`Rank: #${nft.rarity.rank.toLocaleString()}`);
  }

  // Traits
  if (nft.traits && nft.traits.length > 0) {
    lines.push("");
    lines.push("Traits:");
    for (const trait of nft.traits) {
      const value = trait.value || "None";
      lines.push(`• ${trait.trait_type}: ${value}`);
    }
  } else {
    lines.push("");
    lines.push("No traits available");
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Implementation
// ============================================================================

export const getNFTDetailsTool = tool(
  async (input, config) => {
    try {
      const fetchFn = (config?.configurable?.fetch as typeof fetch) || fetch;
      const origin = (config?.configurable?.origin as string) || "";

      const { contract, tokenIds } = input;

      // Validate contract address
      let checksummedAddress: Address;
      try {
        checksummedAddress = getAddress(contract);
      } catch {
        return `Error: Invalid contract address format: ${contract}`;
      }

      // Limit token IDs
      const limitedTokenIds = tokenIds.slice(0, MAX_TOKEN_IDS);
      if (tokenIds.length > MAX_TOKEN_IDS) {
        // Continue with limited set, don't error
      }

      // Emit progress - signature MUST match browserAgentRunner.ts generateSignatureFromInput
      // Format: getNFTDetails:${contract.slice(0, 10)}:${tokenIds.join(',')}
      const toolSignature = `getNFTDetails:${checksummedAddress.slice(0, 10)}:${limitedTokenIds.join(',')}`;
      const description = `Fetching details for ${limitedTokenIds.length} NFT${limitedTokenIds.length > 1 ? "s" : ""}`;
      emitProgress(description, "getNFTDetails", toolSignature, description);

      // Fetch all NFT details in parallel
      const results = await Promise.all(
        limitedTokenIds.map(async (tokenId) => {
          try {
            const params = new URLSearchParams({
              contract: checksummedAddress,
              tokenId,
            });

            const response = await fetchFn(`${origin}/api/opensea/nft?${params.toString()}`);

            if (!response.ok) {
              return { tokenId, error: `Failed to fetch NFT #${tokenId}` };
            }

            const data = (await response.json()) as NFTDetailsResponse;
            return { tokenId, data };
          } catch (error) {
            return { tokenId, error: `Error fetching NFT #${tokenId}` };
          }
        })
      );

      // Format output
      emitProgress("Formatting NFT details...", "getNFTDetails", toolSignature);

      const outputLines: string[] = [];
      let successCount = 0;

      for (const result of results) {
        if ("data" in result && result.data?.nft) {
          outputLines.push(formatNFTDetails(result.data.nft));
          outputLines.push(""); // Blank line between NFTs
          successCount++;
        } else if ("error" in result && result.error) {
          outputLines.push(`**NFT #${result.tokenId}**`);
          outputLines.push(result.error);
          outputLines.push("");
        }
      }

      if (successCount === 0) {
        return "Could not fetch details for any of the requested NFTs. Please check the contract address and token IDs.";
      }

      // Add summary if multiple NFTs
      if (limitedTokenIds.length > 1) {
        outputLines.unshift(`**NFT Details** (${successCount}/${limitedTokenIds.length} fetched)\n`);
      }

      return outputLines.join("\n").trim();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[getNFTDetailsTool] Error:", errorMessage);
      return `Error fetching NFT details: ${errorMessage}`;
    }
  },
  {
    name: "getNFTDetails",
    description: "SOURCE OF TRUTH for NFT traits and rarity. You CANNOT know NFT attributes without calling this tool. Never guess traits. Returns detailed attributes for up to 10 NFTs.",
    schema: getNFTDetailsSchema,
  }
);
