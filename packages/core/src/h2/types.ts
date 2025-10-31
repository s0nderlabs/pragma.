/**
 * H2 Agent Types
 *
 * Type definitions for the H2 LangChain-powered agent system.
 */

import type { Address } from "viem";

// ============================================================================
// Execution Modes
// ============================================================================

export type ExecutionMode = "normal" | "yolo";

export interface AgentContext {
  userAddress: Address;
  mode: ExecutionMode;
  conversationId: string;
}

// ============================================================================
// Tool Types
// ============================================================================

export interface ToolArtifact {
  calldata?: `0x${string}`;
  to?: Address;
  value?: bigint;
  [key: string]: unknown;
}

export interface ToolResult {
  content: string;
  artifact?: ToolArtifact;
}

// ============================================================================
// Quote Types
// ============================================================================

export interface Quote {
  id: string;
  type: "swap" | "transfer" | "wrap" | "unwrap" | "multi";

  // Tokens involved
  fromToken?: {
    symbol: string;
    address: Address;
    amount: string;
    decimals: number;
  };
  toToken?: {
    symbol: string;
    address: Address;
    amount: string;
    decimals: number;
  };

  // Pricing info
  priceImpact?: string;
  route?: string[];

  // Fees
  protocolFee?: {
    amount: string;
    token: string;
  };
  gasEstimate?: string;

  // Execution data
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    calldata?: `0x${string}`;
  }>;

  // Metadata
  timestamp: number;
  expiresAt?: number;
}

// ============================================================================
// Stream Event Types
// ============================================================================

export type StreamEventType =
  | "ai_thinking"
  | "ai_response"
  | "tool_started"
  | "tool_progress"
  | "tool_completed"
  | "tool_error"
  | "tools_planned"
  | "quote_ready"
  | "execution_started"
  | "execution_complete"
  | "error";

export interface StreamEvent {
  type: StreamEventType;
  timestamp: number;
  data?: unknown;
  message?: string;
}

// ============================================================================
// Execution Results
// ============================================================================

export interface ExecutionResult {
  success: boolean;
  conversationId: string;
  messageId: string;
  receipt?: Receipt;
  quote?: Quote;
  error?: string;
}

export interface Receipt {
  id: string;
  type: "swap" | "transfer" | "wrap" | "unwrap" | "multi";
  status: "pending" | "confirmed" | "failed";

  // Transaction info
  txHash?: `0x${string}`;
  blockNumber?: bigint;
  gasUsed?: bigint;

  // Summary
  summary: string;
  details: {
    from?: string;
    to?: string;
    amount?: string;
    token?: string;
    [key: string]: unknown;
  };

  // Timestamps
  submittedAt: number;
  confirmedAt?: number;
}

// ============================================================================
// Mode-specific Parameters
// ============================================================================

export interface NormalModeParams {
  agent: unknown; // LangChain agent type
  userInput: string;
  conversationId: string;
  userAddress: Address;
  onProgress: (event: StreamEvent) => void;
}

export interface YoloModeParams {
  agent: unknown;
  userInput: string;
  conversationId: string;
  userAddress: Address;
  onProgress: (event: StreamEvent) => void;
}

export interface ConfirmParams {
  agent: unknown;
  conversationId: string;
  messageId: string;
  userAddress: Address;
  onProgress: (event: StreamEvent) => void;
}
