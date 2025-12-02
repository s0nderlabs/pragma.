/**
 * Search Tool Docs Tool - Retrieve detailed tool documentation on-demand
 *
 * Enables the agent to get detailed usage instructions for specific tools.
 * Implements Anthropic's "Tool Search Tool" pattern for efficient context usage.
 *
 * Instead of loading 273 lines of tool docs upfront, the agent can request
 * detailed documentation only when needed for specific tools.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// ============================================================================
// Detailed Tool Documentation
// ============================================================================

/**
 * Comprehensive documentation for each tool
 * This replaces the detailed docs that were removed from the system prompt
 */
const toolDocs: Record<string, string> = {
  // Account & Balance Tools
  getAccountInfo: `**getAccountInfo** - Get user's account and session information

**Use when:** User asks "what account am I using?", "show my address", "what is my wallet?", "whoami", or similar

**Returns:**
- Smart account address (HybridDelegator)
- Owner address (Web3Auth account)
- Session key address and balance
- Chain info (Monad, chain ID 143)

**Example:** User asks "what account am I using?" → Call getAccountInfo({}) → Returns detailed account info

**IMPORTANT:** Call this tool instead of trying to answer from memory.`,

  getBalance: `**getBalance** - Fetch user's balance for a specific token

**Use when:** User says "all", "max", "half", "quarter" or any amount keyword before swap/transfer/wrap

**Workflow:**
1. Call getBalance({ token: "MON" }) → Returns "3.5 MON"
2. Calculate: all = 3.5, half = 1.75, quarter = 0.875
3. Call swap/transfer/wrap/unwrap with numeric amount

**IMPORTANT:** Always call getBalance BEFORE executing when user uses amount keywords.

**Parameters:**
- token: Token symbol (MON, USDC, etc.) or "all" to show all balances`,

  getAllBalances: `**getAllBalances** - Get all token balances in user's smart account

**Use when:** User asks "show my portfolio", "what tokens do I have?", "all my balances"

**Returns:**
- List of all tokens with balances and USD values
- Shows both verified and unverified tokens
- Token addresses in [brackets] for future operations

**Example:** "show all my tokens" or "what's my portfolio"`,

  getSessionKeyBalance: `**getSessionKeyBalance** - Get session key MON balance (for gas)

**Use when:** User asks "what is my session key balance?", "session key status", "how much gas do I have?"

**Returns:** Session key MON balance and address with low balance warning if needed

**IMPORTANT:** Session key is DIFFERENT from smart account - it only holds MON for gas payments (~1 MON).`,

  getSessionKeyPrivateKey: `**getSessionKeyPrivateKey** - Export session key private key

**Use when:** User explicitly requests to see or export their session key private key

**Examples:** "show my session key private key", "export session key"

**Returns:** Private key (hex string) + address + comprehensive security warning

**IMPORTANT:** Only call when user EXPLICITLY requests private key export.

**Security:** Session key only holds ~1 MON for gas, cannot access smart account tokens.`,

  listVerifiedTokens: `**listVerifiedTokens** - List all verified tokens on Pragma

**Use when:** User asks "what tokens are supported?", "show all tokens", "which tokens can I swap?"

**Returns:**
- Complete list with symbols, names, addresses
- Categories: Native, Stablecoin, Meme, DeFi, LST

**Example:** "what tokens can I trade?" or "list all available tokens"`,

  getTokenInfo: `**getTokenInfo** - Get detailed information about any token

**Use when:** User asks "what is the address of [TOKEN]?", "is [TOKEN] verified?", or pastes an address

**Accepts:** Token symbol (e.g., "YAKI") OR contract address (e.g., "0xfe140...")

**Returns:**
- Full contract address (NEVER truncate)
- Symbol, name, decimals
- Verification status with appropriate warnings

**Security badges:**
- ✅ Verified: Safe to use
- ⚠️ Unverified: Shows caution message
- ⚠️ Unknown (onchain-only): EXTREME CAUTION warning

**IMPORTANT:** Always display the FULL contract address returned.`,

  // Session Key Control Tools
  checkSessionKeyBalance: `**checkSessionKeyBalance** - Check if session key needs gas funding

**Use when:** Before batch operations to ensure enough gas

**Parameters:**
- estimatedOperations: Number of planned operations (e.g., 3 for batch of 3 swaps)

**Returns:**
- Current balance
- Required amount
- needsFunding: boolean

**Example:** "check if session key has enough gas for 5 swaps"`,

  fundSessionKey: `**fundSessionKey** - Fund session key with MON for gas

**Use when:** checkSessionKeyBalance returns needsFunding: true

**Parameters:**
- estimatedOperations: For dynamic funding amount calculation

**How it works:** Executes via delegation from smart account

**Formula:** (N × 0.11 MON per operation) + 0.20 MON buffer`,

  withdrawSessionKeyBalance: `**withdrawSessionKeyBalance** - Transfer MON from session key

**Use when:** User wants to recover session key funds or withdraw before logout

**Parameters:**
- amount: "all" (maximum possible) or specific amount like "0.5"
- recipient: Optional (defaults to smart account, or specify custom address)

**Example:** "withdraw all session key balance" or "withdraw 0.5 MON from session key to 0xABC..."

**IMPORTANT:** Direct EOA transfer (no delegation needed), session key owns its MON.`,

  // Swap Tools
  getSwapQuote: `**getSwapQuote** - Get swap price from Monorail DEX aggregator

**Protocol Fee:** 1% deducted from input amount (Uniswap pattern)
- Example: User swaps 1.0 USDC → Actually swaps 0.99 USDC (0.01 fee)
- User only needs exactly what they specify

**Returns:**
- Best price across DEXs
- Gas estimate
- Quote ID (use for executeSwap)
- Slippage tolerance
- Net swap amount

**Slippage Control:**
- Default: 5% (500 basis points)
- Custom: Pass slippageBps parameter (50 = 0.5%, 1500 = 15%)
- Maximum: 15% hard cap - capped automatically if higher requested

**Amount keywords:** "all", "max", "half", "quarter" - fetch balance first!`,

  executeSwap: `**executeSwap** - Execute confirmed swap

**Requires:** Quote ID from getSwapQuote

**IMPORTANT:**
- Use the SAME quote ID from getSwapQuote (do not re-fetch)
- Quotes expire after 5 minutes
- Reusing IDs prevents expiry errors

**Workflow:**
1. getSwapQuote → show to user
2. User confirms (types "yes")
3. executeSwap with quote ID`,

  // Direct Execution Tools
  wrap: `**wrap** - Wrap MON → WMON

**Fee:** FREE (no protocol fee, only gas)
**Execution:** Immediate when called

**Mode behavior:**
- Quick mode: Call immediately
- Normal mode: Ask for confirmation, then call

**Amount keywords:** "all", "max", "half", "quarter" - fetch balance first!`,

  unwrap: `**unwrap** - Unwrap WMON → MON

**Fee:** FREE (no protocol fee, only gas)
**Execution:** Immediate when called

**Mode behavior:**
- Quick mode: Call immediately
- Normal mode: Ask for confirmation, then call

**Amount keywords:** "all", "max", "half", "quarter" - fetch balance first!`,

  transfer: `**transfer** - Transfer ERC20 tokens or native MON

**Fee:** FREE (no protocol fee, only gas)
**Execution:** Immediate when called

**Parameters:**
- token: Token symbol or address
- amount: Amount to send (supports "all", "half", etc.)
- recipient: Destination address or ENS name

**Mode behavior:**
- Quick mode: Call immediately
- Normal mode: Ask for confirmation, then call`,

  // aPriori Staking Tools
  stake: `**stake** - Stake MON → aprMON via aPriori liquid staking

**Protocol Fee:** 1% deducted from stake amount
- Example: Stake 1.0 MON → 0.99 MON staked → receive aprMON

**Returns:** aprMON which appreciates as staking + MEV rewards accrue

**Amount keywords:** "all", "max", "half", "quarter" supported

**Examples:** "stake 10 MON" or "stake all my MON"`,

  unstakeRequest: `**unstakeRequest** - Request unstake from aPriori

**Behavior differs by network:**
- TESTNET (withdrawalDelay=0): Returns MON instantly
- MAINNET (withdrawalDelay>0): Requires 12-18 hour wait before claiming

**Returns:** Request ID(s) for tracking

**IMPORTANT:** Always read the tool output to see which behavior occurred - don't assume delays!

**Examples:** "unstake my aprMON" or "request to unstake 5 aprMON"`,

  unstakeClaim: `**unstakeClaim** - Claim completed unstake requests

**Use when:** Withdrawal period complete (check with checkUnstakeStatus)

**Parameters:** Request IDs from unstakeRequest

**Returns:** MON received (minus aPriori's 0.1% fee)

**Example:** "claim my unstaked MON"`,

  checkUnstakeStatus: `**checkUnstakeStatus** - Check withdrawal request status

**Use when:** User asks "is my unstake ready?", "check unstake status"

**Returns:**
- List of pending/claimable requests
- Timestamps for each request
- Whether each is ready to claim

**Examples:** "check my unstake status" or "are my MON ready to claim?"`,

  // Easter Egg
  claimVibetrading: `**claimVibetrading** - Claim 1.5 MON beta tester airdrop

**TRIGGER:** ONLY call when user types EXACTLY "/vibetrading" as their message

**DO NOT call for:**
- "what is vibetrading?" → Explain it instead
- "tell me about vibetrading" → Explain it instead
- Any casual mentions

**What is vibetrading?** Pragma's term for AI-powered trading through natural conversation—like vibe coding but for trading.

**Returns JSON with status:**
- status="success": Show celebratory message with amount + txHash
- status="already_claimed": Tell user they already claimed + show txHash
- status="error": Show error message

**Response style:** Fun, celebratory, use emojis. Be creative!`,

  // Web Search
  web_search: `**web_search** - Search the web for current information

**Use when:** User asks about:
- Current token prices ("what is MON price?")
- Recent news or announcements ("latest Monad news")
- Real-time data not in protocol documentation
- Information that changes frequently

**Parameters:**
- query: Search query string (be specific and include context)

**Examples:**
- "what is the current price of MON?" → query: "MON Monad token current price"
- "latest news about aPriori" → query: "aPriori liquid staking Monad news"
- "what's happening with Monad?" → query: "Monad blockchain latest updates"

**Returns:** Summarized answer with source citations

**IMPORTANT:**
- Use for CURRENT/REAL-TIME information only
- For protocol documentation, use search_protocol_docs instead
- Results include source URLs for verification`,

  // RAG Tools (self-documentation)
  search_tool_docs: `**search_tool_docs** - Get detailed documentation for any Pragma tool

**Use when:** You need usage instructions, parameters, or examples for a specific tool

**Parameters:**
- toolName: Name of the tool (e.g., 'getSwapQuote', 'stake', 'transfer')

**Returns:** Detailed documentation including:
- When to use the tool
- Required and optional parameters
- Example workflows
- Important notes and warnings

**Examples:**
- Need swap help? → search_tool_docs('getSwapQuote')
- Need staking help? → search_tool_docs('stake')
- Need transfer help? → search_tool_docs('transfer')`,

  search_protocol_docs: `**search_protocol_docs** - Get Pragma architecture and protocol documentation

**Use when:** User asks about:
- How Pragma works ("how does Pragma work?")
- Technical architecture ("explain the delegation system")
- Security model ("how are my funds protected?")
- Protocol integrations ("what is aPriori?", "what is Monorail?")

**Parameters:**
- topic: Topic to search for (e.g., 'delegation', 'security', 'architecture')

**Examples:**
- "How does Pragma work?" → search_protocol_docs('architecture')
- "What is aPriori?" → search_protocol_docs('aPriori')
- "How are delegations signed?" → search_protocol_docs('signing')

**IMPORTANT:** Use this for Pragma-specific documentation, not real-time data (use web_search for that)`,
};

// ============================================================================
// Tool Schema
// ============================================================================

const searchToolDocsSchema = z.object({
  toolName: z
    .string()
    .describe(
      "Name of the tool to get documentation for. Examples: 'getSwapQuote', 'stake', 'transfer', 'unstakeRequest'"
    ),
});

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Get detailed documentation for a specific Pragma tool
 *
 * This implements Anthropic's "Tool Search Tool" pattern - loading detailed
 * tool documentation on-demand rather than including 273 lines in every request.
 */
export const searchToolDocsTool = tool(
  async ({ toolName }): Promise<string> => {
    // Normalize tool name (handle common variations)
    const normalizedName = toolName
      .toLowerCase()
      .replace(/tool$/, "")
      .replace(/_/g, "")
      .replace(/-/g, "");

    // Find matching tool
    const matchingKey = Object.keys(toolDocs).find((key) =>
      key.toLowerCase().replace(/tool$/, "") === normalizedName ||
      key.toLowerCase() === normalizedName ||
      key.toLowerCase().includes(normalizedName)
    );

    if (matchingKey && toolDocs[matchingKey]) {
      return toolDocs[matchingKey];
    }

    // List available tools if not found
    const availableTools = Object.keys(toolDocs).join(", ");
    return `Tool "${toolName}" not found.\n\n**Available tools:** ${availableTools}`;
  },
  {
    name: "search_tool_docs",
    description:
      "Get detailed documentation for a specific Pragma tool. Use when you need usage instructions, parameters, or examples for a tool like getSwapQuote, stake, transfer, etc.",
    schema: searchToolDocsSchema,
  }
);
