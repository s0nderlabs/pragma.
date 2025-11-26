import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getAddress, type Address, erc20Abi } from "viem";
import { type AllowedToken } from "../../monorail/tokens.js";

/**
 * getTokenInfoTool - Get detailed information about any token (verified or unverified)
 *
 * Features:
 * - 3-tier fallback strategy: allowlist → Monorail API → onchain
 * - Security warnings for unverified tokens
 * - Full contract address display (no truncation)
 * - Supports lookup by symbol or address
 */

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
- Check token on block explorer (https://testnet.monadvision.com)
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

    // =========================================================================
    // Tier 1: Check allowedTokens (verified tokens)
    // =========================================================================
    const verified = findInAllowlist(token, allowedTokens);
    if (verified) {
      return formatVerifiedToken(verified);
    }

    // =========================================================================
    // Tier 2: Try Monorail API via proxy (may have unverified tokens)
    // =========================================================================
    if (token.startsWith("0x")) {
      try {
        const checksumAddress = getAddress(token as Address);

        // Use proxy to avoid CORS issues with direct Monorail Data API calls
        // Use authenticated fetch from configurable if available (browser context)
        const fetchFn = (config?.configurable?.fetch as typeof fetch) || fetch;
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
    // Tier 3: Try onchain (ERC20 basic data)
    // =========================================================================
    if (token.startsWith("0x") && publicClient) {
      try {
        const checksumAddress = getAddress(token as Address);

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
      } catch (error) {
        return `❌ **Token Not Found**

The address \`${token}\` is not a valid ERC20 token on Monad testnet.

**Possible reasons:**
- Invalid or malformed address
- Contract does not implement ERC20 standard
- Contract does not exist at this address
- Network issues or RPC errors

**Suggestion:**
- Verify the address is correct
- Check if token exists on block explorer: https://testnet.monadvision.com/address/${token}
- Use \`listVerifiedTokens\` to see all available verified tokens`;
      }
    }

    // =========================================================================
    // Not found anywhere
    // =========================================================================
    return `❌ **Token Not Found**

Token "${token}" was not found in the verified token list.

**If you have a contract address:**
- Paste the full address starting with \`0x\` and I'll look it up onchain
- Example: \`0xf817257fed379853cDe0fa4F97AB987181B1E5Ea\`

**To see all verified tokens:**
- Use \`listVerifiedTokens\` tool to see 50+ available tokens on Monad`;
  },
  {
    name: "getTokenInfo",
    description: `Get detailed information about a specific token including contract address, decimals, type, categories, and verification status.

**When to use:**
- User asks "what is the address of [TOKEN]?"
- User asks "show me [TOKEN] contract address"
- User wants token details (decimals, categories, verification status)
- User asks "is [TOKEN] verified?"
- User pastes a token address and asks "what token is this?"

**Supports:**
- Lookup by symbol (e.g., "YAKI", "MON", "USDC")
- Lookup by address (e.g., "0xfe140...")
- Verified tokens (fast lookup from allowlist)
- Unverified tokens (Monorail API lookup with warnings)
- Unknown tokens (onchain ERC20 lookup with strong warnings)

**Returns:**
- Full contract address (never truncated)
- Symbol, name, decimals, type, categories
- Verification status (✅ verified / ⚠️ not verified)
- Security warnings for unverified tokens
- Logo URL (if available)`,
    schema: getTokenInfoSchema,
  }
);
