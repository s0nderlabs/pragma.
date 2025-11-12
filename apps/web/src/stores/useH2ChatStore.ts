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
} from "@/lib/h2/types";
import type { SSEConnectionState } from "@/lib/h2/sseClient";

// ============================================================================
// Types
// ============================================================================

export interface H2ChatState {
  // Messages
  messages: ChatMessage[];
  streamingMessageId: string | null;

  // Progress
  progress: ProgressState;
  activeTools: Map<string, ToolExecutionState>;

  // Connection
  connectionState: SSEConnectionState;
  isStreaming: boolean;

  // Session
  quickMode: boolean;
  sessionData: H2SessionState | null;
  allowedTokens: AllowedToken[];
  tokensLoading: boolean;

  // Actions
  addMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => void;
  updateMessageContent: (id: string, content: string) => void;
  setStreamingMessage: (id: string | null) => void;
  clearMessages: () => void;

  // Progress actions
  showProgress: (message: string, toolName?: string) => void;
  hideProgress: () => void;

  // Tool actions
  startTool: (toolName: string) => void;
  completeTool: (toolName: string, output?: unknown) => void;
  errorTool: (toolName: string, error: string) => void;
  clearTools: () => void;

  // Connection actions
  setConnectionState: (state: SSEConnectionState) => void;
  setIsStreaming: (isStreaming: boolean) => void;

  // Session actions
  setQuickMode: (enabled: boolean) => void;
  toggleQuickMode: () => void;
  setSessionData: (data: H2SessionState | null) => void;
  setAllowedTokens: (tokens: AllowedToken[]) => void;
  setTokensLoading: (loading: boolean) => void;
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

        connectionState: "disconnected",
        isStreaming: false,

        quickMode: false,
        sessionData: null,
        allowedTokens: [],
        tokensLoading: false,

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
        startTool: (toolName) => {
          const tools = new Map(get().activeTools);
          tools.set(toolName, {
            toolName,
            status: "running",
            startTime: Date.now(),
          });
          set({ activeTools: tools });
        },

        completeTool: (toolName, output) => {
          const tools = new Map(get().activeTools);
          const tool = tools.get(toolName);
          if (tool) {
            tools.set(toolName, {
              ...tool,
              status: "completed",
              output,
              endTime: Date.now(),
            });
            set({ activeTools: tools });

            // Remove from active tools after a delay
            setTimeout(() => {
              set((state) => {
                const newTools = new Map(state.activeTools);
                newTools.delete(toolName);
                return { activeTools: newTools };
              });
            }, 3000); // Keep for 3 seconds to show completion state
          }
        },

        errorTool: (toolName, error) => {
          const tools = new Map(get().activeTools);
          const tool = tools.get(toolName);
          if (tool) {
            tools.set(toolName, {
              ...tool,
              status: "error",
              error,
              endTime: Date.now(),
            });
            set({ activeTools: tools });
          }
        },

        clearTools: () => {
          set({ activeTools: new Map() });
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
