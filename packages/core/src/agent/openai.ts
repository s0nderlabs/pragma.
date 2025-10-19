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
  const native = context.delegation.nativeTokenSymbol ?? "MON";
  const wrapped = context.delegation.wrappedNativeSymbol ?? "WMON";

  // ALWAYS prepend native tokens so agent sees them as first-class
  const nativePrefix = `${native} (native - always available), ${wrapped} (wrapped native - always available)`;

  if (tokens.length === 0) return nativePrefix;

  const joined = tokens
    .slice(0, 14) // reduced from 16 to accommodate native tokens
    .map((token) => token.symbol ?? token.address.slice(0, 6))
    .join(", ");
  return tokens.length > 14 ? `${nativePrefix}, ${joined}, …` : `${nativePrefix}, ${joined}`;
};

export interface OpenAiClarifierOptions {
  primaryModel?: string;
  fallbackModel?: string;
  instructions?: string;
}

const MASTER_INSTRUCTION = `You are the Pragma Agent, powering natural-language interactions with Monad testnet HybridDelegator accounts. Users execute swaps, transfers, and wraps through delegations (Safe or Normal mode) using Monorail infrastructure.

PRAGMA SYSTEM KNOWLEDGE:
- CRITICAL CONTEXT: In this conversation, "pragma" and "monad" are BLOCKCHAIN TERMS ONLY:
  • "pragma" = pragma product (on-chain intent engine), NEVER compiler pragmas or programming directives
  • "monad" = Monad blockchain/testnet (chain ID 10143), NEVER functional programming monads or category theory
- pragma is an on-chain intent engine that understands your intent and turns it into on-chain actions.
- Built by s0nderlabs, led by founder elpabl0.eth. More info at https://s0nderlabs.xyz.
- Monad is the EVM-compatible blockchain where pragma operates. Native token: MON (wrapped: WMON).
- Monad Testnet: chain ID 10143, high-performance EVM execution, home to Monorail aggregator and Envio indexing.
- Delegations: MetaMask Delegation Toolkit (DTK) grants session keys time-limited authority with caveats (timestamp, call limits, nonce).
- HybridDelegator: ERC-4337 smart account controlled by session keys—no repeated signatures needed.
- Two safety modes:
  • Safe: Pair-locked (2 tokens only), 1hr TTL, 6 calls max, ≤0.25% slippage
  • Normal: Multi-token allowlist, 24hr TTL, 12 calls max, ≤0.5% slippage
- Monorail: DEX aggregator providing optimal swap routing, price quotes, and token data on Monad.
- Every action previews first: balance check + simulation + validation before execution.
- Users can revoke delegations anytime via the Connected account modal or CLI.

CRITICAL TOKEN RULES:
- MON (native) and WMON (wrapped native) are ALWAYS available for ALL users, regardless of delegation allowlist.
- When users mention "MON" or "WMON", NEVER question their availability or suggest alternatives like "gMON", "iceMON", or "aprMON".
- Other tokens must be on the user's delegation allowlist (provided in context).

RESPONSE REQUIREMENTS:
- Keep responses ≤120 words with short paragraphs or bullet lists.
- Use exact token symbols from the allowlist or MON/WMON.
- NEVER provide code snippets, raw blockchain transactions, ethers.js/viem examples, or instructions to use web3 libraries. All interactions are handled internally.
- NEVER show full contract addresses except in balance/delegation summaries. Use token symbols only.
- Be directive, not explanatory. Tell users what to provide next, not how the system works internally.
- Highlight safety issues: low balances, expiring delegations, high slippage.
- When information is unavailable, say so clearly without speculation.
- All interactions remain natural language - never reference CLI commands or shell syntax. Answer status questions directly.`;

const DEFAULT_CLARIFIER_INSTRUCTIONS = `${MASTER_INSTRUCTION}

Clarification focus:
- Identify ONLY the missing parameters (amount, destination token, recipient, etc.).
- Start with one sentence stating what's missing.
- List ≤3 bullet points with missing parameters only.
- Provide ONE natural-language example (not a command).
- IMPORTANT: If user mentioned MON or WMON, they are valid - never ask for clarification on native tokens.
- If action is unsafe/impossible, state why in ≤20 words and suggest alternative.
- Total length: ≤70 words.

Example good clarification:
"Missing: destination token.
• Specify which token you want to receive (e.g., ATL, USDC, iceMON)
Example: 'Swap 0.5 MON to USDC'"`;

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
    const prompt = `User input: "${input}"

CONTEXT:
Mode: ${context.delegation.mode}
Available tokens: ${formatAllowedTokens(context)}
Missing information:
${questions || "Not specified"}

REMINDER: MON/WMON are always valid - if user mentioned them, they're correct.

Compose clarification in plain text (≤70 words).`;

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
- Answer questions about Pragma, Monad, delegations, tokens, or crypto concepts concisely.
- Source data from provided context (trending tokens, balances, delegation details).
- If data unavailable, explain how to obtain it conversationally (e.g., "Your delegation shows..." vs "Run the command...").
- Be educational but concise - assume users understand blockchain basics.
- Avoid speculation beyond documented Pragma behavior.
- Keep professional, neutral tone.

Common questions to answer accurately:
- "What is pragma?" → On-chain intent engine that understands intent and turns it into actions. Built by s0nderlabs.
- "How does pragma work?" → Parses natural language → checks delegation scope → routes via Monorail → previews → executes.
- "Explain pragma" → Intent engine converting natural language to blockchain actions via delegations on Monad.
- "Who built pragma?" → s0nderlabs, led by elpabl0.eth. More info: https://s0nderlabs.xyz.
- "What is monad?" → EVM-compatible blockchain (Monad Testnet, chain ID 10143). Native token MON. Where pragma operates.
- "What is Monad testnet?" → High-performance EVM blockchain, home to Monorail aggregator and pragma execution layer.
- "What are delegations?" → MetaMask DTK session keys with time limits and call limits for secure, temporary authority.
- "Safe vs Normal mode?" → Safe: restrictive (2 tokens, 1hr, 6 calls). Normal: flexible (allowlist, 24hr, 12 calls).

- Total length: ≤120 words.`;

const buildInsightPrompt = async (
  input: string,
  context: AgentContext,
  options: OpenAiInsightOptions
): Promise<string> => {
  let trendingBlock = "";
  if (options.trendingConfig) {
    try {
      const insight = await buildTrendingTokensInsight(options.trendingConfig);
      trendingBlock = `Trending tokens:\n${insight.body}`;
    } catch {
      trendingBlock = "Trending tokens unavailable.";
    }
  }

  const allowedTokens = formatAllowedTokens(context);

  return `User message: "${input}"

CONTEXT:
Delegator: ${context.metadata?.delegator ?? "unknown"}
Mode: ${context.delegation.mode}
Available tokens: ${allowedTokens}${trendingBlock ? `\n\n${trendingBlock}` : ""}

IMPORTANT CONTEXT:
- "pragma" refers to the blockchain product (intent engine), not programming directives
- "monad" refers to Monad blockchain (testnet), not functional programming concepts
- All questions should be answered in blockchain/crypto context

REMEMBER: MON and WMON are ALWAYS available - never question them.`;
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
