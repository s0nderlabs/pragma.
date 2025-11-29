/**
 * Agent Performance Metrics Collector
 *
 * Tracks timing for agent execution to identify performance bottlenecks.
 * Used to measure LLM processing time vs tool execution time.
 *
 * Timing Points:
 * - T0: User sends message (entry)
 * - T1: LLM request starts (streamEvents begins)
 * - T1a: First token received
 * - T2/T3: Tool execution start/end (per tool)
 * - T5: Agent completes
 */

export interface ToolExecution {
  name: string;
  signature?: string;
  t2_start: number;
  t3_end: number;
  duration: number;
}

export interface AgentMetrics {
  t0_entry: number;
  t1_llmStart: number;
  t1a_firstToken: number | null;
  toolExecutions: ToolExecution[];
  t5_complete: number;
}

export interface MetricsSummary {
  total: number;
  ttft: number | null;
  llmTime: number;
  toolTime: number;
  toolBreakdown: Array<{
    name: string;
    signature?: string;
    duration: number;
    percentage: string;
  }>;
  breakdown: {
    llmPercent: string;
    toolPercent: string;
  };
}

export interface MetricsCollector {
  markLLMStart: () => void;
  markFirstToken: () => void;
  markToolStart: (name: string, signature?: string) => void;
  markToolEnd: (name: string, signature?: string) => void;
  complete: () => AgentMetrics;
  getSummary: () => MetricsSummary;
  logSummary: () => void;
}

/**
 * Create a metrics collector for a single agent request
 */
export function createMetricsCollector(): MetricsCollector {
  const metrics: AgentMetrics = {
    t0_entry: Date.now(),
    t1_llmStart: 0,
    t1a_firstToken: null,
    toolExecutions: [],
    t5_complete: 0,
  };

  return {
    markLLMStart: () => {
      metrics.t1_llmStart = Date.now();
    },

    markFirstToken: () => {
      if (metrics.t1a_firstToken === null) {
        metrics.t1a_firstToken = Date.now();
      }
    },

    markToolStart: (name: string, signature?: string) => {
      metrics.toolExecutions.push({
        name,
        signature,
        t2_start: Date.now(),
        t3_end: 0,
        duration: 0,
      });
    },

    markToolEnd: (name: string, signature?: string) => {
      // Find the most recent tool with matching name/signature that hasn't ended
      const tool = metrics.toolExecutions.find(
        (t) =>
          t.name === name &&
          t.t3_end === 0 &&
          (signature === undefined || t.signature === signature)
      );
      if (tool) {
        tool.t3_end = Date.now();
        tool.duration = tool.t3_end - tool.t2_start;
      }
    },

    complete: () => {
      metrics.t5_complete = Date.now();
      return metrics;
    },

    getSummary: (): MetricsSummary => {
      const total = metrics.t5_complete - metrics.t0_entry;
      const ttft = metrics.t1a_firstToken
        ? metrics.t1a_firstToken - metrics.t0_entry
        : null;

      // Calculate total tool time (non-overlapping)
      // For simplicity, just sum durations (may overcount if tools run in parallel)
      const toolTime = metrics.toolExecutions.reduce(
        (sum, t) => sum + t.duration,
        0
      );

      // LLM time is everything except tool execution
      const llmTime = total - toolTime;

      return {
        total,
        ttft,
        llmTime,
        toolTime,
        toolBreakdown: metrics.toolExecutions.map((t) => ({
          name: t.name,
          signature: t.signature,
          duration: t.duration,
          percentage: total > 0 ? ((t.duration / total) * 100).toFixed(1) + "%" : "0%",
        })),
        breakdown: {
          llmPercent: total > 0 ? ((llmTime / total) * 100).toFixed(1) + "%" : "0%",
          toolPercent: total > 0 ? ((toolTime / total) * 100).toFixed(1) + "%" : "0%",
        },
      };
    },

    logSummary: () => {
      // Calculate metrics summary
      const total = metrics.t5_complete - metrics.t0_entry;
      const ttft = metrics.t1a_firstToken
        ? metrics.t1a_firstToken - metrics.t0_entry
        : null;
      const toolTime = metrics.toolExecutions.reduce(
        (sum, t) => sum + t.duration,
        0
      );
      const llmTime = total - toolTime;

      console.log("\n═══════════════════════════════════════════════════════");
      console.log("[AgentMetrics] Request Complete");
      console.log("═══════════════════════════════════════════════════════");
      console.log(`Total Time:          ${formatMs(total)}`);
      console.log(
        `Time to First Token: ${ttft ? formatMs(ttft) : "N/A"} ${ttft ? `(${((ttft / total) * 100).toFixed(1)}%)` : ""}`
      );
      console.log("");
      console.log(
        `LLM Processing:      ${formatMs(llmTime)} (${((llmTime / total) * 100).toFixed(1)}%)`
      );
      console.log(
        `Tool Execution:      ${formatMs(toolTime)} (${((toolTime / total) * 100).toFixed(1)}%)`
      );

      if (metrics.toolExecutions.length > 0) {
        console.log("");
        console.log("Tool Breakdown:");
        metrics.toolExecutions.forEach((t, i) => {
          const prefix = i === metrics.toolExecutions.length - 1 ? "└─" : "├─";
          const pct = ((t.duration / total) * 100).toFixed(1);
          const sig = t.signature ? ` [${t.signature}]` : "";
          console.log(
            `  ${prefix} ${t.name}${sig}: ${formatMs(t.duration)} (${pct}%)`
          );
        });
      }

      console.log("═══════════════════════════════════════════════════════\n");
    },
  };
}

/**
 * Format milliseconds for display
 */
function formatMs(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${ms}ms`;
}
