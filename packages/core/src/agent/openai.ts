import { Agent, run } from "@openai/agents";

import type { AgentContext, AgentInsightResult, AgentResponse, PragmaAgentConfig } from "./types.js";
import type { ClarificationQuestion } from "../intent/types.js";
import { buildTrendingTokensInsight, type TrendingTokensConfig } from "./tools.js";

const DEFAULT_PRIMARY_MODEL = "gpt-5-mini";
const DEFAULT_FALLBACK_MODEL = "gpt-5-nano";

const sanitizeText = (value: string): string => value.replace(/\s+$/u, "").trim();

const extractTextOutput = (result: unknown): string => {
  const finalOutput = (result as { finalOutput?: unknown }).finalOutput;
  if (typeof finalOutput === "string") {
    return sanitizeText(finalOutput);
  }
  return "";
};

const runWithFallback = async (prompt: string, agents: Agent[]): Promise<string> => {
  let lastError: unknown;
  for (const agent of agents) {
    try {
      const result = await run(agent, prompt);
      const text = extractTextOutput(result);
      if (text.length > 0) {
        return text;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw (lastError instanceof Error ? lastError : new Error("LLM run failed"));
};

const formatQuestions = (questions: ClarificationQuestion[]): string =>
  questions
    .map((question, index) => `${index + 1}. ${question.prompt}`)
    .join("\n");

const formatAllowedTokens = (context: AgentContext): string => {
  const tokens = context.delegation.allowedTokens ?? [];
  if (tokens.length === 0) return "None recorded";
  const joined = tokens
    .slice(0, 16)
    .map((token) => token.symbol ?? token.address.slice(0, 6))
    .join(", ");
  return tokens.length > 16 ? `${joined}, …` : joined;
};

export interface OpenAiClarifierOptions {
  primaryModel?: string;
  fallbackModel?: string;
  instructions?: string;
}

const MASTER_INSTRUCTION = `You are the Pragma AI Agent. You power every Pragma surface (CLI, web, future integrations) where users speak in natural language only. Users control HybridDelegator smart accounts on the Monad testnet that rely on Delegation Toolkit (DTK) delegations (Safe or Normal mode) and Monorail infrastructure (aggregator, data API, pathfinder) for swaps, transfers, token data, and balances. Your responses must always:
- Honour delegation scope, call limits (Safe default 6/hour, Normal 12/day), TTL (Safe ≈1h, Normal ≈24h), and token allowlists. Never suggest actions outside the permitted set.
- Prefer deterministic execution paths: delegated swaps via Monorail aggregate, wrap/unwrap via WMON helpers, native transfers via DTK native scopes. If prerequisites (balances, approvals, quotes, delegation) are missing, explain the gap and the next step.
- Encourage safety: highlight low balances, pending expiries, or high slippage, and remind users MON liquidity on testnet is scarce.
- Produce concise, accurate insight drawn from Pragma docs (./docs), Monorail data, and other reputable crypto/web3 sources. You may browse those sources when needed but must never fabricate information.
- Keep replies ≤180 words with short paragraphs or bullet lists, and use exact token symbols/addresses from the allowlist.
- Make it clear when information is unavailable or speculative.
- Avoid referencing shell/meta commands; all interactions remain natural language. If asked for status (balances, delegations, trending tokens), answer directly instead of instructing the user to run a command.`;

const DEFAULT_CLARIFIER_INSTRUCTIONS = `${MASTER_INSTRUCTION}

Clarification focus:
- Identify the exact parameters missing for the requested action (amount, token, recipient, slippage, deadline, etc.).
- Open with a one-sentence summary of what is missing, followed by a bullet list (≤3 bullets) describing what the user should supply next.
- Provide one concrete example phrased as a natural-language request (not a CLI command).
- If the requested action is unsafe or impossible under the current delegation, state the reason and suggest a safe alternative.
- Keep the entire clarification ≤130 words.`;

export const createOpenAiClarifier = (
  options: OpenAiClarifierOptions = {},
): PragmaAgentConfig["llmClarifier"] => {
  const primaryAgent = new Agent({
    name: "Pragma Clarifier",
    model: options.primaryModel ?? DEFAULT_PRIMARY_MODEL,
    instructions: options.instructions ?? DEFAULT_CLARIFIER_INSTRUCTIONS,
  });

  const fallbackModel = options.fallbackModel ?? DEFAULT_FALLBACK_MODEL;
  const fallbackAgent = fallbackModel === primaryAgent.model
    ? undefined
    : new Agent({
        name: "Pragma Clarifier (fallback)",
        model: fallbackModel,
        instructions: options.instructions ?? DEFAULT_CLARIFIER_INSTRUCTIONS,
      });

  const usableAgents = [primaryAgent, fallbackAgent].filter((agent): agent is Agent => Boolean(agent));

  return async (input, context, partial): Promise<AgentResponse> => {
    if (usableAgents.length === 0) {
      return partial;
    }

    const questions = formatQuestions(partial.clarification.questions);
    const prompt = `User input:\n${input}\n\nDelegation mode: ${context.delegation.mode}\nAllowed tokens: ${formatAllowedTokens(context)}\nMissing information:\n${questions || "Not specified"}\n\nCompose the response in plain text.`;

    try {
      const text = await runWithFallback(prompt, usableAgents);
      if (text.length === 0) {
        return partial;
      }
      return {
        type: "insight",
        title: "Need more details",
        body: text,
      } satisfies AgentInsightResult;
    } catch {
      return partial;
    }
  };
};

export interface OpenAiInsightOptions {
  primaryModel?: string;
  fallbackModel?: string;
  instructions?: string;
  trendingConfig?: TrendingTokensConfig;
}

const DEFAULT_INSIGHT_INSTRUCTIONS = `${MASTER_INSTRUCTION}

Insight focus:
- Answer educational or exploratory questions about Pragma, Monad, delegations, Monorail tokens, or related crypto/web3 topics.
- If the user asks for data you can retrieve (balances, delegation details, trending tokens), source it via the provided APIs and summarise the results; otherwise, explain how they can obtain it.
- When execution is requested implicitly, restate the intent and confirm prerequisites before acting.
- Where relevant, reference the authoritative docs section or data source you relied on.
- Maintain a neutral, professional tone and avoid speculation beyond documented behaviour.`;

export const createOpenAiInsight = (
  options: OpenAiInsightOptions = {},
): PragmaAgentConfig["llmInsight"] => {
  const primaryAgent = new Agent({
    name: "Pragma Insight",
    model: options.primaryModel ?? DEFAULT_PRIMARY_MODEL,
    instructions: options.instructions ?? DEFAULT_INSIGHT_INSTRUCTIONS,
  });

  const fallbackModel = options.fallbackModel ?? DEFAULT_FALLBACK_MODEL;
  const fallbackAgent = fallbackModel === primaryAgent.model
    ? undefined
    : new Agent({
        name: "Pragma Insight (fallback)",
        model: fallbackModel,
        instructions: options.instructions ?? DEFAULT_INSIGHT_INSTRUCTIONS,
      });

  const usableAgents = [primaryAgent, fallbackAgent].filter((agent): agent is Agent => Boolean(agent));

  return async (input, context) => {
    if (usableAgents.length === 0) return undefined;

    let trendingBlock = "";
    if (options.trendingConfig) {
      try {
        const insight = await buildTrendingTokensInsight(options.trendingConfig);
        trendingBlock = `Trending tokens according to Monorail data:\n${insight.body}`;
      } catch {
        trendingBlock = "Trending tokens unavailable (Monorail data API error).";
      }
    }

    const allowedTokens = formatAllowedTokens(context);
    const nativeInfo = `${context.delegation.nativeTokenSymbol ?? "MON"} (wrapped: ${context.delegation.wrappedNativeSymbol ?? "WMON"})`;

    const prompt = `User message:\n${input}\n\nDelegator: ${context.metadata?.delegator ?? "unknown"}\nMode: ${context.delegation.mode}\nAllowed tokens: ${allowedTokens}\nNative token info: ${nativeInfo}\n${trendingBlock ? `\n${trendingBlock}\n` : ""}`;

    try {
      const text = await runWithFallback(prompt, usableAgents);
      if (text.length === 0) {
        return undefined;
      }
      return {
        type: "insight",
        title: "Assistant insight",
        body: text,
      } satisfies AgentInsightResult;
    } catch {
      return undefined;
    }
  };
};
