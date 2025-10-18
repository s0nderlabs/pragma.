import { Agent, run } from "@openai/agents";
import OpenAI from "openai";

import type {
  AgentContext,
  AgentInsightResult,
  AgentResponse,
  AgentStreamingInsightResult,
  PragmaAgentConfig,
} from "./types.js";
import type { ClarificationQuestion } from "../intent/types.js";
import {
  buildTrendingTokensInsight,
  type TrendingTokensConfig,
} from "./tools.js";

const DEFAULT_PRIMARY_MODEL = "gpt-5-mini";
const DEFAULT_FALLBACK_MODEL = "gpt-5-nano";

const sanitizeText = (value: string): string =>
  value.replace(/\s+$/u, "").trim();

const extractTextOutput = (result: unknown): string => {
  const finalOutput = (result as { finalOutput?: unknown }).finalOutput;
  if (typeof finalOutput === "string") {
    return sanitizeText(finalOutput);
  }
  return "";
};

const runWithFallback = async (
  prompt: string,
  agents: Agent[]
): Promise<string> => {
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

  throw lastError instanceof Error ? lastError : new Error("LLM run failed");
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

const MASTER_INSTRUCTION = `You are the Pragma Agent. You power every Pragma surface (CLI, web, future integrations) where users speak in natural language only. Users control HybridDelegator smart accounts on the Monad testnet that rely on Delegation Toolkit (DTK) delegations (Safe or Normal mode) and Monorail infrastructure (aggregator, data API, pathfinder) for swaps, transfers, token data, and balances. Your responses must always:
- Honour delegation scope, call limits (Safe default 6/hour, Normal 12/day), TTL (Safe ≈1h, Normal ≈24h), and token allowlists. Never suggest actions outside the permitted set.
- Prefer deterministic execution paths: delegated swaps via Monorail aggregate, wrap/unwrap via WMON helpers, native transfers via DTK native scopes. If prerequisites (balances, approvals, quotes, delegation) are missing, explain the gap and the next step.
- Encourage safety: highlight low balances, pending expiries, or high slippage.
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
  options: OpenAiClarifierOptions = {}
): PragmaAgentConfig["llmClarifier"] => {
  const primaryAgent = new Agent({
    name: "Pragma Clarifier",
    model: options.primaryModel ?? DEFAULT_PRIMARY_MODEL,
    instructions: options.instructions ?? DEFAULT_CLARIFIER_INSTRUCTIONS,
  });

  const fallbackModel = options.fallbackModel ?? DEFAULT_FALLBACK_MODEL;
  const fallbackAgent =
    fallbackModel === primaryAgent.model
      ? undefined
      : new Agent({
          name: "Pragma Clarifier (fallback)",
          model: fallbackModel,
          instructions: options.instructions ?? DEFAULT_CLARIFIER_INSTRUCTIONS,
        });

  const usableAgents = [primaryAgent, fallbackAgent].filter(
    (agent): agent is Agent => Boolean(agent)
  );

  return async (input, context, partial): Promise<AgentResponse> => {
    if (usableAgents.length === 0) {
      return partial;
    }

    const questions = formatQuestions(partial.clarification.questions);
    const prompt = `User input:\n${input}\n\nDelegation mode: ${
      context.delegation.mode
    }\nAllowed tokens: ${formatAllowedTokens(context)}\nMissing information:\n${
      questions || "Not specified"
    }\n\nCompose the response in plain text.`;

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

const buildInsightPrompt = async (
  input: string,
  context: AgentContext,
  options: OpenAiInsightOptions
): Promise<string> => {
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
  const nativeInfo = `${
    context.delegation.nativeTokenSymbol ?? "MON"
  } (wrapped: ${context.delegation.wrappedNativeSymbol ?? "WMON"})`;

  return `User message:\n${input}\n\nDelegator: ${
    context.metadata?.delegator ?? "unknown"
  }\nMode: ${
    context.delegation.mode
  }\nAllowed tokens: ${allowedTokens}\nNative token info: ${nativeInfo}\n${
    trendingBlock ? `\n${trendingBlock}\n` : ""
  }`;
};

export const createOpenAiInsight = (
  options: OpenAiInsightOptions = {}
): PragmaAgentConfig["llmInsight"] => {
  const primaryAgent = new Agent({
    name: "Pragma Insight",
    model: options.primaryModel ?? DEFAULT_PRIMARY_MODEL,
    instructions: options.instructions ?? DEFAULT_INSIGHT_INSTRUCTIONS,
  });

  const fallbackModel = options.fallbackModel ?? DEFAULT_FALLBACK_MODEL;
  const fallbackAgent =
    fallbackModel === primaryAgent.model
      ? undefined
      : new Agent({
          name: "Pragma Insight (fallback)",
          model: fallbackModel,
          instructions: options.instructions ?? DEFAULT_INSIGHT_INSTRUCTIONS,
        });

  const usableAgents = [primaryAgent, fallbackAgent].filter(
    (agent): agent is Agent => Boolean(agent)
  );

  return async (input, context) => {
    if (usableAgents.length === 0) return undefined;

    const prompt = await buildInsightPrompt(input, context, options);

    try {
      const text = await runWithFallback(prompt, usableAgents);
      if (text.length === 0) {
        return undefined;
      }
      return {
        type: "insight",
        title: "Pragma Insight",
        body: text,
      } satisfies AgentInsightResult;
    } catch {
      return undefined;
    }
  };
};

export const createOpenAiInsightStreamer = (
  options: OpenAiInsightOptions = {}
): PragmaAgentConfig["llmInsightStream"] => {
  if (!process.env.OPENAI_API_KEY) {
    return async () => undefined;
  }

  const globalAny = globalThis as Record<string, unknown>;
  const clientFactory =
    typeof globalAny.__PRAGMA_OPENAI_CLIENT_FACTORY__ === "function"
      ? (globalAny.__PRAGMA_OPENAI_CLIENT_FACTORY__ as () => unknown)
      : undefined;

  const client = (clientFactory ? clientFactory() : new OpenAI()) as any;
  const primaryModel = options.primaryModel ?? DEFAULT_PRIMARY_MODEL;
  const fallbackModel = options.fallbackModel ?? DEFAULT_FALLBACK_MODEL;
  const firstChunkTimeoutMs = Number(
    process.env.PRAGMA_AGENT_STREAM_TIMEOUT_MS ?? 1200
  );

  const extractOutputText = (response: unknown): string => {
    if (!response || typeof response !== "object") return "";
    const candidate = (response as { output_text?: unknown }).output_text;
    if (typeof candidate === "string") return candidate;
    if (Array.isArray(candidate)) {
      return candidate.filter((value): value is string => typeof value === "string").join("");
    }
    const blocks = (response as { output?: Array<{ content?: Array<unknown> }> }).output;
    if (!Array.isArray(blocks)) return "";
    const pieces: string[] = [];
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const content = (block as { content?: Array<unknown> }).content;
      if (!Array.isArray(content)) continue;
      for (const entry of content) {
        if (!entry || typeof entry !== "object") continue;
        const maybe = entry as { text?: unknown; output_text?: unknown };
        if (typeof maybe.output_text === "string") {
          pieces.push(maybe.output_text);
        } else if (Array.isArray(maybe.output_text)) {
          pieces.push(
            maybe.output_text
              .filter((value): value is string => typeof value === "string")
              .join("")
          );
        } else if (typeof maybe.text === "string") {
          pieces.push(maybe.text);
        }
      }
    }
    return pieces.join("");
  };

  const attemptStream = async (
    model: string,
    input: string,
    context: AgentContext
  ): Promise<AgentStreamingInsightResult | undefined> => {
    const prompt = await buildInsightPrompt(input, context, options);
    const stream = await client.responses.stream({
      model,
      input: prompt,
    });

    const chunks: string[] = [];
    let aggregated = "";
    let streamError: unknown;

    const appendChunk = (chunk: string) => {
      if (!chunk) return;
      chunks.push(chunk);
      aggregated += chunk;
    };

    const appendFinalText = (text: string) => {
      if (!text) {
        return aggregated;
      }
      if (aggregated.length === 0) {
        appendChunk(text);
        return aggregated;
      }
      if (text.startsWith(aggregated)) {
        const remainder = text.slice(aggregated.length);
        appendChunk(remainder);
        return aggregated;
      }
      aggregated = text;
      chunks.length = 0;
      if (text.length > 0) {
        chunks.push(text);
      }
      return aggregated;
    };

    const generator = (async function* () {
      try {
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            const delta = event.delta ?? "";
            if (!delta) continue;
            appendChunk(delta);
            yield delta;
          }
        }
      } catch (error) {
        streamError = error;
        if (!aggregated.length) {
          throw error;
        }
      }
    })();

    const fallbackToNonStreaming = async (): Promise<string> => {
      const completion = await client.responses.create({
        model,
        input: prompt,
      });
      const text = extractOutputText(completion).trim();
      if (!text) {
        throw new Error("Insight generation returned no content");
      }
      appendFinalText(text);
      return aggregated;
    };

    return {
      type: "insight_stream",
      title: "Pragma Insight",
      stream: generator,
      collect: async () => {
        try {
          const final = await Promise.race([
            stream
              .finalResponse()
              .then((response: unknown) => ({ type: "final" as const, response }))
              .catch((error: unknown) => ({ type: "error" as const, error })),
            (async () => {
              if (firstChunkTimeoutMs <= 0) return undefined;
              await new Promise((resolve) => setTimeout(resolve, firstChunkTimeoutMs));
              return undefined;
            })(),
          ]);
          if (final && final.type === "error") {
            throw final.error;
          }
          if (final && final.type === "final") {
            const finalText = extractOutputText(final.response);
            if (finalText) {
              appendFinalText(finalText);
            }
          }
        } catch (error) {
          if (!aggregated.length) {
            try {
              return await fallbackToNonStreaming();
            } catch (fallbackError) {
              throw fallbackError ?? error;
            }
          }
          if (!streamError) {
            streamError = error;
          }
        }

        if (aggregated.length > 0) {
          return aggregated;
        }

        try {
          return await fallbackToNonStreaming();
        } catch (fallbackError) {
          throw fallbackError ?? streamError ?? new Error("Insight stream completed with no content");
        }
      },
    } satisfies AgentStreamingInsightResult;
  };

  return async (input, context) => {
    const primaryResult = await attemptStream(primaryModel, input, context);
    if (primaryResult) {
      return primaryResult;
    }

    if (fallbackModel && fallbackModel !== primaryModel) {
      const fallbackResult = await attemptStream(fallbackModel, input, context);
      if (fallbackResult) {
        return fallbackResult;
      }
    }

    return undefined;
  };
};
