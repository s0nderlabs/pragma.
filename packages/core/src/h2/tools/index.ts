/**
 * H2 Tool Registry
 *
 * Centralized registry of all available tools for the Pragma H2 agent.
 */

import { swapTool } from "./swapTool.js";
import { transferTool } from "./transferTool.js";
import { wrapTool, unwrapTool } from "./wrapTool.js";

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * Complete list of tools available to the Pragma H2 agent.
 *
 * Tools are ordered by expected frequency of use:
 * 1. swap - Most common operation
 * 2. transfer - Simple token sends
 * 3. wrap/unwrap - MON <-> WMON conversions
 */
export const h2ToolRegistry = [
  swapTool,
  transferTool,
  wrapTool,
  unwrapTool,
] as const;

/**
 * Tool count for validation and monitoring
 */
export const TOOL_COUNT = h2ToolRegistry.length;

// ============================================================================
// Exports
// ============================================================================

export { swapTool, transferTool, wrapTool, unwrapTool };
