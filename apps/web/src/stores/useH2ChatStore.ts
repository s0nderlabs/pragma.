/**
 * H2 Chat Store
 *
 * Zustand store for managing H2 chat state.
 * Handles messages, streaming, progress, and connection state.
 */

import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
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
  ReasoningSegment,
} from "@/lib/h2/types";
import type { RawTokenBalance } from "@pragma/core/monorail/balances";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map tool names to human-readable display names (Title Case)
 * Used for individual tool messages when no description is provided
 */
function getToolDisplayName(toolName: string): string {
  const displayNames: Record<string, string> = {
    // Session Key Management
    checkSessionKeyBalance: 'Checking Session Key Balance',
    fundSessionKey: 'Funding Session Key',
    getSessionKeyBalance: 'Getting Session Key Balance',
    getSessionKeyPrivateKey: 'Getting Session Key',
    withdrawSessionKeyBalance: 'Withdrawing Session Key Balance',

    // Balance & Account
    getAccountInfo: 'Getting Account Info',
    getAllBalances: 'Getting All Balances',
    getBalance: 'Getting Balance',
    getTokenInfo: 'Getting Token Info',
    listVerifiedTokens: 'Listing Verified Tokens',
    resolveName: 'Looking Up Address',

    // Swap
    getSwapQuote: 'Getting Swap Quote',
    executeSwap: 'Executing Swap',
    swap: 'Swapping Tokens',

    // Transfer
    transfer: 'Transferring Tokens',
    executeTransfer: 'Executing Transfer',

    // Wrap/Unwrap
    wrap: 'Wrapping MON',
    unwrap: 'Unwrapping WMON',
    executeWrap: 'Executing Wrap',
    executeUnwrap: 'Executing Unwrap',

    // Staking
    stake: 'Staking MON',
    unstakeRequest: 'Requesting Unstake',
    unstakeClaim: 'Claiming Unstake',
    checkUnstakeStatus: 'Checking Unstake Status',

    // Search & Docs (must match progress event descriptions)
    web_search: 'Web Search',
    searchProtocolDocs: 'Protocol Docs',
    search_protocol_docs: 'Protocol Docs',
    searchToolDocs: 'Searching Tool Docs',
    search_tool_docs: 'Searching Tool Docs',

    // Special
    vibetrading: 'Vibe Trading',
  };

  return displayNames[toolName] || toolName;
}

/**
 * Generate readable parent description for batch operations
 * e.g., "getSwapQuote" → "Getting Swap Quotes"
 */
function getReadableParentDescription(toolName: string, count: number): string {
  const batchDescriptions: Record<string, string> = {
    // Swap tools
    getSwapQuote: 'Getting Swap Quotes',
    executeSwap: 'Executing Swaps',
    // Balance/token tools
    getBalance: 'Checking Balances',
    getTokenInfo: 'Getting Token Info',
    resolveName: 'Resolving Names',
    // Transfer tools
    transfer: 'Transferring Tokens',
    // Staking tools
    stake: 'Staking MON',
    unstakeRequest: 'Requesting Unstakes',
    unstakeClaim: 'Claiming Unstaked MON',
    // Wrap tools
    wrap: 'Wrapping MON',
    unwrap: 'Unwrapping WMON',
    // NFT tools
    transferNFT: 'Transferring NFTs',
    getNFTDetails: 'Getting NFT Details',
    getNFTActivity: 'Getting NFT Activity',
    getNFTBuyQuote: 'Getting NFT Quotes',
    executeNFTBuy: 'Buying NFTs',
    getCollectionInfo: 'Getting Collection Info',
    getTopCollections: 'Getting Collections',
    // Activity tools
    getOnchainActivity: 'Getting Onchain Activity',
    explainTransaction: 'Analyzing Transactions',
    // Search tools (for parallel queries)
    web_search: 'Searching the Web',
    search_protocol_docs: 'Searching Protocol Docs',
  };

  const base = batchDescriptions[toolName] || getToolDisplayName(toolName);
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

  // Smart Account (runtime, not persisted)
  // Stores the smartAccount and bundlerClient from onboarding to preserve signer state
  // Critical: Must use the SAME instance for deployment and session key funding
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  smartAccount: any | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bundlerClient: any | null;

  // Defensive UX - Stop/Retry
  stoppedMessageIds: Set<string>;
  stoppedWithInFlightTxIds: Set<string>; // Messages that were stopped while tx in-flight
  earlyStopUserMessageId: string | null; // User message ID when stopped before assistant responds
  isAutoRetrying: boolean;
  exhaustedRetryMessageId: string | null; // Track specific message that exhausted retries
  lastUserMessageContent: string | null;

  // Negative feedback context injection
  negativeFeedbackContext: string | null;

  // In-flight transaction tracking (for stop button disclaimer)
  hasInFlightTransaction: boolean;

  // Actions
  addMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => void;
  updateMessageContent: (id: string, content: string) => void;
  setMessageRawToolOutput: (id: string, rawToolOutput: string) => void;
  updateMessageReasoning: (id: string, reasoningContent: string, reasoningDuration?: number) => void;
  addReasoningSegment: (id: string, content: string, duration?: number, summary?: string) => string;
  updateReasoningSegmentSummary: (segmentId: string, summary: string) => void;
  appendReasoningSegmentSummary: (segmentId: string, token: string) => void;
  setSegmentSummarizing: (segmentId: string, isSummarizing: boolean) => void;
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

  // Smart Account actions (runtime, not persisted)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSmartAccount: (account: any | null) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setBundlerClient: (client: any | null) => void;

  // Defensive UX actions
  markMessageAsStopped: (messageId: string) => void;
  markMessageAsStoppedWithInFlightTx: (messageId: string) => void;
  setEarlyStopUserMessageId: (messageId: string | null) => void;
  setIsAutoRetrying: (value: boolean) => void;
  setExhaustedRetryMessageId: (messageId: string | null) => void;
  setLastUserMessageContent: (content: string | null) => void;
  resetRetryState: () => void;
  deleteMessage: (messageId: string) => void;
  deleteMessagesAfterLastUser: () => void;
  deleteMessagesFromIndex: (index: number) => void;

  // Negative feedback context actions
  setNegativeFeedbackContext: (context: string | null) => void;

  // In-flight transaction actions
  setHasInFlightTransaction: (value: boolean) => void;
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

        // Smart Account initial state (runtime, NOT persisted)
        smartAccount: null,
        bundlerClient: null,

        // Defensive UX initial state
        stoppedMessageIds: new Set(),
        stoppedWithInFlightTxIds: new Set(),
        earlyStopUserMessageId: null,
        isAutoRetrying: false,
        exhaustedRetryMessageId: null,
        lastUserMessageContent: null,

        // Negative feedback context initial state
        negativeFeedbackContext: null,

        // In-flight transaction initial state
        hasInFlightTransaction: false,

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
              msg.id === id ? { ...msg, content, timestamp: Date.now() } : msg
            ),
          }));
        },

        setMessageRawToolOutput: (id, rawToolOutput) => {
          set((state) => ({
            messages: state.messages.map((msg) =>
              msg.id === id ? { ...msg, rawToolOutput } : msg
            ),
          }));
        },

        updateMessageReasoning: (id, reasoningContent, reasoningDuration) => {
          set((state) => ({
            messages: state.messages.map((msg) =>
              msg.id === id
                ? {
                    ...msg,
                    reasoningContent,
                    ...(reasoningDuration !== undefined && { reasoningDuration }),
                  }
                : msg
            ),
          }));
        },

        addReasoningSegment: (id, content, duration, summary) => {
          // Generate segment ID before set() so we can return it
          const segmentId = `seg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          set((state) => ({
            messages: state.messages.map((msg) => {
              if (msg.id !== id) return msg;
              const chatMsg = msg as ChatMessage;
              const newSegment: ReasoningSegment = {
                id: segmentId,
                content,
                duration,
                summary,
              };
              return {
                ...chatMsg,
                reasoningSegments: [...(chatMsg.reasoningSegments || []), newSegment],
              };
            }),
          }));
          return segmentId;
        },

        updateReasoningSegmentSummary: (segmentId, summary) => {
          set((state) => ({
            messages: state.messages.map((msg) => {
              const chatMsg = msg as ChatMessage;
              if (!chatMsg.reasoningSegments) return msg;

              // Find segment by ID across all messages
              const hasSegment = chatMsg.reasoningSegments.some(seg => seg.id === segmentId);
              if (!hasSegment) return msg;

              const updatedSegments = chatMsg.reasoningSegments.map((seg) =>
                seg.id === segmentId ? { ...seg, summary } : seg
              );

              return {
                ...chatMsg,
                reasoningSegments: updatedSegments,
              };
            }),
          }));
        },

        appendReasoningSegmentSummary: (segmentId, token) => {
          set((state) => ({
            messages: state.messages.map((msg) => {
              const chatMsg = msg as ChatMessage;
              if (!chatMsg.reasoningSegments) return msg;

              const hasSegment = chatMsg.reasoningSegments.some(seg => seg.id === segmentId);
              if (!hasSegment) return msg;

              const updatedSegments = chatMsg.reasoningSegments.map((seg) =>
                seg.id === segmentId
                  ? { ...seg, summary: (seg.summary || '') + token }
                  : seg
              );

              return {
                ...chatMsg,
                reasoningSegments: updatedSegments,
              };
            }),
          }));
        },

        setSegmentSummarizing: (segmentId, isSummarizing) => {
          set((state) => ({
            messages: state.messages.map((msg) => {
              const chatMsg = msg as ChatMessage;
              if (!chatMsg.reasoningSegments) return msg;

              const hasSegment = chatMsg.reasoningSegments.some(seg => seg.id === segmentId);
              if (!hasSegment) return msg;

              const updatedSegments = chatMsg.reasoningSegments.map((seg) =>
                seg.id === segmentId ? { ...seg, isSummarizing } : seg
              );

              return {
                ...chatMsg,
                reasoningSegments: updatedSegments,
              };
            }),
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
            // Check if signature is just the fallback (toolName only, no specifics)
            // This happens when generateSignatureFromInput couldn't parse the input
            // In that case, prefer pending signature from progress event (more reliable)
            const pendingSignatures = new Map(state.pendingSignatures);
            let resolvedSignature = signature;

            const isJustToolNameFallback = signature === toolName;
            const pendingSigs = pendingSignatures.get(toolName);

            // Use pending signature if: no signature provided OR signature is just the fallback
            if ((!signature || isJustToolNameFallback) && pendingSigs && pendingSigs.length > 0) {
              resolvedSignature = pendingSigs.shift(); // Take first pending signature
              pendingSignatures.set(toolName, pendingSigs);
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
            // Falls back to human-readable display name if no description provided
            const pendingDescription = pending?.find((p) => p.description)?.description;
            const finalDescription = pendingDescription || description || getToolDisplayName(toolName);

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

            // Helper to add step to a tool message
            const addStepToTool = (toolMsg: ToolMessage): ToolMessage => {
              // Skip duplicate step messages
              if (toolMsg.steps.some(s => s.name === stepMessage)) {
                foundTool = true;
                return toolMsg;
              }

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
            };

            // PASS 1: Try exact signature match (works for executeSwap with quoteId)
            let messages = state.messages.map((msg) => {
              if (msg.role === "tool") {
                const toolMsg = msg as ToolMessage;

                // Check if this is a parent with children
                if (toolMsg.isParent && toolMsg.children) {
                  const updatedChildren = toolMsg.children.map((child) => {
                    if (child.signature === signature && child.status === "running") {
                      return addStepToTool(child);
                    }
                    return child;
                  });

                  return {
                    ...toolMsg,
                    children: updatedChildren,
                  };
                }

                // Standalone tool matching by exact signature
                if (toolMsg.signature === signature && toolMsg.status === "running") {
                  return addStepToTool(toolMsg);
                }
              }
              return msg;
            });

            // PASS 2: If no exact match, fall back to toolName match
            // BUT ONLY if there's exactly ONE running tool with this name
            // AND that tool has been running long enough (not a parallel batch forming)
            // For parallel execution, skip to buffering to avoid stealing steps
            if (!foundTool) {
              // Count running tools with this toolName and find the single running tool's timestamp
              let runningCount = 0;
              let singleRunningTimestamp: number | undefined;
              const PARALLEL_BATCH_WINDOW_MS = 2000; // 2 second window for parallel batch detection

              for (const msg of state.messages) {
                if (msg.role === "tool") {
                  const toolMsg = msg as ToolMessage;
                  if (toolMsg.isParent && toolMsg.children) {
                    for (const child of toolMsg.children) {
                      if (child.toolName === toolName && child.status === "running") {
                        runningCount++;
                        singleRunningTimestamp = child.timestamp;
                      }
                    }
                  } else if (toolMsg.toolName === toolName && toolMsg.status === "running" && !toolMsg.isParent) {
                    runningCount++;
                    singleRunningTimestamp = toolMsg.timestamp;
                  }
                }
              }

              // Only use PASS 2 fallback if:
              // 1. Exactly ONE tool is running, AND
              // 2. That tool has been running for a while (not a fresh parallel batch)
              // If tool started recently, more parallel tools might be coming - skip to buffering
              const timeSinceStart = singleRunningTimestamp ? Date.now() - singleRunningTimestamp : Infinity;
              const isSafeForPass2 = runningCount === 1 && timeSinceStart > PARALLEL_BATCH_WINDOW_MS;

              if (isSafeForPass2) {
                messages = messages.map((msg) => {
                  if (foundTool) return msg; // Only update first matching tool
                  if (msg.role === "tool") {
                    const toolMsg = msg as ToolMessage;

                    // Check parent children by toolName
                    if (toolMsg.isParent && toolMsg.children) {
                      let childUpdated = false;
                      const updatedChildren = toolMsg.children.map((child) => {
                        if (!childUpdated && child.toolName === toolName && child.status === "running") {
                          childUpdated = true;
                          return addStepToTool(child);
                        }
                        return child;
                      });

                      if (childUpdated) {
                        return {
                          ...toolMsg,
                          children: updatedChildren,
                        };
                      }
                    }

                    // Standalone tool matching by toolName (first running tool wins)
                    if (toolMsg.toolName === toolName && toolMsg.status === "running") {
                      return addStepToTool(toolMsg);
                    }
                  }
                  return msg;
                });
              }
            }

            // If still no tool found, buffer the step for later
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
          set({ allowedTokens: tokens });
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

        // Smart Account actions (runtime, NOT persisted)
        setSmartAccount: (account) => {
          set({ smartAccount: account });
        },

        setBundlerClient: (client) => {
          set({ bundlerClient: client });
        },

        // Defensive UX actions
        markMessageAsStopped: (messageId) => {
          set((state) => ({
            stoppedMessageIds: new Set([...state.stoppedMessageIds, messageId]),
          }));
        },

        markMessageAsStoppedWithInFlightTx: (messageId) => {
          set((state) => ({
            stoppedWithInFlightTxIds: new Set([...state.stoppedWithInFlightTxIds, messageId]),
          }));
        },

        setEarlyStopUserMessageId: (messageId) => {
          set({ earlyStopUserMessageId: messageId });
        },

        setIsAutoRetrying: (value) => {
          set({ isAutoRetrying: value });
        },

        setExhaustedRetryMessageId: (messageId) => {
          set({ exhaustedRetryMessageId: messageId });
        },

        setLastUserMessageContent: (content) => {
          set({ lastUserMessageContent: content });
        },

        resetRetryState: () => {
          set({
            isAutoRetrying: false,
            exhaustedRetryMessageId: null,
          });
        },

        deleteMessage: (messageId) => {
          set((state) => ({
            messages: state.messages.filter((msg) => msg.id !== messageId),
            // Clear streaming ID if deleting the streaming message
            streamingMessageId: state.streamingMessageId === messageId ? null : state.streamingMessageId,
          }));
        },

        deleteMessagesAfterLastUser: () => {
          set((state) => {
            // Find index of last user message
            let lastUserIndex = -1;
            for (let i = state.messages.length - 1; i >= 0; i--) {
              if (state.messages[i].role === 'user') {
                lastUserIndex = i;
                break;
              }
            }

            // No user messages found, return unchanged
            if (lastUserIndex === -1) return state;

            // Keep messages up to and including last user message
            // This deletes all tool messages and assistant messages after the last user message
            return {
              messages: state.messages.slice(0, lastUserIndex + 1),
              streamingMessageId: null,
            };
          });
        },

        deleteMessagesFromIndex: (index) => {
          // Delete all messages from the given index onwards (inclusive)
          // Used for "Branch/Revert" retry: delete this turn + all subsequent turns
          set((state) => ({
            messages: state.messages.slice(0, index),
            streamingMessageId: null,
          }));
        },

        // Negative feedback context action
        setNegativeFeedbackContext: (context) => {
          set({ negativeFeedbackContext: context });
        },

        // In-flight transaction action
        setHasInFlightTransaction: (value) => {
          set({ hasInFlightTransaction: value });
        },
      }),
      {
        name: "h2-chat-storage",
        storage: createJSONStorage(() => {
          if (typeof window === "undefined") {
            // Return a no-op storage for SSR to prevent hydration errors
            return {
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            };
          }
          return localStorage;
        }),
        partialize: (state) => ({
          // Only persist these fields
          quickMode: state.quickMode,
          sessionData: state.sessionData,
          allowedTokens: state.allowedTokens,
          // Don't persist: messages, tokensLoading (ephemeral state)
        }),
        onRehydrateStorage: () => {
          return (state, error) => {
            if (error) {
              console.error("[H2ChatStore] Hydration error:", error);
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

/**
 * Check if a message was stopped
 */
export const selectIsMessageStopped = (state: H2ChatState, messageId: string) =>
  state.stoppedMessageIds.has(messageId);

/**
 * Check if a message was stopped while a transaction was in-flight
 */
export const selectWasStoppedWithInFlightTx = (state: H2ChatState, messageId: string) =>
  state.stoppedWithInFlightTxIds.has(messageId);

/**
 * Get last user message content (for retry)
 */
export const selectLastUserMessage = (state: H2ChatState) =>
  [...state.messages].reverse().find((msg) => msg.role === "user");
