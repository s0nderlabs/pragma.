/**
 * H2 Web Types
 *
 * Shared type definitions for H2 web implementation.
 * Mirrors CLI session state but adapted for browser storage.
 */

import type { SignatureRequest } from "./signatureCoordinator";

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
 * SSE event types from API
 */
export interface SSETokenEvent {
  type: "token";
  content: string;
}

export interface SSEProgressEvent {
  type: "progress";
  message: string;
  toolName?: string;
  timestamp?: number;
}

export interface SSEToolStartEvent {
  type: "tool_start";
  toolName?: string;
}

export interface SSEToolEndEvent {
  type: "tool_end";
  toolName?: string;
  output?: unknown;
}

export interface SSEToolErrorEvent {
  type: "tool_error";
  toolName?: string;
  error?: string;
}

export interface SSESignatureRequestEvent {
  type: "signature_request";
  signatureRequest: SignatureRequest;
}

export interface SSEDoneEvent {
  type: "done";
}

export interface SSEErrorEvent {
  type: "error";
  error?: string;
}

export type SSEEvent =
  | SSETokenEvent
  | SSEProgressEvent
  | SSEToolStartEvent
  | SSEToolEndEvent
  | SSEToolErrorEvent
  | SSESignatureRequestEvent
  | SSEDoneEvent
  | SSEErrorEvent;

/**
 * Chat message for display
 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
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
