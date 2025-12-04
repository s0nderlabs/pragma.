/**
 * Tool Description Wrapper for DeepSeek
 *
 * Adds reminder text to ALL tool descriptions when DeepSeek is the active model.
 * This reinforces the critical behavior of outputting text before calling tools
 * (prevents silent execution).
 */

import type { StructuredToolInterface } from '@langchain/core/tools';

/**
 * Reminder appended to ALL tool descriptions for DeepSeek.
 * Prevents silent tool calls by reminding to OUTPUT text first.
 */
const DEEPSEEK_REMINDER = ' [⚠️ Before calling: OUTPUT text to user first]';

/**
 * Wrap ALL tools with DeepSeek-specific reminders.
 *
 * @param tools - Array of LangChain tools from h2ToolRegistry
 * @returns Tools with modified descriptions (all tools)
 */
export function wrapToolsForDeepSeek(
  tools: StructuredToolInterface[]
): StructuredToolInterface[] {
  return tools.map((tool) => {
    // Clone tool with modified description
    // Use Object.assign to preserve prototype chain and all properties
    return Object.assign(Object.create(Object.getPrototypeOf(tool)), tool, {
      description: tool.description + DEEPSEEK_REMINDER,
    });
  });
}
