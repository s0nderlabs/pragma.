/**
 * Pragma H2 Agent
 *
 * Main agent orchestrator using LangChain 1.0's createAgent pattern.
 */

import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";

import { h2ToolRegistry } from "../tools/index.js";
import { PRAGMA_H2_SYSTEM_PROMPT } from "./systemPrompt.js";
import { createErrorFromCode } from "../../errors/index.js";

// ============================================================================
// Agent Configuration
// ============================================================================

export interface PragmaH2AgentConfig {
  /**
   * OpenAI API key (defaults to OPENAI_API_KEY_H2 env var)
   */
  apiKey?: string;

  /**
   * Model to use (defaults to gpt-5-mini)
   */
  model?: string;

  /**
   * Custom system prompt (optional, overrides default)
   */
  systemPrompt?: string;
}

// ============================================================================
// Agent Factory
// ============================================================================

/**
 * Create a new Pragma H2 agent instance.
 *
 * Uses LangChain 1.0's `createAgent` with:
 * - ChatOpenAI (gpt-5-mini by default)
 * - H2 tool registry (swap, transfer, wrap, unwrap)
 * - Pragma system prompt
 *
 * @param config - Optional configuration overrides
 * @returns Configured LangChain agent
 *
 * @example
 * ```ts
 * const agent = createPragmaH2Agent();
 *
 * const result = await agent.invoke({
 *   messages: [{ role: "user", content: "swap 1 ETH to USDC" }],
 * });
 * ```
 */
export function createPragmaH2Agent(config: PragmaH2AgentConfig = {}): ReturnType<typeof createAgent> {
  // Get API key from config or environment
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY_H2;

  if (!apiKey) {
    throw createErrorFromCode("CONFIG_MISSING", {
      message: "OpenAI API key is required. Set OPENAI_API_KEY_H2 environment variable or pass apiKey to config.",
      context: { provider: "OpenAI" },
    });
  }

  // Initialize ChatOpenAI model
  // IMPORTANT: Using gpt-5-mini as specified
  const model = new ChatOpenAI({
    model: config.model || "gpt-5-mini",
    apiKey,
    streaming: true, // Enable streaming for real-time updates
    useResponsesApi: true, // Use OpenAI Responses API instead of Chat Completions API
    timeout: 60000, // 60 second timeout to prevent hanging
    maxRetries: 2, // Retry failed requests to handle intermittent errors
  });

  // Create agent using LangChain 1.0 pattern
  // Note: System prompt will be prepended to messages when invoking
  return createAgent({
    model,
    tools: [...h2ToolRegistry],
  });
}

// ============================================================================
// Exports
// ============================================================================

export { createPragmaH2Agent as default };
