import type { DelegationContext, ClarificationRequest, PolicyViolation, CanonicalIntent, IntentMeta } from "../intent/types.js";

export interface AgentContext {
  delegation: DelegationContext;
  metadata?: Record<string, unknown>;
}

export interface AgentIntentResult {
  type: "intent";
  intent: CanonicalIntent;
  warnings: string[];
  meta?: IntentMeta;
}

export interface AgentClarificationResult {
  type: "clarification";
  clarification: ClarificationRequest;
  warnings: string[];
}

export interface AgentErrorResult {
  type: "error";
  violations: PolicyViolation[];
  warnings: string[];
}

export interface AgentInsightResult {
  type: "insight";
  title: string;
  body: string;
}

export interface AgentStreamingInsightResult {
  type: "insight_stream";
  title: string;
  stream: AsyncIterable<string>;
  collect: () => Promise<string>;
}

export type AgentResponse =
  | AgentIntentResult
  | AgentClarificationResult
  | AgentErrorResult
  | AgentInsightResult
  | AgentStreamingInsightResult;

export interface PragmaAgentConfig {
  llmClarifier?: (
    input: string,
    context: AgentContext,
    partial: AgentClarificationResult,
  ) => Promise<AgentResponse | undefined>;
  llmInsight?: (input: string, context: AgentContext) => Promise<AgentInsightResult | undefined>;
  llmInsightStream?: (
    input: string,
    context: AgentContext,
  ) => Promise<AgentStreamingInsightResult | undefined>;
}
