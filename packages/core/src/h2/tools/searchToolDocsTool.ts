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

  resolveName: `**resolveName** - Resolve NAD/ENS names to addresses (or reverse)

**Use when:** User asks "what is the address of X.nad/X.eth?" or "who owns 0x...?"

**Supports:**
- NAD Name Service (.nad) - Monad native, PREFERRED
- ENS (.eth) - Ethereum mainnet, cross-chain compatible
- Reverse lookup: 0x address → registered name

**Parameters:**
- name: NAD name (.nad), ENS name (.eth), or 0x address for reverse lookup

**Examples:**
- "what is the address of salmo.nad?" → resolveName({ name: "salmo.nad" })
- "who owns 0x1234...?" → resolveName({ name: "0x1234..." })
- "look up vitalik.eth" → resolveName({ name: "vitalik.eth" })

**Returns:**
- Forward: Address + service type (NAD/ENS)
- Reverse: Registered name or "None found"

**IMPORTANT:** This is for LOOKUP only. For transfers, use the transfer tool directly with names.`,

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
- recipient: Destination address (0x...), NAD name (.nad), or ENS name (.eth)

**Name Resolution:**
- NAD (.nad): Monad native - PREFERRED (e.g., "salmo.nad")
- ENS (.eth): Ethereum mainnet cross-chain (e.g., "vitalik.eth")
- Both auto-resolve to 0x addresses

**Examples:**
- "send 10 USDC to salmo.nad" → resolves NAD name
- "send 5 MON to vitalik.eth" → resolves ENS name
- "send 100 USDC to 0x1234..." → direct address

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

  // Pragma Concept
  vibetrading: `**Vibetrading** - Pragma's coined term for AI-powered trading

**Definition:** Vibetrading is trading through natural conversation with AI—the trading equivalent of "vibe coding."

Just as vibe coding lets developers build software by describing what they want, vibetrading lets users interact with web3 and crypto by simply saying what they want to do.

**Examples:**
- "swap half my MON to USDC" → AI understands, gets quote, executes
- "stake all my MON" → AI handles the entire flow
- "what's my portfolio worth?" → AI checks balances and calculates

**Why it matters:** No more complex UIs, wallet popups, or confusing DeFi interfaces. Just tell Pragma what you want in plain English.

**Related:** Pragma is the platform that enables vibetrading on Monad.`,

  // Easter Egg Tool
  claimVibetrading: `**claimVibetrading** - Claim 5 MON beta tester airdrop

**TRIGGER:** ONLY call when user types EXACTLY "/vibetrading" as their message

**DO NOT call for:**
- "what is vibetrading?" → Look up 'vibetrading' concept instead
- "tell me about vibetrading" → Look up 'vibetrading' concept instead
- Any casual mentions

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
  search_tool_docs: `**search_tool_docs** - Get detailed documentation for complex tool scenarios

**Use when:** You're genuinely confused about edge cases, error recovery, or multi-step workflows

**Parameters:**
- toolName: Name of the tool (e.g., 'getSwapQuote', 'stake', 'transfer')

**Returns:** Detailed documentation including:
- When to use the tool
- Required and optional parameters
- Example workflows
- Important notes and warnings

**NOTE:** Most tools are self-documented in their schema description. Only use this for deep-dive scenarios.`,

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

  // NFT Tools
  getMyNFTs: `**getMyNFTs** - Get NFTs owned by user

**Use when:** User asks "show my NFTs", "what NFTs do I have?"

**Parameters:**
- collection: (optional) OpenSea collection slug to filter
- limit: (optional) Max NFTs to fetch (default 20, max 50)

**Returns:**
- NFT gallery rendered by UI after you finish speaking
- Collection summary with floor prices

**CRITICAL:** The NFT gallery is rendered by the UI AFTER you finish speaking.
DO NOT list individual NFTs or echo JSON data.
Just provide a brief summary.

**Example response:**
"You have 15 NFTs across 3 collections. The gallery is shown below with floor prices for each.
Want to buy, sell, or transfer any of these?"`,

  browseCollection: `**browseCollection** - Browse NFTs for sale in a collection

**Use when:** User wants to see NFTs available for purchase

**Parameters:**
- collection: OpenSea collection slug (e.g., 'skrumpeys')
- limit: (optional) Max NFTs to return (default 12, max 50)
- maxPrice: (optional) Max price filter in MON

**Returns:**
- Gallery of listed NFTs with prices
- Sorted by price (cheapest first)
- Token IDs for use with getNFTBuyQuote

**IMPORTANT:** Remember the collection slug for subsequent getNFTBuyQuote calls.

**Example:** "browse skrumpeys" or "show skrumpeys under 5 MON"`,

  getCollectionInfo: `**getCollectionInfo** - Get NFT collection details

**Use when:** User asks about a specific collection

**Parameters:**
- collection: Collection slug OR contract address

**Returns:**
- Name, description
- Floor price (real-time from listings)
- Total supply, active listings, owners
- Contract address
- Social links

**Example:** "tell me about molandaks" or "what is the floor for skrumpeys"`,

  getNFTDetails: `**getNFTDetails** - Get traits and rarity for specific NFTs

**Use when:** User wants detailed info about specific NFT(s)

**Parameters:**
- contract: NFT contract address
- tokenIds: Array of token IDs (max 10)

**Returns:**
- Name, image
- Rarity rank
- All traits with values

**Example:** "what are the traits of skrumpey #42"`,

  getNFTActivity: `**getNFTActivity** - Get NFT activity history

**Use when:** User asks about sales, transfers, or listings

**Parameters:**
- mode: 'nft' (contract+tokenId), 'collection' (slug), or 'account' (address)
- contract/tokenId: Required for mode='nft'
- collection: Required for mode='collection'
- account: For mode='account' (defaults to user's address)
- eventTypes: (optional) Filter by event types
- limit: (optional) Max events (default 20, max 50)

**Returns:**
- Sales with prices and parties
- Transfers with from/to
- Listings and offers

**Example:** "recent sales for skrumpeys" or "my NFT activity"`,

  getTopCollections: `**getTopCollections** - Get trending NFT collections

**Use when:** User asks about popular/top collections or searches for one

**Parameters:**
- search: (optional) Search for collection by name
- sortBy: (optional) 'volume' (default) or 'market_cap'
- limit: (optional) Max collections (default 5, max 10)

**Returns:**
- Collection names and slugs
- Floor prices and 24h volume
- Verification status

**Example:** "top NFT collections" or "find skrumpeys"`,

  getNFTBuyQuote: `**getNFTBuyQuote** - Get quote to buy an NFT

**Use when:** User wants to buy a specific NFT

**Parameters:**
- collection: OpenSea collection slug
- tokenId: Token ID to buy

**Returns:**
- NFT name and details
- Price with USD equivalent
- Quote ID for executeNFTBuy

**IMPORTANT:**
- 1% Pragma fee on purchase price
- Quote expires in 5 minutes
- Use exact quoteId for executeNFTBuy

**Example:** "buy skrumpey #42" → get quote first, then execute`,

  executeNFTBuy: `**executeNFTBuy** - Execute NFT purchase

**Use when:** User confirms quote from getNFTBuyQuote

**Parameters:**
- quoteId: Quote ID from getNFTBuyQuote (exact match)

**Workflow:**
1. getNFTBuyQuote → show quote to user
2. User confirms
3. executeNFTBuy with quoteId

**IMPORTANT:**
- Quote expires after 5 minutes
- Never construct quoteId manually
- Mode behavior: Normal waits for 'yes', Quick executes immediately`,

  transferNFT: `**transferNFT** - Send NFT to another address

**Use when:** User wants to send an NFT

**Parameters:**
- contract: NFT contract address
- tokenId: Token ID to transfer
- recipient: Address, .nad name, or .eth name
- amount: (optional) For ERC1155 only

**Features:**
- FREE (no protocol fee, gas only)
- Auto-resolves NAD/ENS names
- Supports ERC721 and ERC1155

**Example:** "send my skrumpey #42 to alice.nad"`,

  listNFT: `**listNFT** - List NFT for sale on OpenSea

**Use when:** User wants to sell an NFT

**Parameters:**
- contract: NFT contract address
- tokenId: Token ID to list
- price: Listing price in MON
- duration: (optional) Days (default 7, max 365)

**Features:**
- Creates Seaport listing
- Auto-approves conduit via delegation if needed
- Validates on-chain for direct fillability

**Returns:**
- Order hash
- OpenSea listing URL

**Example:** "list my skrumpey #42 for 10 MON"`,

  // On-chain Activity Tools
  getOnchainActivity: `**getOnchainActivity** - View on-chain transaction history

**Use when:** User asks "show my activity", "transaction history", "what did I do", "recent transactions"

**Parameters:**
- timeRange: Time period to fetch (e.g., "2 days", "6 hours", "1 week")
- page: (optional) Page number for pagination (default 1)

**Returns:**
- Activity table rendered by UI after you finish speaking
- Transaction types: swap, stake, unstake, transfer, wrap, unwrap

**CRITICAL:** The activity table is rendered by the UI AFTER you finish speaking.
DO NOT echo JSON data or create markdown tables.
Just provide a brief summary of what was found.

**Example response:**
"Found 47 transactions over the last 7 days - mostly swaps and a few staking operations.
The activity table is shown below. Want me to explain any specific transaction?"`,

  explainTransaction: `**explainTransaction** - Explain any transaction in detail

**Use when:** User asks "explain this tx", "what happened in 0x...", "tell me about this transaction"

**Parameters:**
- txHash: Full 66-character transaction hash (0x + 64 hex chars)

**Returns:**
- Transaction type (swap, stake, transfer, wrap, etc.)
- Summary of what happened
- Token movements: in/out with USD values
- Protocol used (Monorail, aPriori, etc.)
- Swap route if applicable
- Pragma fee, gas cost
- Block, timestamp, status
- Explorer link

**Examples:**
- "explain 0x1234..." → explainTransaction({ txHash: "0x1234..." })
- "what happened in this tx" → explainTransaction({ txHash: "..." })

**IMPORTANT:** Requires FULL 66-char hash. If user provides truncated hash, ask for full one.`,
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

    // List available tools if not found - updated fallback for new architecture
    const availableTools = Object.keys(toolDocs).join(", ");
    return `Tool "${toolName}" not found in deep-dive docs.

**Note:** Tool schemas are now self-contained. searchToolDocs is for edge cases only.
If you need basic usage info, the tool's schema description should be sufficient.

**Available deep-dive docs:** ${availableTools}`;
  },
  {
    name: "search_tool_docs",
    description: "Get deep-dive documentation for complex tool scenarios. Use ONLY when genuinely confused about edge cases, error recovery, or multi-step workflows. Most tools are self-documented in schema.",
    schema: searchToolDocsSchema,
  }
);
