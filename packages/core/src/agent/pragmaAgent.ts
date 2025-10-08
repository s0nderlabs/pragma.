import { parseIntent } from "../intent/parser.js";
import type { AgentContext, AgentResponse, PragmaAgentConfig, AgentClarificationResult, AgentInsightResult } from "./types.js";

export class PragmaAgent {
  constructor(private readonly config: PragmaAgentConfig = {}) {}

  async respond(message: string, context: AgentContext): Promise<AgentResponse> {
    const outcome = parseIntent(message, context.delegation);

    if (outcome.type === "success") {
      return {
        type: "intent",
        intent: outcome.intent,
        warnings: outcome.warnings,
      };
    }

    if (outcome.type === "clarification") {
      if (!outcome.clarification.partialIntent.action && this.config.llmInsight) {
        const insight = await this.config.llmInsight(message, context);
        if (insight) {
          return insight;
        }
      }
      const clarification: AgentClarificationResult = {
        type: "clarification",
        clarification: outcome.clarification,
        warnings: outcome.warnings,
      };
      if (this.config.llmClarifier) {
        const clarified = await this.config.llmClarifier(message, context, clarification);
        if (clarified) {
          return clarified;
        }
      }
      return clarification;
    }

    if (outcome.type === "error") {
      return {
        type: "error",
        violations: outcome.violations,
        warnings: outcome.warnings,
      };
    }

    if (this.config.llmInsight) {
      const insight = await this.config.llmInsight(message, context);
      if (insight) return insight;
    }

    return {
      type: "insight",
      title: "Unhandled request",
      body: "The agent could not interpret the request. Please try rephrasing or provide additional details.",
    } satisfies AgentInsightResult;
  }
}
