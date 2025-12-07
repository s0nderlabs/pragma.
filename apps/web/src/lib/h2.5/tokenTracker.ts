/**
 * Token Tracker for Hallucination Detection
 *
 * Tracks message count and token usage per turn to identify
 * at what point the agent starts to hallucinate.
 *
 * Usage:
 * - tokenTracker.recordTurn(input, output, reasoning, messageCount)
 * - tokenTracker.reset() when starting new conversation
 *
 * Console output format:
 * [TokenTracker] Turn 1: { input: 1234, output: 567, reasoning: 892, context: 6234/128000, messages: 2 }
 */

// Base overhead calculated from actual source files:
// - System prompt (systemPromptDeepSeek.ts): 11,217 chars = ~2,805 tokens
// - Tool descriptions (36 tools): 4,557 chars = ~1,139 tokens
// - Tool schemas (parameters): 4,212 chars = ~1,053 tokens
// Total: ~5,000 tokens base overhead
const BASE_OVERHEAD_TOKENS = 5000;

// DeepSeek Reasoner context limit
const CONTEXT_LIMIT = 128000;

export interface TurnMetrics {
  turn: number;
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cumulativeInput: number;
  cumulativeOutput: number;
  cumulativeReasoning: number;
  estimatedContext: number;
  contextUtilization: number; // percentage
  messageCount: number;
}

class TokenTrackerImpl {
  private turns: TurnMetrics[] = [];

  /**
   * Record metrics for a completed turn
   */
  recordTurn(
    inputTokens: number,
    outputTokens: number,
    reasoningTokens: number,
    messageCount: number
  ): TurnMetrics {
    const turn = this.turns.length + 1;
    const prevTurn = this.turns[this.turns.length - 1];

    const cumulativeInput = (prevTurn?.cumulativeInput ?? 0) + inputTokens;
    const cumulativeOutput = (prevTurn?.cumulativeOutput ?? 0) + outputTokens;
    const cumulativeReasoning = (prevTurn?.cumulativeReasoning ?? 0) + reasoningTokens;

    // Estimated context = base overhead + all conversation tokens
    // Note: Reasoning tokens are output but not stored in history, so not counted in context
    const estimatedContext = BASE_OVERHEAD_TOKENS + cumulativeInput + cumulativeOutput;
    const contextUtilization = (estimatedContext / CONTEXT_LIMIT) * 100;

    const metrics: TurnMetrics = {
      turn,
      timestamp: Date.now(),
      inputTokens,
      outputTokens,
      reasoningTokens,
      cumulativeInput,
      cumulativeOutput,
      cumulativeReasoning,
      estimatedContext,
      contextUtilization,
      messageCount,
    };

    this.turns.push(metrics);

    // Console output for tracking
    console.log(`[TokenTracker] Turn ${turn}:`, {
      input: inputTokens,
      output: outputTokens,
      reasoning: reasoningTokens,
      context: `${estimatedContext.toLocaleString()}/${CONTEXT_LIMIT.toLocaleString()} (${contextUtilization.toFixed(1)}%)`,
      messages: messageCount,
    });

    // Warn if approaching context limit
    if (contextUtilization > 75) {
      console.warn(`[TokenTracker] ⚠️ Context at ${contextUtilization.toFixed(1)}% - hallucination risk increases`);
    }

    return metrics;
  }

  /**
   * Get all recorded turn metrics
   */
  getMetrics(): TurnMetrics[] {
    return [...this.turns];
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalTurns: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalReasoningTokens: number;
    totalTokens: number;
    avgInputPerTurn: number;
    avgOutputPerTurn: number;
  } {
    const lastTurn = this.turns[this.turns.length - 1];

    if (!lastTurn) {
      return {
        totalTurns: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalReasoningTokens: 0,
        totalTokens: 0,
        avgInputPerTurn: 0,
        avgOutputPerTurn: 0,
      };
    }

    return {
      totalTurns: lastTurn.turn,
      totalInputTokens: lastTurn.cumulativeInput,
      totalOutputTokens: lastTurn.cumulativeOutput,
      totalReasoningTokens: lastTurn.cumulativeReasoning,
      totalTokens: lastTurn.cumulativeInput + lastTurn.cumulativeOutput,
      avgInputPerTurn: Math.round(lastTurn.cumulativeInput / lastTurn.turn),
      avgOutputPerTurn: Math.round(lastTurn.cumulativeOutput / lastTurn.turn),
    };
  }

  /**
   * Reset tracker for new conversation
   */
  reset(): void {
    this.turns = [];
    console.log("[TokenTracker] Reset - starting new conversation tracking");
  }

  /**
   * Print summary to console
   */
  printSummary(): void {
    const summary = this.getSummary();
    console.log("[TokenTracker] Summary:", summary);
  }
}

// Singleton instance
export const tokenTracker = new TokenTrackerImpl();
