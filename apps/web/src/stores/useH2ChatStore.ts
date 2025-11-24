/**
 * H2 Chat Store
 *
 * Zustand store for managing H2 chat state.
 * Handles messages, streaming, progress, and connection state.
 */

import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type {
  ChatMessage,
  ProgressState,
  ToolExecutionState,
  H2SessionState,
  AllowedToken,
  ToolMessage,
  ToolStep,
  AnyMessage,
  SSEConnectionState,
} from "@/lib/h2/types";
import type { RawTokenBalance } from "@pragma/core/monorail/balances";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate readable parent description for batch operations
 * e.g., "getSwapQuote" → "Getting swap quotes"
 */
function getReadableParentDescription(toolName: string, count: number): string {
  const baseDescriptions: Record<string, string> = {
    getSwapQuote: 'Getting swap quotes',
    executeSwap: 'Executing swaps',
    getBalance: 'Checking balances',
    transfer: 'Transferring tokens',
    stake: 'Staking MON',
    unstakeRequest: 'Requesting unstakes',
    wrap: 'Wrapping MON',
    unwrap: 'Unwrapping WMON',
  };

  const base = baseDescriptions[toolName] || toolName;
  return `${base} (${count})`;
}

// ============================================================================
// Types
// ============================================================================

export interface H2ChatState {
  // Messages
  messages: AnyMessage[];
  streamingMessageId: string | null;

  // Progress
  progress: ProgressState;
  activeTools: Map<string, ToolExecutionState>;
  pendingSteps: Map<string, { toolName: string; message: string; description?: string }[]>;
  pendingSignatures: Map<string, string[]>; // toolName → signatures waiting for tool_start

  // Connection
  connectionState: SSEConnectionState;
  isStreaming: boolean;

  // Session
  quickMode: boolean;
  sessionData: H2SessionState | null;
  allowedTokens: AllowedToken[];
  tokensLoading: boolean;

  // Balance refresh
  balanceRefreshCallback: (() => void) | null;

  // Wallet balance
  monBalance: string;
  usdValue: number;
  change24h: number;
  allTokens: RawTokenBalance[];
  isLoadingBalance: boolean;
  isFetchingBalance: boolean;
  balanceError: string | null;

  // Authentication
  isTokenReady: boolean;

  // Actions
  addMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => void;
  updateMessageContent: (id: string, content: string) => void;
  setStreamingMessage: (id: string | null) => void;
  clearMessages: () => void;

  // Progress actions
  showProgress: (message: string, toolName?: string) => void;
  hideProgress: () => void;

  // Tool actions
  startTool: (toolName: string, signature?: string, description?: string) => void;
  addToolStep: (toolName: string, signature: string, stepMessage: string, description?: string) => void;
  completeTool: (toolName: string, signature: string, output?: unknown) => void;
  errorTool: (toolName: string, signature: string, error: string) => void;
  updateToolDescription: (signature: string, description: string) => void;
  clearTools: () => void;
  completeAllRunningTools: () => void;

  // Connection actions
  setConnectionState: (state: SSEConnectionState) => void;
  setIsStreaming: (isStreaming: boolean) => void;

  // Session actions
  setQuickMode: (enabled: boolean) => void;
  toggleQuickMode: () => void;
  setSessionData: (data: H2SessionState | null) => void;
  setAllowedTokens: (tokens: AllowedToken[]) => void;
  setTokensLoading: (loading: boolean) => void;

  // Balance refresh actions
  setBalanceRefreshCallback: (callback: (() => void) | null) => void;
  triggerBalanceRefresh: () => void;

  // Wallet balance actions
  setWalletBalance: (data: {
    monBalance: string;
    usdValue: number;
    change24h: number;
    allTokens: RawTokenBalance[];
  }) => void;
  setBalanceLoading: (isLoading: boolean) => void;
  setBalanceFetching: (isFetching: boolean) => void;
  setBalanceError: (error: string | null) => void;

  // Authentication actions
  setTokenReady: (ready: boolean) => void;
}

// ============================================================================
// Store
// ============================================================================

export const useH2ChatStore = create<H2ChatState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        messages: [],
        streamingMessageId: null,

        progress: {
          isVisible: false,
          message: "",
        },
        activeTools: new Map(),
        pendingSteps: new Map(),
        pendingSignatures: new Map(),

        connectionState: "disconnected",
        isStreaming: false,

        quickMode: false,
        sessionData: null,
        allowedTokens: [],
        tokensLoading: false,

        balanceRefreshCallback: null,

        // Wallet balance initial state
        monBalance: '0',
        usdValue: 0,
        change24h: 0,
        allTokens: [],
        isLoadingBalance: true,
        isFetchingBalance: false,
        balanceError: null,

        // Authentication initial state
        isTokenReady: false,

        // Message actions
        addMessage: (message) => {
          const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const newMessage: ChatMessage = {
            ...message,
            id,
            timestamp: Date.now(),
          };

          set((state) => ({
            messages: [...state.messages, newMessage],
          }));
        },

        updateMessageContent: (id, content) => {
          set((state) => ({
            messages: state.messages.map((msg) =>
              msg.id === id ? { ...msg, content } : msg
            ),
          }));
        },

        setStreamingMessage: (id) => {
          set({ streamingMessageId: id });

          if (id) {
            // Mark message as streaming
            set((state) => ({
              messages: state.messages.map((msg) =>
                msg.id === id ? { ...msg, isStreaming: true } : msg
              ),
            }));
          } else {
            // Remove streaming flag from all messages
            set((state) => ({
              messages: state.messages.map((msg) => ({
                ...msg,
                isStreaming: false,
              })),
            }));
          }
        },

        clearMessages: () => {
          set({
            messages: [],
            streamingMessageId: null,
            progress: { isVisible: false, message: "" },
            activeTools: new Map(),
          });
        },

        // Progress actions
        showProgress: (message, toolName) => {
          set({
            progress: {
              isVisible: true,
              message,
              toolName,
            },
          });
        },

        hideProgress: () => {
          set({
            progress: {
              isVisible: false,
              message: "",
            },
          });
        },

        // Tool actions
        startTool: (toolName, signature, description) => {
          // Use single functional update to ensure each call sees accumulated state
          // This prevents race conditions when multiple tools start in rapid succession
          set((state) => {
            // If no signature provided, look up from pending signatures
            // This handles the case where progress events arrive before tool_start
            const pendingSignatures = new Map(state.pendingSignatures);
            let resolvedSignature = signature;
            if (!signature) {
              const pendingSigs = pendingSignatures.get(toolName);
              if (pendingSigs && pendingSigs.length > 0) {
                resolvedSignature = pendingSigs.shift(); // Take first pending signature
                pendingSignatures.set(toolName, pendingSigs);
              }
            }

            // Track in activeTools using signature as key for uniqueness
            const activeTools = new Map(state.activeTools);
            const toolKey = resolvedSignature || toolName;
            activeTools.set(toolKey, {
              toolName,
              status: "running",
              startTime: Date.now(),
            });

            // Finalize current streaming message (if any)
            // This splits the assistant response so tool appears between parts
            let messages = state.messages;
            let streamingMessageId = state.streamingMessageId;

            if (streamingMessageId) {
              messages = messages.map((msg) =>
                msg.id === streamingMessageId ? { ...msg, isStreaming: false } : msg
              );
              streamingMessageId = null; // Clear so next tokens create new message
            }

            // Create tool message
            const id = `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Check for pending steps that arrived before this tool started
            const pendingSteps = new Map(state.pendingSteps);
            const pending = resolvedSignature ? pendingSteps.get(resolvedSignature) : undefined;
            const initialSteps: ToolStep[] = pending
              ? pending.map((p, idx) => ({
                  id: `step-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
                  name: p.message,
                  status: "running" as const,
                }))
              : [];

            // Apply pending description if available (from first buffered progress event)
            const pendingDescription = pending?.find((p) => p.description)?.description;
            const finalDescription = pendingDescription || description;

            // Clear pending steps for this signature
            if (resolvedSignature && pending) {
              pendingSteps.delete(resolvedSignature);
            }

            const toolMessage: ToolMessage = {
              id,
              role: "tool",
              toolName,
              description: finalDescription,
              status: "running",
              steps: initialSteps,
              timestamp: Date.now(),
              signature: resolvedSignature, // Add signature for matching
            };

            // FIRST: Check for existing parent within batch window (10 seconds)
            // This handles late-arriving tools (3rd, 4th, etc.) joining their batch
            // Time window prevents joining old batches from previous user messages
            const BATCH_WINDOW_MS = 10000; // 10 seconds

            let existingParent = messages
              .filter(
                (msg) => {
                  const tool = msg as ToolMessage;
                  return (
                    msg.role === "tool" &&
                    tool.isParent &&
                    tool.toolName === toolName
                  );
                }
              )
              .sort((a, b) => {
                // Get most recent parent (in case multiple exist)
                const timeA = (a as ToolMessage).timestamp || 0;
                const timeB = (b as ToolMessage).timestamp || 0;
                return timeB - timeA;
              })[0] as ToolMessage | undefined;

            // Only join if parent was created within batch window
            if (existingParent) {
              const timeSinceCreation = Date.now() - (existingParent.timestamp || 0);
              if (timeSinceCreation > BATCH_WINDOW_MS) {
                existingParent = undefined; // Too old, don't join
              }
            }

            if (existingParent) {
              // Add new tool as child to existing parent
              return {
                messages: messages.map((msg) => {
                  if (msg.id === existingParent.id) {
                    const parent = msg as ToolMessage;
                    const newCount = (parent.children?.length || 0) + 1;
                    return {
                      ...parent,
                      children: [...(parent.children || []), toolMessage],
                      description: getReadableParentDescription(toolName, newCount),
                      status: "running", // Reopen parent if it was completed
                    };
                  }
                  return msg;
                }),
                activeTools,
                streamingMessageId,
                pendingSteps,
                pendingSignatures,
              };
            }

            // SECOND: Check for standalone running tools with same toolName
            // CRITICAL: Only batch genuinely parallel operations, not retries
            // Exclude tools that aren't children (standalone only, ignore parents)
            // CRITICAL: Exclude retries by checking signature equality
            // When swap fails mid-tx and AI retries, signatures will differ → no batching
            const runningToolsWithSameName = messages.filter(
              (msg) =>
                msg.role === "tool" &&
                !(msg as ToolMessage).isParent && // Exclude existing parents
                (msg as ToolMessage).toolName === toolName &&
                (msg as ToolMessage).status === "running" &&
                (msg as ToolMessage).signature !== signature // Exclude retries (different signatures)
            );

            if (runningToolsWithSameName.length > 0) {
              // Batch detected - create parent from first standalone + new tool
              const firstTool = runningToolsWithSameName[0] as ToolMessage;
              const parentId = `tool-parent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              const parentMessage: ToolMessage = {
                id: parentId,
                role: "tool",
                toolName,
                description: getReadableParentDescription(toolName, 2),
                status: "running",
                steps: [],
                timestamp: Date.now(),
                isParent: true,
                children: [firstTool, toolMessage],
              };

              // Replace first tool with parent containing both as children
              return {
                messages: messages.map((msg) =>
                  msg.id === firstTool.id ? parentMessage : msg
                ),
                activeTools,
                streamingMessageId,
                pendingSteps,
                pendingSignatures,
              };
            }

            // No batch - append tool message normally
            return {
              messages: [...messages, toolMessage],
              activeTools,
              streamingMessageId,
              pendingSteps,
              pendingSignatures,
            };
          });
        },

        addToolStep: (toolName, signature, stepMessage, description) => {
          set((state) => {
            let foundTool = false;

            const messages = state.messages.map((msg) => {
              if (msg.role === "tool") {
                const toolMsg = msg as ToolMessage;

                // Check if this is a parent with children
                if (toolMsg.isParent && toolMsg.children) {
                  // Find matching child by signature and add step to it
                  const updatedChildren = toolMsg.children.map((child) => {
                    if (child.signature === signature) {
                      foundTool = true;
                      const stepId = `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                      // Mark previous steps as completed
                      const updatedSteps = child.steps.map(s => ({
                        ...s,
                        status: "completed" as const,
                      }));

                      // Add new step as running
                      const newStep: ToolStep = {
                        id: stepId,
                        name: stepMessage,
                        status: "running",
                      };

                      return {
                        ...child,
                        steps: [...updatedSteps, newStep],
                      };
                    }
                    return child;
                  });

                  return {
                    ...toolMsg,
                    children: updatedChildren,
                  };
                }

                // Check if this is a standalone tool matching by signature
                if (toolMsg.signature === signature) {
                  foundTool = true;
                  const stepId = `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                  // Mark previous steps as completed
                  const updatedSteps = toolMsg.steps.map(s => ({
                    ...s,
                    status: "completed" as const,
                  }));

                  // Add new step as running
                  const newStep: ToolStep = {
                    id: stepId,
                    name: stepMessage,
                    status: "running",
                  };

                  return {
                    ...toolMsg,
                    steps: [...updatedSteps, newStep],
                  };
                }
              }
              return msg;
            });

            // If no tool found, buffer the step for later
            // This handles race condition where progress arrives before tool_start
            if (!foundTool) {
              const pendingSteps = new Map(state.pendingSteps);
              const existing = pendingSteps.get(signature) || [];
              pendingSteps.set(signature, [...existing, { toolName, message: stepMessage, description }]);

              // Also track this signature for the toolName so startTool can find it
              const pendingSignatures = new Map(state.pendingSignatures);
              const existingSigs = pendingSignatures.get(toolName) || [];
              // Only add if not already tracked (avoid duplicates from multiple progress events)
              if (!existingSigs.includes(signature)) {
                pendingSignatures.set(toolName, [...existingSigs, signature]);
              }

              return { messages, pendingSteps, pendingSignatures };
            }

            return { messages };
          });
        },

        completeTool: (toolName, signature, output) => {
          // Update activeTools
          const activeTools = new Map(get().activeTools);
          const toolKey = signature || toolName;
          const activeTool = activeTools.get(toolKey);
          if (activeTool) {
            activeTools.set(toolKey, {
              ...activeTool,
              status: "completed",
              output,
              endTime: Date.now(),
            });
            set({ activeTools });
          }

          // Update tool message - NO auto-delete
          set((state) => ({
            messages: state.messages.map((msg) => {
              if (msg.role === "tool") {
                const toolMsg = msg as ToolMessage;

                // Check if this is a parent with children
                if (toolMsg.isParent && toolMsg.children) {
                  // Find and complete matching child by signature
                  const updatedChildren = toolMsg.children.map((child) => {
                    if (child.signature === signature && child.status === "running") {
                      // Mark all steps as completed
                      const completedSteps = child.steps.map(s => ({
                        ...s,
                        status: "completed" as const,
                      }));

                      return {
                        ...child,
                        status: "completed" as const,
                        steps: completedSteps,
                        output,
                      };
                    }
                    return child;
                  });

                  // Check if all children are completed
                  const allChildrenCompleted = updatedChildren.every(
                    (child) => child.status === "completed"
                  );

                  return {
                    ...toolMsg,
                    children: updatedChildren,
                    status: allChildrenCompleted ? "completed" : toolMsg.status,
                  };
                }

                // Check if this is a standalone tool matching by signature
                if (toolMsg.signature === signature && toolMsg.status === "running") {
                  // Mark all steps as completed
                  const completedSteps = toolMsg.steps.map(s => ({
                    ...s,
                    status: "completed" as const,
                  }));

                  return {
                    ...toolMsg,
                    status: "completed",
                    steps: completedSteps,
                    output,
                  };
                }
              }
              return msg;
            }),
          }));
        },

        errorTool: (toolName, signature, error) => {
          // Update activeTools
          const activeTools = new Map(get().activeTools);
          const toolKey = signature || toolName;
          const activeTool = activeTools.get(toolKey);
          if (activeTool) {
            activeTools.set(toolKey, {
              ...activeTool,
              status: "error",
              error,
              endTime: Date.now(),
            });
            set({ activeTools });
          }

          // Update tool message
          set((state) => ({
            messages: state.messages.map((msg) => {
              if (msg.role === "tool") {
                const toolMsg = msg as ToolMessage;

                // Check if this is a parent with children
                if (toolMsg.isParent && toolMsg.children) {
                  // Find and error matching child by signature
                  const updatedChildren = toolMsg.children.map((child) => {
                    if (child.signature === signature && child.status === "running") {
                      return {
                        ...child,
                        status: "error" as const,
                        error,
                      };
                    }
                    return child;
                  });

                  // Check if all children are done (completed or error)
                  const allChildrenDone = updatedChildren.every(
                    (child) => child.status === "completed" || child.status === "error"
                  );

                  return {
                    ...toolMsg,
                    children: updatedChildren,
                    status: allChildrenDone ? "error" : toolMsg.status, // Parent errors if any child errors
                  };
                }

                // Check if this is a standalone tool matching by signature
                if (toolMsg.signature === signature && toolMsg.status === "running") {
                  return {
                    ...toolMsg,
                    status: "error",
                    error,
                  };
                }
              }
              return msg;
            }),
          }));
        },

        updateToolDescription: (signature, description) => {
          // Update tool description when resolved symbols are available
          // This is called when a tool emits its first progress with resolved description
          set((state) => ({
            messages: state.messages.map((msg) => {
              if (msg.role === "tool") {
                const toolMsg = msg as ToolMessage;

                // Check if this is a parent with children
                if (toolMsg.isParent && toolMsg.children) {
                  // Find and update matching child by signature
                  const updatedChildren = toolMsg.children.map((child) => {
                    if (child.signature === signature) {
                      return {
                        ...child,
                        description, // Update with resolved description
                      };
                    }
                    return child;
                  });

                  return {
                    ...toolMsg,
                    children: updatedChildren,
                  };
                }

                // Check if this is a standalone tool matching by signature
                if (toolMsg.signature === signature) {
                  return {
                    ...toolMsg,
                    description, // Update with resolved description
                  };
                }
              }
              return msg;
            }),
          }));
        },

        clearTools: () => {
          set({ activeTools: new Map() });
        },

        completeAllRunningTools: () => {
          // Mark all running tools as completed to prevent cross-message pollution
          set((state) => ({
            messages: state.messages.map((msg) => {
              if (msg.role === "tool") {
                const toolMsg = msg as ToolMessage;

                // Handle parent with children
                if (toolMsg.isParent && toolMsg.children && toolMsg.status === "running") {
                  const completedChildren = toolMsg.children.map((child) => ({
                    ...child,
                    status: "completed" as const,
                    steps: child.steps.map((s) => ({ ...s, status: "completed" as const })),
                  }));
                  return {
                    ...toolMsg,
                    status: "completed",
                    children: completedChildren,
                  };
                }

                // Handle standalone tool
                if (toolMsg.status === "running") {
                  return {
                    ...toolMsg,
                    status: "completed",
                    steps: toolMsg.steps.map((s) => ({ ...s, status: "completed" as const })),
                  };
                }
              }
              return msg;
            }),
            activeTools: new Map(), // Clear active tools
          }));
        },

        // Connection actions
        setConnectionState: (state) => {
          set({ connectionState: state });
        },

        setIsStreaming: (isStreaming) => {
          set({ isStreaming });
        },

        // Session actions
        setQuickMode: (enabled) => {
          set({ quickMode: enabled });
        },

        toggleQuickMode: () => {
          set((state) => ({ quickMode: !state.quickMode }));
        },

        setSessionData: (data) => {
          set({ sessionData: data });
        },

        setAllowedTokens: (tokens) => {
          console.log("[H2ChatStore] 💾 setAllowedTokens called:", {
            incomingCount: tokens?.length || 0,
            sample: tokens?.slice(0, 5).map(t => t.symbol),
          });
          set({ allowedTokens: tokens });
          console.log("[H2ChatStore] ✅ State updated, verifying:", {
            storedCount: get().allowedTokens.length,
            sample: get().allowedTokens.slice(0, 5).map(t => t.symbol),
          });
        },

        setTokensLoading: (loading) => {
          set({ tokensLoading: loading });
        },

        // Balance refresh actions
        setBalanceRefreshCallback: (callback) => {
          set({ balanceRefreshCallback: callback });
        },

        triggerBalanceRefresh: () => {
          const { balanceRefreshCallback } = get();
          if (balanceRefreshCallback) {
            balanceRefreshCallback();
          }
        },

        // Wallet balance actions
        setWalletBalance: (data) => {
          set({
            monBalance: data.monBalance,
            usdValue: data.usdValue,
            change24h: data.change24h,
            allTokens: data.allTokens,
            isLoadingBalance: false,
            isFetchingBalance: false,
            balanceError: null,
          });
        },

        setBalanceLoading: (isLoading) => {
          set({ isLoadingBalance: isLoading });
        },

        setBalanceFetching: (isFetching) => {
          set({ isFetchingBalance: isFetching });
        },

        setBalanceError: (error) => {
          set({
            balanceError: error,
            isLoadingBalance: false,
            isFetchingBalance: false,
          });
        },

        // Authentication actions
        setTokenReady: (ready) => {
          set({ isTokenReady: ready });
        },
      }),
      {
        name: "h2-chat-storage",
        partialize: (state) => ({
          // Only persist these fields
          quickMode: state.quickMode,
          sessionData: state.sessionData,
          allowedTokens: state.allowedTokens,
          // Don't persist: messages, tokensLoading (ephemeral state)
        }),
        onRehydrateStorage: () => {
          console.log("[H2ChatStore] 🔄 Starting localStorage hydration...");
          return (state, error) => {
            if (error) {
              console.error("[H2ChatStore] ❌ Hydration error:", error);
            } else {
              console.log("[H2ChatStore] ✅ Hydrated from localStorage:", {
                quickMode: state?.quickMode,
                hasSessionData: !!state?.sessionData,
                allowedTokensCount: state?.allowedTokens?.length || 0,
                tokensSample: state?.allowedTokens?.slice(0, 5).map((t: { symbol?: string }) => t.symbol) || [],
              });
            }
          };
        },
      }
    ),
    { name: "H2ChatStore" }
  )
);

// ============================================================================
// Selectors
// ============================================================================

/**
 * Get user messages only
 */
export const selectUserMessages = (state: H2ChatState) =>
  state.messages.filter((msg) => msg.role === "user");

/**
 * Get assistant messages only
 */
export const selectAssistantMessages = (state: H2ChatState) =>
  state.messages.filter((msg) => msg.role === "assistant");

/**
 * Get last message
 */
export const selectLastMessage = (state: H2ChatState) =>
  state.messages[state.messages.length - 1];

/**
 * Get currently streaming message
 */
export const selectStreamingMessage = (state: H2ChatState) =>
  state.messages.find((msg) => msg.id === state.streamingMessageId);

/**
 * Check if agent is busy
 */
export const selectIsAgentBusy = (state: H2ChatState) =>
  state.isStreaming || state.connectionState === "connecting" || state.connectionState === "reconnecting";

/**
 * Get active tool count
 */
export const selectActiveToolCount = (state: H2ChatState) =>
  state.activeTools.size;

/**
 * Check if any tools are running
 */
export const selectHasActiveTools = (state: H2ChatState) =>
  Array.from(state.activeTools.values()).some((tool) => tool.status === "running");
