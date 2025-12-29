/**
 * Hallucination Detector
 *
 * Detects when the LLM (primarily Gemini) hallucinates tool calls as text
 * instead of properly invoking them through the API.
 *
 * Common hallucination patterns:
 * - [tool_call:default_api:getTopCollections{limit:5,sortBy:volume}]
 * - [calling getBalanceTool...]
 * - [execute: transfer...]
 *
 * When detected, the system should auto-retry with a reminder prompt.
 *
 * ============================================================
 * FALSE POSITIVE PREVENTION STRATEGY
 * ============================================================
 *
 * 1. CODE BLOCK STRIPPING: All patterns are checked AFTER removing:
 *    - Fenced code blocks: ```...```
 *    - Inline code: `...`
 *    This prevents false positives from legitimate code examples.
 *
 * 2. MINIMUM LENGTH THRESHOLD: No checks until 100+ characters.
 *    This avoids false positives on partial streaming chunks.
 *
 * 3. WHAT IS A HALLUCINATION (should catch):
 *    - Raw JSON in prose: {name: "X"}, {balance: 100} - Agent echoing tool output
 *    - Bracket syntax: [getBalance], [tool: X] - Fake tool invocation
 *    - Function call syntax: getBalance('MON') without code formatting
 *    - XML tags: <tool>X</tool> - Structured fake invocation
 *
 * 4. WHAT IS NORMAL (should NOT catch):
 *    - "I'm calling the getBalance tool" - Normal agent communication
 *    - "Let me check your balance" - Natural description
 *    - Code in blocks: ```getBalance()``` - Properly formatted examples
 *
 * 5. KEY INSIGHT: Agent NEVER outputs raw `{}` JSON in prose.
 *    Any {key: value} pattern is definitely hallucinated tool output.
 *
 * Last updated: 2025-12-27
 * Pattern count: ~95 patterns across 16 sections
 */

/**
 * Complete list of all 36 H2 tools + underscore variants
 * Used for comprehensive hallucination detection
 */
const ALL_TOOLS = 'getAccountInfo|getBalance|getAllBalances|getSessionKeyBalance|getSessionKeyPrivateKey|listVerifiedTokens|getTokenInfo|resolveName|checkSessionKeyBalance|fundSessionKey|withdrawSessionKeyBalance|getSwapQuote|executeSwap|wrap|unwrap|transfer|stake|unstakeRequest|unstakeClaim|checkUnstakeStatus|searchProtocolDocs|searchToolDocs|webSearch|getOnchainActivity|explainTransaction|getMyNFTs|browseCollection|getCollectionInfo|getNFTDetails|getNFTActivity|getTopCollections|getNFTBuyQuote|executeNFTBuy|transferNFT|listNFT|vibetrading|search_protocol_docs|search_tool_docs|web_search'

/**
 * High-risk tools most likely to be hallucinated
 */
const HIGH_RISK_TOOLS = 'getBalance|executeSwap|getSwapQuote|transfer|stake|unstake|wrap|unwrap|getMyNFTs|browseCollection|getTopCollections|search_protocol_docs|web_search|getAllBalances|getAccountInfo'

/**
 * Short action words that may appear standalone in brackets
 */
const SHORT_ACTIONS = 'swap|balance|quote|stake|unstake|wrap|unwrap|transfer|search'

/**
 * Patterns that indicate hallucinated tool calls
 * These appear when the model describes tool invocation instead of doing it
 *
 * COMPREHENSIVE COVERAGE: ~95 patterns across 16 sections
 * Last updated: 2025-12-27
 */
const HALLUCINATION_PATTERNS = [
  // ============================================
  // SECTION 1: BRACKET PREFIX KEYWORDS
  // ============================================
  /\[tool_call:\s*\w+/i,           // [tool_call: X]
  /\[tool:\s*\w+/i,                // [tool: X]
  /\[tool[ _]?calls?\]/i,          // [tool calls], [tool_calls]
  /\[tools?\s+execut(e|es|ed|ing)\]/i, // [tool executes], [tools executed], [tool executing]
  /\[tool\s*calls?\s*:\s*\w+/i,    // [tool calls: X], [tool call: X]
  /\[tools?\s+called\]/i,          // [tool called]
  /\[calling\s+\w+/i,              // [calling X]
  /\[execute:\s*\w+/i,             // [execute: X]
  /\[invoke:\s*\w+/i,              // [invoke: X]
  /\[action:\s*\w+/i,              // [action: X]
  /\[function:\s*\w+/i,            // [function: X]
  /\[api:\s*\w+/i,                 // [api: X]
  /\[using\s+\w+/i,                // [using X]
  /\[running\s+\w+/i,              // [running X]
  // NEW bracket keywords
  /\[run:\s*\w+/i,                 // [run: X]
  /\[call:\s*\w+/i,                // [call: X]
  /\[method:\s*\w+/i,              // [method: X]
  /\[fn:\s*\w+/i,                  // [fn: X]
  /\[op:\s*\w+/i,                  // [op: X]
  /\[operation:\s*\w+/i,           // [operation: X]
  /\[cmd:\s*\w+/i,                 // [cmd: X]
  /\[command:\s*\w+/i,             // [command: X]
  /\[query:\s*\w+/i,               // [query: X]
  /\[request:\s*\w+/i,             // [request: X]
  /\[task:\s*\w+/i,                // [task: X]
  /\[tools:\s*\w+/i,               // [tools: X] (plural)
  /\[executing\s+\w+/i,            // [executing X]
  /\[invoking\s+\w+/i,             // [invoking X]
  /\[fetching\s+\w+/i,             // [fetching X]
  /\[getting\s+\w+/i,              // [getting X]

  // ============================================
  // SECTION 2: DOT NOTATION IN BRACKETS (Gemini)
  // ============================================
  /\[default_api\.\w+/i,           // [default_api.getBalance]
  /\[api\.\w+/i,                   // [api.getBalance]
  /\[tools?\.\w+/i,                // [tool.X], [tools.X]
  /\[agent\.\w+/i,                 // [agent.getBalance]
  /\[client\.\w+/i,                // [client.getBalance]
  /\[\w+_api\.\w+/i,               // [some_api.X]
  /\[\w+\.\w+\s*\(/i,              // [anything.function(]

  // ============================================
  // SECTION 3: STATUS/PROGRESS INDICATORS
  // ============================================
  /\[pending:\s*/i,                // [pending: X]
  /\[in progress:\s*/i,            // [in progress: X]
  /\[waiting\s+(for\s+)?\w+/i,     // [waiting for X]
  /\[working\s+on\s+/i,            // [working on X]
  /\[started:\s*/i,                // [started: X]
  /\[beginning\s+/i,               // [beginning X]
  /\[initiating\s+/i,              // [initiating X]

  // ============================================
  // SECTION 4: TOOL NAME IN BRACKETS (dynamic)
  // ============================================
  // Tool name + paren: [getBalance(...)]
  new RegExp(`\\[(${ALL_TOOLS})\\s*\\(`, 'i'),
  // Tool name standalone: [getBalance]
  new RegExp(`\\[(${ALL_TOOLS}|${SHORT_ACTIONS})\\s*\\]`, 'i'),
  // Tool name + colon: [getBalance: X]
  new RegExp(`\\[(${ALL_TOOLS}|${SHORT_ACTIONS})\\s*:`, 'i'),

  // ============================================
  // SECTION 5: ACTION VERBS IN BRACKETS
  // ============================================
  /\[(Checking|Executing|Getting|Processing|Fetching|Running|Calling|Invoking|Swapping|Transferring|Staking|Wrapping|Unwrapping|Querying|Loading|Retrieving|Searching|Looking up|Finding|Browsing|Listing|Starting|Initiating|Beginning|Performing)\s+/i,

  // ============================================
  // SECTION 6: RESULT/OUTPUT IN BRACKETS
  // ============================================
  /\[(Result|Output|Response|Balance|Quote|Transaction|Status|Error|Success|Failed|NFT|NFTs|Collection|Collections|Activity|Swap|Transfer|Data|Info|Details)\s*:/i,

  // ============================================
  // SECTION 6.5: PHASE/STATUS INDICATORS IN BRACKETS
  // ============================================
  /\[PHASE\s*\d*\]/i,              // [PHASE 1], [PHASE 2], [PHASE]
  /\[STEP\s*\d*\]/i,               // [STEP 1], [STEP 2], [STEP]
  /\[(SEARCHING|LOADING|PROCESSING|WAITING|ANALYZING|PREPARING|COMPLETING|FETCHING|CHECKING|VERIFYING|CONFIRMING|EXECUTING)\]/i,
  /\[(DONE|COMPLETE|FINISHED|STARTED|BEGINNING|INITIATING|IN PROGRESS|PENDING)\]/i,
  /\[STATUS\s*:/i,                 // [STATUS: X]
  /\[PROGRESS\s*:/i,               // [PROGRESS: X]

  // ============================================
  // SECTION 7: FUNCTION CALL SYNTAX (dynamic)
  // ============================================
  // Non-brace args: getBalance('MON')
  new RegExp(`\\b(${HIGH_RISK_TOOLS})\\s*\\(\\s*[^{\\s)]`, 'i'),
  // Empty parens: getBalance()
  new RegExp(`\\b(${HIGH_RISK_TOOLS})\\s*\\(\\s*\\)`, 'i'),
  // Arrow/equals: getBalance => X
  new RegExp(`\\b(${HIGH_RISK_TOOLS})\\s*(=>|=)`, 'i'),
  // Direct brace (no parens): getAllBalances{} or getAllBalances{limit: 5}
  new RegExp(`\\b(${HIGH_RISK_TOOLS})\\s*\\{`, 'i'),

  // ============================================
  // SECTION 8: ASYNC/METHOD CALL SYNTAX
  // ============================================
  new RegExp(`\\bawait\\s+(${HIGH_RISK_TOOLS})\\s*\\(`, 'i'),       // await X(
  new RegExp(`\\bthis\\.(${HIGH_RISK_TOOLS})\\s*\\(`, 'i'),         // this.X(
  new RegExp(`\\bagent\\.(${HIGH_RISK_TOOLS})\\s*\\(`, 'i'),        // agent.X(
  new RegExp(`\\btools?\\.(${HIGH_RISK_TOOLS})\\s*\\(`, 'i'),       // tools.X(
  new RegExp(`\\bclient\\.(${HIGH_RISK_TOOLS})\\s*\\(`, 'i'),       // client.X(
  new RegExp(`\\bapi\\.(${HIGH_RISK_TOOLS})\\s*\\(`, 'i'),          // api.X(

  // ============================================
  // SECTION 9: XML-LIKE SYNTAX
  // ============================================
  /<tool>\s*\w+/i,                 // <tool>X
  /<\/tool>/i,                     // </tool>
  /<function>\s*\w+/i,             // <function>X
  /<call>\s*\w+/i,                 // <call>X
  /<invoke>\s*\w+/i,               // <invoke>X
  /<action>\s*\w+/i,               // <action>X
  /<method>\s*\w+/i,               // <method>X

  // ============================================
  // SECTION 10: TOOL SUFFIX PATTERN
  // ============================================
  new RegExp(`\\b(${ALL_TOOLS})Tool\\s*[\\(\\[:{]`, 'i'),           // getBalanceTool(
  /\w+Tool\s*\(/i,                 // anyTool(

  // ============================================
  // SECTION 11: JSON-LIKE SYNTAX
  // ============================================
  // Agent NEVER outputs raw JSON in prose. Any {key: value} is a hallucination
  // (echoing tool output instead of formatting as prose).
  /\{\s*"?tool"?\s*:\s*"?\w+/i,    // {"tool": "X"}
  /\{\s*"?action"?\s*:\s*"?\w+/i,  // {"action": "X"}
  /\{\s*"?function"?\s*:\s*"?\w+/i,// {"function": "X"}
  /\{\s*"?name"?\s*:\s*"?\w+/i,    // {"name": "X"} - NFT names, etc.
  /\{\s*"?method"?\s*:\s*"?\w+/i,  // {"method": "X"}
  /\{\s*"?call"?\s*:\s*"?\w+/i,    // {"call": "X"}
  /\{\s*"?invoke"?\s*:\s*"?\w+/i,  // {"invoke": "X"}
  /\{\s*"?type"?\s*:\s*"?tool/i,   // {"type": "tool"}

  // ============================================
  // SECTION 12: DOUBLE BRACKETS/BRACES
  // ============================================
  /\[\[\w+\]\]/i,                  // [[getBalance]]
  /\{\{\s*\w+\s*\}\}/i,            // {{getBalance}}

  // ============================================
  // SECTION 13: (REMOVED - "I'm calling X" is normal agent behavior)
  // ============================================
  // Agent saying "I'm calling the getBalance tool" is FINE.
  // This is normal conversational communication, not hallucination.
  // Only catch actual fake tool invocation syntax, not natural descriptions.

  // ============================================
  // SECTION 14: INVOCATION ANNOUNCEMENTS
  // ============================================
  /\b(Invoking|Calling|Running|Executing|Using):\s*\w+/i,           // Invoking: X

  // ============================================
  // SECTION 15: CURLY BRACE FUNCTION CALLS
  // ============================================
  /\bgetSwapQuote\s*\(\s*\{/i,
  /\bexecuteSwap\s*\(\s*\{/i,
  /\bgetBalance\s*\(\s*\{/i,
  /\bgetAllBalances\s*\(\s*\{/i,
  /\bgetAccountInfo\s*\(\s*\{/i,
  /\btransfer\s*\(\s*\{/i,
  /\btransferNFT\s*\(\s*\{/i,
  /\bgetMyNFTs\s*\(\s*\{/i,
  /\bgetTopCollections\s*\(\s*\{/i,
  /\bbrowseCollection\s*\(\s*\{/i,
  /\bgetNFTDetails\s*\(\s*\{/i,
  /\bexecuteNFTBuy\s*\(\s*\{/i,
  /\bstake\s*\(\s*\{/i,
  /\bunstake\s*\(\s*\{/i,
  /\bwrap\s*\(\s*\{/i,
  /\bunwrap\s*\(\s*\{/i,
  /\bsearchProtocolDocs\s*\(\s*\{/i,
  /\bwebSearch\s*\(\s*\{/i,

  // ============================================
  // SECTION 16: INTERNAL DATA MARKERS
  // ============================================
  // These markers indicate tool output data that should be rendered as UI,
  // not printed as text. If they appear in prose, it's a hallucination.
  // Flexible patterns to catch variations (underscores, spaces, case).
  /\[NFT[_\s]*GALLERY[_\s]*(DATA)?\]/i,    // [NFT_GALLERY_DATA], [NFT GALLERY], [nft gallery data]
  /\[ACTIVITY[_\s]*(DATA|TABLE)\]/i,       // [ACTIVITY_DATA], [ACTIVITY TABLE], [activity_data]
  /<!--\s*NFT[_\s]*GALLERY\s*-->/i,        // <!--NFT_GALLERY-->, <!-- NFT GALLERY -->
  /<!--\s*ACTIVITY[_\s]*TABLE\s*-->/i,     // <!--ACTIVITY_TABLE-->, <!-- ACTIVITY TABLE -->
]

/**
 * Minimum text length before checking for hallucinations
 * Avoids false positives on short streaming chunks
 */
const MIN_TEXT_LENGTH = 100

/**
 * Detect if text contains hallucinated tool calls
 *
 * @param text - The accumulated response text to check
 * @returns true if hallucination detected, false otherwise
 *
 * @example
 * ```ts
 * if (detectHallucination(streamedText) && retryCount < 2) {
 *   abortController.abort()
 *   // Auto-retry with reminder prompt
 * }
 * ```
 */
export function detectHallucination(text: string): boolean {
  // Don't check very short text (prevents false positives during early streaming)
  if (text.length < MIN_TEXT_LENGTH) {
    return false
  }

  // Remove code blocks to avoid false positives
  // Valid code examples might contain tool names
  const withoutCodeBlocks = text.replace(/```[\s\S]*?```/g, '')

  // Also remove inline code
  const withoutInlineCode = withoutCodeBlocks.replace(/`[^`]+`/g, '')

  // Check against all patterns
  return HALLUCINATION_PATTERNS.some((pattern) => pattern.test(withoutInlineCode))
}

/**
 * Get the specific pattern that matched (for logging/debugging)
 */
export function getMatchedPattern(text: string): string | null {
  if (text.length < MIN_TEXT_LENGTH) {
    return null
  }

  const withoutCodeBlocks = text.replace(/```[\s\S]*?```/g, '')
  const withoutInlineCode = withoutCodeBlocks.replace(/`[^`]+`/g, '')

  for (const pattern of HALLUCINATION_PATTERNS) {
    const match = withoutInlineCode.match(pattern)
    if (match) {
      return match[0]
    }
  }

  return null
}

/**
 * Generate retry prompt based on retry count
 *
 * @param originalMessage - The original user message
 * @param retryCount - Current retry attempt (0-indexed)
 * @returns Modified prompt with context about retry and safety instructions
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getRetryPrompt(originalMessage: string, _retryCount: number): string {
  // Unified message for all retry attempts - "escalation" doesn't work on LLMs
  // _retryCount kept for interface compatibility but not used (same message for all retries)
  return `${originalMessage}

[SYSTEM NOTICE:
Your previous response contained text that looked like tool invocations (e.g., [getBalance], [PHASE 1], or function syntax) instead of actually calling tools. This message is being re-sent.

REQUIRED:
- Invoke tools properly - never output text like [toolName] or toolName(). Actually call the tool.
- Never output bracket-formatted status like [PHASE 1], [SEARCHING], [LOADING]
- Never output [ACTIVITY_DATA], [NFT_GALLERY_DATA], or HTML comments

FOR THIS MESSAGE ONLY:
If this message involves on-chain execution (swap, transfer, stake, wrap, unwrap, NFT buy):
- Call getOnchainActivity first to check if the action was already completed
- If found, report the existing transaction instead of re-executing
- Skip this check for read-only requests]`
}
