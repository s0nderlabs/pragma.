/**
 * H2 Agent Context
 *
 * Provides agent hook result to components via React Context.
 * Allows switching between H2 (server-side) and H2.5 (client-side) agents
 * without modifying child components.
 *
 * Architecture:
 * - H2 page: <AgentProvider hook={useH2Agent}><H2Layout /></AgentProvider>
 * - H2.5 page: <AgentProvider hook={useH2_5Agent}><H2Layout /></AgentProvider>
 * - ChatInput: const agent = useAgentContext() // Gets whichever agent was provided
 */

'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Send message options for retry functionality
 */
export interface SendMessageOptions {
  /** Current retry count for hallucination auto-retry (internal use) */
  retryCount?: number;
  /** Skip adding user message (for internal retries) */
  skipAddMessage?: boolean;
  /** Manual retry from MessageActions - inject instruction without showing in chat */
  isRetry?: boolean;
}

/**
 * Agent hook result type
 * Common interface between useH2Agent and useH2.5Agent
 */
export interface AgentHookResult {
  // State
  messages: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  isStreaming: boolean;
  quickMode: boolean;

  // Actions
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
  stopMessage?: () => void; // Stop current generation (H2.5 only)

  // Utility (optional, varies between implementations)
  isReady?: boolean;
  isInitialized?: boolean;
  initError?: string | null;
  isExecuting?: boolean;
  connectionState?: string;
  isConnected?: boolean;
  isDisconnected?: boolean;
  isReconnecting?: boolean;
  hasError?: boolean;
}

/**
 * Agent Context
 * Provides agent hook result to child components
 */
const H2AgentContext = createContext<AgentHookResult | null>(null);

/**
 * Agent Provider Props
 */
export interface AgentProviderProps {
  /** Agent hook to use (e.g., useH2Agent or useH2_5Agent) */
  hook: () => AgentHookResult;

  /** Child components */
  children: ReactNode;
}

/**
 * Agent Provider Component
 *
 * Wraps components and provides agent hook result via context.
 *
 * @example
 * ```tsx
 * // In /h2/page.tsx (server-side agent)
 * import { useH2Agent } from '@/hooks/useH2Agent';
 *
 * <AgentProvider hook={useH2Agent}>
 *   <H2Layout />
 * </AgentProvider>
 * ```
 *
 * @example
 * ```tsx
 * // In /h2.5/page.tsx (client-side agent)
 * import { useH2_5Agent } from '@/hooks/useH2.5Agent';
 *
 * <AgentProvider hook={useH2_5Agent}>
 *   <H2Layout />
 * </AgentProvider>
 * ```
 */
export function AgentProvider({ hook, children }: AgentProviderProps) {
  // Call the provided hook to get agent result
  const agentResult = hook();

  return (
    <H2AgentContext.Provider value={agentResult}>
      {children}
    </H2AgentContext.Provider>
  );
}

/**
 * Use Agent Context Hook
 *
 * Consumes agent from context. Must be used within AgentProvider.
 *
 * @returns Agent hook result
 * @throws Error if used outside AgentProvider
 *
 * @example
 * ```tsx
 * // In ChatInput.tsx
 * function ChatInput() {
 *   const { sendMessage, isStreaming } = useAgentContext();
 *   // ... use agent
 * }
 * ```
 */
export function useAgentContext(): AgentHookResult {
  const context = useContext(H2AgentContext);

  if (!context) {
    throw new Error(
      'useAgentContext must be used within an AgentProvider. ' +
      'Wrap your component tree with <AgentProvider hook={useH2Agent}> or similar.'
    );
  }

  return context;
}
