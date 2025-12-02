import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getAddress, type Address, erc20Abi } from "viem";
import { type AllowedToken } from "../../monorail/tokens.js";

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
      } catch (error) {
        // Search failed, continue to address lookup
        console.error("[getTokenInfoTool] Symbol search error:", error);
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
      } catch (error) {
        // Proxy or API error, continue to onchain
        console.error("[getTokenInfoTool] Token lookup error:", error);
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
        return `❌ **Token Not Found**

The address \`${trimmed}\` is not a valid ERC20 token on Monad.

**Possible reasons:**
- Invalid or malformed address
- Contract does not implement ERC20 standard
- Contract does not exist at this address
- Network issues or RPC errors

**Suggestion:**
- Verify the address is correct
- Check if token exists on block explorer: https://monadexplorer.com/address/${trimmed}
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
