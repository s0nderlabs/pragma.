/**
 * H2 Web Types
 *
 * Shared type definitions for H2 web implementation.
 * Mirrors CLI session state but adapted for browser storage.
 */

/**
 * Session state stored in localStorage
 * Matches CLI SessionState structure for compatibility
 */
export interface H2SessionState {
  delegator?: `0x${string}`;
  requireOnboard?: boolean;
  // H2-specific fields
  sessionKeyAddress?: `0x${string}`;
  sessionKeyPrivateKey?: `0x${string}`;
  ownerAddress?: `0x${string}`;
  chainId?: number;
}

/**
 * Re-export AllowedToken from @pragma/core for type compatibility
 */
export type { AllowedToken } from "@pragma/core";

/**
 * Message tuple format for LangChain
 * [role, content]
 */
export type MessageTuple = [string, string];

/**
 * SSE connection state (moved from sseClient.ts)
 */
export type SSEConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

/**
 * Chat message for display
 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  /** Raw tool output preserved for rich component parsing (e.g., __nft_gallery__ markers) */
  rawToolOutput?: string;
}

/**
 * Progress indicator state
 */
export interface ProgressState {
  isVisible: boolean;
  message: string;
  toolName?: string;
}

/**
 * Tool execution state
 */
export interface ToolExecutionState {
  toolName: string;
  status: "running" | "completed" | "error";
  output?: unknown;
  error?: string;
  startTime: number;
  endTime?: number;
}

/**
 * Tool step for tree view (populated from progress events)
 */
export interface ToolStep {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "error";
  children?: ToolStep[];
  output?: unknown;
  error?: string;
}

/**
 * Tool message for display in chat
 */
export interface ToolMessage {
  id: string;
  role: "tool";
  toolName: string;
  description?: string; // Human-readable description (e.g., "Swapping 0.41 USDC to MON")
  status: "running" | "completed" | "error";
  steps: ToolStep[];
  timestamp: number;
  output?: unknown;
  error?: string;
  // Batch execution support
  signature?: string;        // Unique identifier from input (e.g., "MON-DAK" for swaps)
  children?: ToolMessage[];  // Child tools for parallel batch operations
  isParent?: boolean;        // Flag for visual grouping as parent container
}

/**
 * Union type for all message types
 */
export type AnyMessage = ChatMessage | ToolMessage;
