import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getAddress, type Address, erc20Abi } from "viem";
import { type AllowedToken } from "../../monorail/tokens.js";

// ERC165 Interface IDs
const ERC721_INTERFACE_ID = "0x80ac58cd";
const ERC1155_INTERFACE_ID = "0xd9b67a26";

// ERC165 ABI for supportsInterface
const supportsInterfaceAbi = [
  {
    name: "supportsInterface",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "interfaceId", type: "bytes4" }],
    outputs: [{ type: "bool" }],
  },
] as const;

// ERC721 name ABI
const erc721NameAbi = [
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

// OpenSea collection response type
interface CollectionInfoResponse {
  collection: {
    slug: string;
    name: string;
    description?: string;
    opensea_url: string;
    contracts: Array<{ address: Address; chain: string }>;
  };
  stats: {
    total_supply: number;
    total_listings: number;
    floor_price?: number;
    floor_price_symbol?: string;
  } | null;
}

/**
 * getTokenInfoTool - Get detailed information about any token (verified or unverified)
 *
 * Features:
 * - 5-tier fallback strategy: allowlist → userBalances → Monorail search → Monorail address → onchain
 * - Security warnings for unverified tokens
 * - Full contract address display (no truncation)
 * - Supports lookup by symbol or address
 */

/**
 * User balance data interface (minimal, from Monorail balances API)
 */
interface UserBalanceToken {
  address: string;
  symbol?: string;
  name?: string;
  decimals: number;
  categories?: string[];
}

const getTokenInfoSchema = z.object({
  token: z.string().describe(
    "Token symbol OR contract address to lookup. " +
    "Examples: 'USDC', 'MON', '0xf817257fed379853cDe0fa4F97AB987181B1E5Ea'"
  ),
});

type GetTokenInfoInput = z.infer<typeof getTokenInfoSchema>;

/**
 * Format verified token output
 */
function formatVerifiedToken(token: AllowedToken): string {
  const categories = token.categories?.join(", ") || "None";
  const logo = token.logoURI ? `\n**Logo:** ${token.logoURI}` : "";

  return `✅ **${token.symbol || "Unknown"}** ${token.name ? `(${token.name})` : ""}

**Contract Address:** \`${token.address}\`
**Decimals:** ${token.decimals}
**Type:** ${token.kind || "erc20"}
**Categories:** ${categories}${logo}
**Status:** VERIFIED ✅

This token is verified and safe to use on Pragma.`;
}

/**
 * Format unverified token output (from Monorail API)
 */
function formatUnverifiedToken(token: AllowedToken, isVerified: boolean): string {
  const badge = isVerified ? "✅" : "⚠️";
  const categories = token.categories?.join(", ") || "None";
  const logo = token.logoURI ? `\n**Logo:** ${token.logoURI}` : "\n**Logo:** Not available";

  const warning = isVerified ? "" : `

⚠️ **WARNING:** This token is NOT verified in Monorail's registry.
Exercise extreme caution. Always verify the contract address independently from official sources before trading.`;

  return `${badge} **${token.symbol || "Unknown"}** ${token.name ? `(${token.name})` : ""}

**Contract Address:** \`${token.address}\`
**Decimals:** ${token.decimals}
**Type:** ${token.kind || "erc20"}
**Categories:** ${categories}${logo}
**Status:** ${isVerified ? "VERIFIED ✅" : "NOT VERIFIED ⚠️"}${warning}`;
}

/**
 * Format onchain-only token output (not found in Monorail)
 */
function formatOnchainToken(data: {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}): string {
  return `⚠️ **${data.symbol}** ${data.name ? `(${data.name})` : ""}

**Contract Address:** \`${data.address}\`
**Decimals:** ${data.decimals}
**Type:** erc20 (detected onchain)
**Categories:** Not available (onchain lookup only)
**Logo:** Not available
**Status:** UNVERIFIED (NOT IN REGISTRY) ⚠️

⚠️ **EXTREME CAUTION ADVISED**
This token was NOT found in Monorail's token registry.
Basic data was fetched directly from the blockchain.

**This could be a scam token.** Always:
- Verify the contract address from official project sources
- Check token on block explorer (https://monadexplorer.com)
- Never trade significant amounts without independent verification
- Be aware that this token may be malicious or fake`;
}

/**
 * Format NFT contract output
 */
function formatNFTContract(data: {
  address: string;
  name: string;
  symbol?: string;
  standard: "ERC-721" | "ERC-1155";
  collectionSlug?: string;
  collectionName?: string;
  floorPrice?: number;
  floorPriceSymbol?: string;
  totalSupply?: number;
  totalListings?: number;
  openseaUrl?: string;
}): string {
  const lines: string[] = [
    `🖼️ **${data.collectionName || data.name}** (NFT Collection)`,
    "",
    `**Contract Address:** \`${data.address}\``,
    `**Standard:** ${data.standard}`,
  ];

  if (data.symbol) {
    lines.push(`**Symbol:** ${data.symbol}`);
  }

  if (data.collectionSlug) {
    lines.push(`**Collection Slug:** \`${data.collectionSlug}\``);
  }

  if (data.floorPrice !== undefined) {
    lines.push(`**Floor Price:** ${data.floorPrice} ${data.floorPriceSymbol || "MON"}`);
  }

  if (data.totalSupply !== undefined) {
    lines.push(`**Total Supply:** ${data.totalSupply.toLocaleString()}`);
  }

  if (data.totalListings !== undefined) {
    lines.push(`**Listed:** ${data.totalListings.toLocaleString()}`);
  }

  if (data.openseaUrl) {
    lines.push(`**OpenSea:** ${data.openseaUrl}`);
  }

  lines.push("");
  lines.push("This is an **NFT collection**, not a fungible token.");

  if (data.collectionSlug) {
    lines.push(`Use \`browseCollection\` with slug "${data.collectionSlug}" to see available NFTs.`);
  }

  return lines.join("\n");
}

/**
 * Find token in allowed tokens list (verified tokens)
 */
function findInAllowlist(
  token: string,
  allowedTokens: AllowedToken[]
): AllowedToken | undefined {
  const searchTerm = token.toLowerCase();

  // Check by address (if starts with 0x)
  if (searchTerm.startsWith("0x")) {
    try {
      const checksumAddress = getAddress(searchTerm as Address);
      return allowedTokens.find(
        (t) => t.address.toLowerCase() === checksumAddress.toLowerCase()
      );
    } catch {
      // Invalid address format, continue to symbol search
    }
  }

  // Check by symbol
  return allowedTokens.find((t) => t.symbol?.toLowerCase() === searchTerm);
}

export const getTokenInfoTool = tool(
  async (input: GetTokenInfoInput, config): Promise<string> => {
    const { token } = input;
    const allowedTokens = (config?.configurable?.allowedTokens as AllowedToken[]) || [];
    const publicClient = config?.configurable?.publicClient;
    const fetchFn = (config?.configurable?.fetch as typeof fetch) || fetch;
    const userBalances = config?.configurable?.userBalances as UserBalanceToken[] | undefined;

    const trimmed = token.trim();
    const lower = trimmed.toLowerCase();

    // =========================================================================
    // Tier 1: Check allowedTokens (verified tokens)
    // =========================================================================
    const verified = findInAllowlist(trimmed, allowedTokens);
    if (verified) {
      return formatVerifiedToken(verified);
    }

    // =========================================================================
    // Tier 2: Check user's balance data by symbol (unverified tokens user owns)
    // =========================================================================
    if (userBalances && !trimmed.startsWith("0x")) {
      const balanceMatch = userBalances.find(
        (b) => b.symbol?.toLowerCase() === lower
      );
      if (balanceMatch) {
        const tokenData: AllowedToken = {
          address: getAddress(balanceMatch.address as Address),
          symbol: balanceMatch.symbol,
          name: balanceMatch.name,
          decimals: balanceMatch.decimals,
          categories: balanceMatch.categories,
        };
        const isVerified = tokenData.categories?.includes("verified") ?? false;
        return formatUnverifiedToken(tokenData, isVerified);
      }
    }

    // =========================================================================
    // Tier 3: Search Monorail API by symbol (any token on Monad)
    // =========================================================================
    if (!trimmed.startsWith("0x")) {
      try {
        const searchResponse = await fetchFn(
          `/api/monorail/search?q=${encodeURIComponent(trimmed)}`
        );
        if (searchResponse.ok) {
          const results = await searchResponse.json() as UserBalanceToken[];
          // Find exact symbol match (case-insensitive)
          const match = results.find(
            (r) => r.symbol?.toLowerCase() === lower
          );
          if (match) {
            const tokenData: AllowedToken = {
              address: getAddress(match.address as Address),
              symbol: match.symbol,
              name: match.name,
              decimals: match.decimals,
              categories: match.categories,
            };
            const isVerified = tokenData.categories?.includes("verified") ?? false;
            return formatUnverifiedToken(tokenData, isVerified);
          }
        }
      } catch (_error) {
        // Search failed, continue to address lookup
      }
    }

    // =========================================================================
    // Tier 4: Try Monorail API via proxy by address (may have unverified tokens)
    // =========================================================================
    if (trimmed.startsWith("0x")) {
      try {
        const checksumAddress = getAddress(trimmed as Address);
        const response = await fetchFn(`/api/monorail/token?address=${checksumAddress}`);

        if (response.ok) {
          const apiToken = await response.json() as AllowedToken;

          if (apiToken) {
            const isVerified = apiToken.categories?.includes("verified") ?? false;
            return formatUnverifiedToken(apiToken, isVerified);
          }
        }
        // 404 means token not found in Monorail, continue to onchain
      } catch (_error) {
        // Proxy or API error, continue to onchain
      }
    }

    // =========================================================================
    // Tier 4.5: Detect NFT contracts (ERC721/ERC1155) before ERC20 check
    // =========================================================================
    if (trimmed.startsWith("0x") && publicClient) {
      try {
        const checksumAddress = getAddress(trimmed as Address);

        // Check ERC165 supportsInterface for ERC721 and ERC1155
        const [is721Result, is1155Result] = await Promise.allSettled([
          publicClient.readContract({
            address: checksumAddress,
            abi: supportsInterfaceAbi,
            functionName: "supportsInterface",
            args: [ERC721_INTERFACE_ID as `0x${string}`],
          }),
          publicClient.readContract({
            address: checksumAddress,
            abi: supportsInterfaceAbi,
            functionName: "supportsInterface",
            args: [ERC1155_INTERFACE_ID as `0x${string}`],
          }),
        ]);

        const is721 = is721Result.status === "fulfilled" && is721Result.value === true;
        const is1155 = is1155Result.status === "fulfilled" && is1155Result.value === true;

        if (is721 || is1155) {
          // This is an NFT contract!
          const standard = is721 ? "ERC-721" : "ERC-1155";

          // Try to get name and symbol
          let name = "Unknown NFT";
          let symbol: string | undefined;

          try {
            const [nameResult, symbolResult] = await Promise.allSettled([
              publicClient.readContract({
                address: checksumAddress,
                abi: erc721NameAbi,
                functionName: "name",
              }),
              publicClient.readContract({
                address: checksumAddress,
                abi: erc721NameAbi,
                functionName: "symbol",
              }),
            ]);

            if (nameResult.status === "fulfilled") {
              name = nameResult.value as string;
            }
            if (symbolResult.status === "fulfilled") {
              symbol = symbolResult.value as string;
            }
          } catch {
            // Name/symbol not available, continue with defaults
          }

          // Try to fetch collection info from OpenSea
          let collectionInfo: CollectionInfoResponse | null = null;
          try {
            const response = await fetchFn(`/api/opensea/collection?contract=${checksumAddress}`);
            if (response.ok) {
              collectionInfo = await response.json() as CollectionInfoResponse;
            }
          } catch {
            // OpenSea lookup failed, continue without collection info
          }

          return formatNFTContract({
            address: checksumAddress,
            name,
            symbol,
            standard,
            collectionSlug: collectionInfo?.collection?.slug,
            collectionName: collectionInfo?.collection?.name,
            floorPrice: collectionInfo?.stats?.floor_price,
            floorPriceSymbol: collectionInfo?.stats?.floor_price_symbol,
            totalSupply: collectionInfo?.stats?.total_supply,
            totalListings: collectionInfo?.stats?.total_listings,
            openseaUrl: collectionInfo?.collection?.opensea_url,
          });
        }
      } catch {
        // supportsInterface failed, contract might not support ERC165
        // Continue to ERC20 check
      }
    }

    // =========================================================================
    // Tier 5: Try onchain (ERC20 basic data)
    // =========================================================================
    if (trimmed.startsWith("0x") && publicClient) {
      try {
        const checksumAddress = getAddress(trimmed as Address);

        // Read ERC20 standard functions
        const [name, symbol, decimals] = await Promise.all([
          publicClient.readContract({
            address: checksumAddress,
            abi: erc20Abi,
            functionName: "name",
          }),
          publicClient.readContract({
            address: checksumAddress,
            abi: erc20Abi,
            functionName: "symbol",
          }),
          publicClient.readContract({
            address: checksumAddress,
            abi: erc20Abi,
            functionName: "decimals",
          }),
        ]);

        return formatOnchainToken({
          address: checksumAddress,
          name: name as string,
          symbol: symbol as string,
          decimals: decimals as number,
        });
      } catch {
        return `❌ **Contract Not Recognized**

The address \`${trimmed}\` could not be identified as a token or NFT contract.

**Possible reasons:**
- Contract does not implement ERC20, ERC721, or ERC1155 standard
- Invalid or malformed address
- Contract does not exist at this address
- Network issues or RPC errors

**Suggestion:**
- Verify the address is correct
- Check on block explorer: https://monadexplorer.com/address/${trimmed}
- If this is an NFT, try \`getCollectionInfo\` with the contract address
- Use \`listVerifiedTokens\` to see all verified tokens`;
      }
    }

    // =========================================================================
    // Not found anywhere
    // =========================================================================
    return `❌ **Token Not Found**

Token "${trimmed}" was not found in the verified token list.

**If you have a contract address:**
- Paste the full address starting with \`0x\` and I'll look it up onchain
- Example: \`0xf817257fed379853cDe0fa4F97AB987181B1E5Ea\`

**To see all verified tokens:**
- Use \`listVerifiedTokens\` tool to see all verified tokens on Monad`;
  },
  {
    name: "getTokenInfo",
    description: "Get token details (address, decimals, verification status). Lookup by symbol or address. Call search_tool_docs('getTokenInfo') for detailed usage.",
    schema: getTokenInfoSchema,
  }
);
