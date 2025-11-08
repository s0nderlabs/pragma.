/**
 * H2 Tool Registry
 *
 * Centralized registry of all available tools for the Pragma H2 agent.
 *
 * Tool Architecture:
 * - Swap: Quote → Execute pattern (needs price discovery)
 * - Wrap/Unwrap/Transfer: Direct execution (deterministic, no quote needed)
 */

// Account & Balance Tools
import { getAccountInfoTool } from "./getAccountInfoTool.js";
import { getBalanceTool } from "./getBalanceTool.js";
import { getAllBalancesTool } from "./getAllBalancesTool.js";
import { getSessionKeyBalanceTool } from "./getSessionKeyBalanceTool.js";
import { getSessionKeyPrivateKeyTool } from "./getSessionKeyPrivateKeyTool.js";
import { listVerifiedTokensTool } from "./listVerifiedTokensTool.js";

// Session Key Management Tools
import { checkSessionKeyBalanceTool } from "./checkSessionKeyBalanceTool.js";
import { fundSessionKeyTool } from "./fundSessionKeyTool.js";
import { withdrawSessionKeyBalanceTool } from "./withdrawSessionKeyBalanceTool.js";

// Quote Tools (for operations that need price discovery)
import { getSwapQuoteTool } from "./getSwapQuoteTool.js";
import { executeSwapTool } from "./executeSwapTool.js";

// Direct Execution Tools (no quote needed)
import { wrapTool } from "./wrapToolDirect.js";
import { unwrapTool } from "./unwrapToolDirect.js";
import { transferTool } from "./transferToolDirect.js";

// aPriori Liquid Staking Tools
import { stakeTool } from "./stakeToolDirect.js";
import { unstakeRequestTool } from "./unstakeRequestTool.js";
import { unstakeClaimTool } from "./unstakeClaimTool.js";
import { checkUnstakeStatusTool } from "./checkUnstakeStatusTool.js";

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * Complete list of tools available to the Pragma H2 agent.
 *
 * Tool Patterns:
 * 1. **Account Info:** Get user's account and session information
 * 2. **Balance:** Fetch user token balances (for "all", "half", "max" keywords)
 * 3. **Swap:** getSwapQuote → executeSwap (needs price discovery from DEX)
 * 4. **Wrap:** Direct execution (deterministic 1:1 MON → WMON)
 * 5. **Unwrap:** Direct execution (deterministic 1:1 WMON → MON)
 * 6. **Transfer:** Direct execution (simple token/MON transfer)
 * 7. **Stake:** Direct execution (MON → aprMON liquid staking)
 * 8. **Unstake:** Two-step process (request → wait → claim)
 *
 * Simple operations (wrap/unwrap/transfer/stake) execute immediately without quotes.
 * Complex operations (swap) use quote → execute for user review.
 * Unstaking uses request → claim pattern due to epoch-based withdrawal system.
 *
 * Amount Keywords:
 * When user uses "all", "max", "half", "quarter", agent should:
 * 1. Call getBalance to fetch current balance
 * 2. Calculate numeric amount (all=100%, half=50%, quarter=25%)
 * 3. Pass numeric amount to swap/wrap/unwrap/transfer/stake tools
 */
export const h2ToolRegistry = [
  // Account & balance tools
  getAccountInfoTool,
  getBalanceTool,
  getAllBalancesTool,
  getSessionKeyBalanceTool,
  getSessionKeyPrivateKeyTool,
  listVerifiedTokensTool,

  // Session key management tools
  checkSessionKeyBalanceTool,
  fundSessionKeyTool,
  withdrawSessionKeyBalanceTool,

  // Swap (Quote → Execute pattern for price discovery)
  getSwapQuoteTool,
  executeSwapTool,

  // Direct execution tools (no quote needed)
  wrapTool,
  unwrapTool,
  transferTool,

  // aPriori liquid staking tools
  stakeTool,
  unstakeRequestTool,
  unstakeClaimTool,
  checkUnstakeStatusTool,
] as const;

/**
 * Tool count for validation and monitoring
 */
export const TOOL_COUNT = h2ToolRegistry.length;

// ============================================================================
// Exports
// ============================================================================

export {
  // Account & balance tools
  getAccountInfoTool,
  getBalanceTool,
  getAllBalancesTool,
  getSessionKeyBalanceTool,
  getSessionKeyPrivateKeyTool,
  listVerifiedTokensTool,

  // Session key management tools
  checkSessionKeyBalanceTool,
  fundSessionKeyTool,
  withdrawSessionKeyBalanceTool,

  // Swap tools (quote pattern)
  getSwapQuoteTool,
  executeSwapTool,

  // Direct execution tools
  wrapTool,
  unwrapTool,
  transferTool,

  // aPriori liquid staking tools
  stakeTool,
  unstakeRequestTool,
  unstakeClaimTool,
  checkUnstakeStatusTool,
};
