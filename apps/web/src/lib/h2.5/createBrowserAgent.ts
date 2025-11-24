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

import { createAgent } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { h2ToolRegistry } from '@pragma/core';
import { authenticatedFetch } from '@/lib/api/authenticatedFetch';

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
export function createBrowserAgent(config: BrowserAgentConfig): ReturnType<typeof createAgent> {
  // API key is optional now (proxy handles authentication)
  // No validation needed - proxy will handle errors

  // Validate polyfills loaded (Zone.js + AsyncLocalStorage)
  if (typeof window !== 'undefined') {
    // Check Zone.js
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (window as any).Zone === 'undefined') {
      throw new Error(
        'Zone.js polyfill not loaded! Import @/lib/polyfills before creating agent.'
      );
    }

    // Check AsyncLocalStorage polyfill
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (window as any).async_hooks === 'undefined' ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        !(window as any).async_hooks.AsyncLocalStorage) {
      throw new Error(
        'AsyncLocalStorage polyfill not loaded! Import @/lib/polyfills before creating agent.'
      );
    }

    console.log('[BrowserAgent] Polyfills verified ✓');
  }

  // Initialize ChatOpenAI model (routes through proxy for security)
  const model = new ChatOpenAI({
    model: config.model || 'gpt-5-mini',
    apiKey: config.apiKey || 'proxy-not-used', // Proxy doesn't validate
    streaming: config.streaming ?? true, // Enable streaming by default
    useResponsesApi: true, // Use OpenAI Responses API
    timeout: config.timeout || 60000, // 60 second timeout
    maxRetries: 2, // Retry failed requests
    configuration: {
      // Absolute URL required by OpenAI SDK's URL constructor
      baseURL: typeof window !== 'undefined'
        ? `${window.location.origin}/api/h2`
        : 'http://localhost:3000/api/h2',
      // Use authenticated fetch for JWT + signature authentication
      fetch: authenticatedFetch as typeof fetch,
    },
  });

  console.log('[BrowserAgent] Created ChatOpenAI model:', {
    model: config.model || 'gpt-5-mini',
    streaming: config.streaming ?? true,
  });

  // Create agent using LangChain 1.0 pattern (identical to server-side)
  const agent = createAgent({
    model,
    tools: [...h2ToolRegistry],
  });

  console.log('[BrowserAgent] Agent created with', h2ToolRegistry.length, 'tools');

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
  if (typeof window === 'undefined') {
    throw new Error('Browser agent requires window global (cannot run in SSR)');
  }

  // Check Zone.js
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (window as any).Zone === 'undefined') {
    throw new Error('Zone.js not loaded. Import @/lib/polyfills in your page component.');
  }

  // Check AsyncLocalStorage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (window as any).async_hooks === 'undefined') {
    throw new Error('async_hooks polyfill not loaded. Import @/lib/polyfills in your page component.');
  }

  // Check Web APIs needed by viem
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto API not available. Use HTTPS or modern browser.');
  }

  console.log('[BrowserAgent] Environment validation passed ✓');
}
