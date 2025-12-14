/**
 * Browser Agent Factory (Client-Side LangChain)
 *
 * Creates Pragma H2 agent for execution in browser environment.
 * This is adapted from @pragma/core's createPragmaH2Agent for browser compatibility.
 *
 * Key Adaptations:
 * - No process.env access (API key passed as parameter)
 * - Works with Zone.js + AsyncLocalStorage polyfills
 * - Same tool registry and system prompt as server-side H2
 * - Direct Web3Auth bridge (no signature transport)
 *
 * Model Provider Selection (ENV-based):
 * - NEXT_PUBLIC_MODEL_PROVIDER=deepseek (default): DeepSeek V3.2 Reasoner
 * - NEXT_PUBLIC_MODEL_PROVIDER=kimi: Kimi K2 Thinking (Moonshot AI)
 * - NEXT_PUBLIC_MODEL_PROVIDER=grok: Grok 4.1 Fast Reasoning (xAI)
 * - NEXT_PUBLIC_MODEL_PROVIDER=openai: OpenAI gpt-5-mini
 *
 * Architecture:
 * ```
 * Browser Component (useH2.5Agent)
 *   ↓
 * createBrowserAgent({ apiKey, ... })
 *   ↓
 * LangChain Agent (with ChatOpenAI + tools)
 *   ↓
 * Tool Execution (executeSwap, etc)
 *   ↓
 * Direct Web3Auth Bridge (no network transport!)
 * ```
 */

import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { h2ToolRegistry, createLogger } from "@pragma/core";
import { authenticatedFetch } from "@/lib/api/authenticatedFetch";
import { wrapToolsForDeepSeek } from "./wrapToolsForDeepSeek";

const logger = createLogger("[BrowserAgent]");

/**
 * Browser agent configuration
 *
 * Unlike server-side agent, API key MUST be provided explicitly
 * (no environment variable fallback in browser for security).
 */
export interface BrowserAgentConfig {
  /**
   * OpenAI API key (OPTIONAL - proxy handles authentication)
   *
   * Security: API key is never sent from browser!
   * The proxy endpoint (/api/h2/chat) uses server-side OPENAI_API_KEY.
   *
   * You can pass any string here (e.g., 'proxy' or 'not-used').
   * The actual API key is stored server-side and never exposed to browser.
   */
  apiKey?: string;

  /**
   * Model to use (defaults to gpt-5-mini)
   *
   * Note: gpt-5-mini is specified by user, not gpt-4o-mini
   */
  model?: string;

  /**
   * Custom system prompt (optional, overrides Pragma default)
   */
  systemPrompt?: string;

  /**
   * Enable streaming for real-time updates (default: true)
   */
  streaming?: boolean;

  /**
   * Request timeout in milliseconds (default: 60000 = 60s)
   */
  timeout?: number;

  /**
   * Custom tools to use (optional, overrides default h2ToolRegistry)
   * Used by two-phase architecture to load only needed tools
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: any[];

  /**
   * Reasoning effort for gpt-5-mini (default: undefined = model default)
   * - "low": Fast, for simple operations
   * - "medium": Balanced, for moderate complexity
   * - "high": Thorough, for complex reasoning
   */
  reasoningEffort?: "low" | "medium" | "high";
}

/**
 * Create Pragma H2 agent for browser execution
 *
 * This factory creates a LangChain agent that runs entirely in the browser.
 * It uses the same tools and system prompt as server-side H2, but with
 * browser-specific adaptations.
 *
 * @param config - Browser agent configuration
 * @returns Configured LangChain agent (same interface as server-side)
 * @throws Error if API key is missing or polyfills not loaded
 *
 * @example
 * ```typescript
 * // In React component (after importing polyfills)
 * import '@/lib/polyfills';
 *
 * const agent = createBrowserAgent({
 *   apiKey: 'sk-...', // From proxy or secure source
 * });
 *
 * // Invoke with config (same as server-side)
 * const result = await agent.invoke({
 *   messages: [['user', 'swap 1 MON to USDC']],
 * }, {
 *   configurable: {
 *     userAddress,
 *     sessionData,
 *     publicClient,
 *     web3authBridge, // directWeb3AuthBridge instance
 *     // ...other context
 *   },
 * });
 * ```
 */
export function createBrowserAgent(
  config: BrowserAgentConfig
): ReturnType<typeof createAgent> {
  // API key is optional now (proxy handles authentication)
  // No validation needed - proxy will handle errors

  // Validate polyfills loaded (Zone.js + AsyncLocalStorage)
  if (typeof window !== "undefined") {
    // Check Zone.js
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (window as any).Zone === "undefined") {
      throw new Error(
        "Zone.js polyfill not loaded! Import @/lib/polyfills before creating agent."
      );
    }

    // Check AsyncLocalStorage polyfill
    if (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (window as any).async_hooks === "undefined" ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      !(window as any).async_hooks.AsyncLocalStorage
    ) {
      throw new Error(
        "AsyncLocalStorage polyfill not loaded! Import @/lib/polyfills before creating agent."
      );
    }
  }

  // Determine model provider from environment variable
  // Options: 'deepseek' (default), 'kimi', 'grok', 'openai'
  const modelProvider = process.env.NEXT_PUBLIC_MODEL_PROVIDER || "deepseek";
  const useDeepSeek = modelProvider === "deepseek";
  const useKimi = modelProvider === "kimi";
  const useGrok = modelProvider === "grok";

  // Log model selection for debugging
  logger.debug(`Using model provider: ${modelProvider}`);

  // Generate session-based conversation ID for reasoning_content state
  // This ID is generated ONCE per agent session and used for ALL requests
  // Required for multi-turn tool calling (proxy stores reasoning_content by conv ID)
  const conversationId = `conv-${Date.now()}-${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  // Initialize ChatOpenAI model (routes through proxy for security)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelConfig: Record<string, any> = useDeepSeek
    ? {
        // DeepSeek V3.2 Reasoner configuration
        model: "deepseek-reasoner",
        apiKey: config.apiKey || "proxy-not-used",
        streaming: config.streaming ?? true,
        timeout: config.timeout || 120000, // 120s (reasoning takes longer)
        maxRetries: 2,
        configuration: {
          baseURL:
            typeof window !== "undefined"
              ? `${window.location.origin}/api/deepseek/v1`
              : "http://localhost:3000/api/deepseek/v1",
          fetch: authenticatedFetch as typeof fetch,
          defaultHeaders: {
            "x-conversation-id": conversationId,
          },
        },
      }
    : useKimi
    ? {
        // Kimi K2 Thinking configuration (Moonshot AI)
        model: "kimi-k2-thinking-turbo",
        apiKey: config.apiKey || "proxy-not-used",
        streaming: config.streaming ?? true,
        timeout: config.timeout || 120000, // 120s (reasoning takes longer)
        maxRetries: 2,
        configuration: {
          baseURL:
            typeof window !== "undefined"
              ? `${window.location.origin}/api/kimi/v1`
              : "http://localhost:3000/api/kimi/v1",
          fetch: authenticatedFetch as typeof fetch,
          defaultHeaders: {
            "x-conversation-id": conversationId,
          },
        },
      }
    : useGrok
    ? {
        // Grok 4.1 Fast Reasoning configuration (xAI)
        // Best-in-class tool calling, 2M context, 50% lower hallucination
        // Note: Reasoning is encrypted (no visible thinking bubble)
        model: "grok-4-1-fast-reasoning",
        apiKey: config.apiKey || "proxy-not-used",
        streaming: config.streaming ?? true,
        timeout: config.timeout || 120000, // 120s for complex reasoning
        maxRetries: 2,
        configuration: {
          baseURL:
            typeof window !== "undefined"
              ? `${window.location.origin}/api/grok/v1`
              : "http://localhost:3000/api/grok/v1",
          fetch: authenticatedFetch as typeof fetch,
        },
      }
    : {
        // OpenAI gpt-5-mini configuration (Responses API)
        model: config.model || "gpt-5-mini",
        apiKey: config.apiKey || "proxy-not-used",
        streaming: config.streaming ?? true,
        useResponsesApi: true, // OpenAI Responses API (not Chat Completions)
        timeout: config.timeout || 60000, // 60s standard
        maxRetries: 2,
        // Use reasoning effort for OpenAI (DeepSeek has built-in reasoning)
        ...(config.reasoningEffort && {
          modelKwargs: { reasoning_effort: config.reasoningEffort },
        }),
        configuration: {
          baseURL:
            typeof window !== "undefined"
              ? `${window.location.origin}/api/h2`
              : "http://localhost:3000/api/h2",
          fetch: authenticatedFetch as typeof fetch,
        },
      };

  // Note: DeepSeek reasoner has built-in chain-of-thought (reasoning_content field)
  // OpenAI uses reasoning_effort model parameter

  const model = new ChatOpenAI(modelConfig);

  // Use custom tools if provided, otherwise use full registry
  let tools = config.tools || [...h2ToolRegistry];

  // For reasoning models (DeepSeek, Kimi): wrap tools with reminder text
  // This reinforces critical behaviors (text output + thinking summary)
  // Note: Grok has best-in-class tool calling and doesn't need wrapping
  if (useDeepSeek || useKimi) {
    tools = wrapToolsForDeepSeek(tools);
  }

  // Create agent using LangChain 1.0 pattern (identical to server-side)
  const agent = createAgent({
    model,
    tools,
  });

  return agent;
}

/**
 * Validate browser environment for agent execution
 *
 * Checks that all required polyfills and browser APIs are available.
 * Call this early (e.g., in hook initialization) to fail fast.
 *
 * @throws Error if environment is invalid for agent execution
 *
 * @example
 * ```typescript
 * // In useH2.5Agent hook
 * useEffect(() => {
 *   validateBrowserEnvironment();
 * }, []);
 * ```
 */
export function validateBrowserEnvironment(): void {
  // Check browser environment
  if (typeof window === "undefined") {
    throw new Error("Browser agent requires window global (cannot run in SSR)");
  }

  // Check Zone.js
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (window as any).Zone === "undefined") {
    throw new Error(
      "Zone.js not loaded. Import @/lib/polyfills in your page component."
    );
  }

  // Check AsyncLocalStorage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (window as any).async_hooks === "undefined") {
    throw new Error(
      "async_hooks polyfill not loaded. Import @/lib/polyfills in your page component."
    );
  }

  // Check Web APIs needed by viem
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error(
      "Web Crypto API not available. Use HTTPS or modern browser."
    );
  }
}
