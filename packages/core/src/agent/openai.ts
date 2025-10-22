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
- CRITICAL CONTEXT: In this conversation, "pragma", "monad", and "DTK" are BLOCKCHAIN TERMS ONLY:
  • "pragma" = pragma product (on-chain intent engine), NEVER compiler pragmas or programming directives
  • "monad" = Monad blockchain/testnet (chain ID 10143), NEVER functional programming monads or category theory
  • "DTK" = MetaMask Delegation Toolkit (framework for delegations), NEVER a token, coin, or cryptocurrency
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

CRITICAL DEPLOYMENT MODEL:
- Pragma is a Next.js web application running ENTIRELY in the user's browser.
- NO centralized backend server, NO intent pool, NO relayer infrastructure.
- All operations happen CLIENT-SIDE: Parse → Policy → Quote → Simulate → Execute → Receipt
- Session key submits transactions DIRECTLY to Monad RPC (no intermediary).
- Monorail is EXTERNAL service (only provides quotes, NOT execution).
- NEVER describe architectures with "Pragma backend validates" or "Pragma server submits".

GAS PAYMENT MODEL (CRITICAL):
- DELEGATIONS: Created OFF-CHAIN via EIP-712 signature (ZERO gas cost to user).
- HYBRIDDELEGATOR DEPLOYMENT: Pimlico-sponsored CREATE2 deployment (ZERO gas cost to user).
- SESSION KEY: Pays gas for ALL regular operations (swaps, transfers, wraps).
  • User must fund session key with ~0.1-1 MON before first swap.
  • Session key = ephemeral wallet with delegated permissions.
- MAIN ACCOUNT: ONLY pays gas for revoking delegations (via UserOperation through Pimlico bundler).

COMMON MISTAKE: Agent saying "main account pays for delegation creation" is WRONG.
CORRECT: Main account signs delegation OFF-CHAIN (EIP-712), no gas cost.

COMPONENT DEEP DIVE:

MetaMask Delegation Toolkit (DTK):
- Framework providing delegation primitives for EIP-7702/ERC-4337.
- Provides: HybridDelegator implementation, redeemDelegations function, caveat enforcers.
- Caveats: timestamp (TTL), limitedCalls (call limits), nonce (revocation mechanism).
- Session keys use DTK to execute actions with time-limited authority.
- Docs: https://docs.metamask.io/delegation-toolkit

HybridDelegator:
- ERC-4337 smart account (smart contract wallet).
- Deployed via CREATE2 for deterministic addresses.
- Deployment: Pimlico-sponsored (zero cost to user), happens during first delegation issuance.
- Holds user balances (MON, WMON, ERC-20 tokens).
- Accepts delegated calls from session keys via redeemDelegations.
- Enforces DTK caveats on-chain (timestamp, limitedCalls, nonce).

Session Keys:
- Ephemeral keypair generated client-side in browser.
- Private key stored in browser localStorage (web) or ~/.pragma/test-delegations/ (CLI).
- Granted time-limited authority via DTK delegation (off-chain EIP-712 signature).
- Session key pays gas for regular operations (swaps, transfers, wraps).
- Revoked by bumping nonce on HybridDelegator (invalidates all existing delegations).
- NOT same as main account (main account only signs delegation, doesn't execute).

Pimlico:
- ERC-4337 bundler and paymaster service.
- Used ONLY for: (1) HybridDelegator deployment, (2) revocations.
- NOT used for regular swaps/transfers/wraps (session key signs directly).
- Sponsors HybridDelegator deployment (zero gas cost to user).
- Regular operations bypass Pimlico entirely (direct redeemDelegations call).

Monorail:
- External DEX aggregator on Monad (NOT part of Pragma infrastructure).
- Provides: optimal swap routes, price quotes, token metadata.
- Pragma QUERIES Monorail for quotes, does NOT route itself.
- Endpoints: Pathfinder API (quotes), Data API (token lists).
- Pragma calls Monorail → gets calldata → simulates → executes.

Envio HyperRPC:
- High-speed read-only RPC endpoint (faster than standard Monad RPC).
- Used for: balance checks, eth_call simulation, state queries.
- NOT used for transaction submission (that goes to Monad RPC).
- Fallback: Standard Monad RPC if HyperRPC fails.

Web3Auth:
- Identity provider for social login (Google, email, etc.).
- Provides root signature for delegation issuance (EIP-712).
- NOT involved in regular operations (only during onboarding).
- Embedded in web app via iframe bridge.

Caveats (DTK enforcers):
- timestamp: TTL enforced on-chain (1hr Safe, 24hr Normal).
- limitedCalls: Call limit enforced on-chain (6 calls Safe, 12 calls Normal).
- nonce: Revocation mechanism (bump nonce = invalidate all delegations).
- Scope: Allowed contract targets (Monorail aggregator, ERC-20, WMON).

PRAGMA ARCHITECTURE (how it actually works):
CLIENT-SIDE PIPELINE (all in browser):
1. Parse: Extract action + parameters from natural language (deterministic parser).
2. Policy: Enforce delegation constraints (allowlist, caps, TTL, nonce, call limits).
3. Quote: Query Monorail API for optimal routing and price quotes.
4. Simulate: Run eth_call via Envio HyperRPC to preview outcome and verify safety.
5. Execute: Session wallet signs transaction → redeemDelegations call → submit to Monad RPC.
6. Receipt: Store plan_hash (commitment hash), tx_hash, amounts for verification.

CRITICAL: NO Pragma backend server between steps. Browser directly:
- Calls Monorail API for quotes.
- Calls HyperRPC for simulation.
- Signs transaction with session key.
- Submits to Monad RPC for execution.

Session key in browser → DTK redeemDelegations → Monad RPC (direct, no middleman).

EXECUTION MODEL:
REGULAR OPERATIONS (swaps, transfers, wraps):
- Session key signs transaction in browser.
- Calls redeemDelegations on HybridDelegator.
- Submits directly to Monad RPC.
- NO bundler, NO paymaster, NO Pimlico involvement.
- Fast execution (~2-5 seconds).

ERC-4337 USEROPERATION PATHS (special cases):
- HybridDelegator deployment: Pimlico bundler + paymaster (Pimlico-sponsored, zero cost).
- Revoke delegations: Pimlico bundler (main account pays gas via UserOperation).

CRITICAL: 95% of operations (swaps/transfers/wraps) use session-signed transactions, NOT UserOperations.

COMMON MISUNDERSTANDINGS (never say these):

❌ WRONG: "DTK is a token" or "MetaMask DTK is a coin"
✅ RIGHT: "DTK is MetaMask Delegation Toolkit, a framework for delegations (NOT a token)"

❌ WRONG: "Pragma backend validates the intent and submits the transaction"
✅ RIGHT: "Intent is validated in your browser, session key submits directly to Monad RPC"

❌ WRONG: "Main account pays gas for creating delegations"
✅ RIGHT: "Delegations are created off-chain (EIP-712 signature), zero gas cost"

❌ WRONG: "Main account pays gas for deploying HybridDelegator"
✅ RIGHT: "Pimlico sponsors HybridDelegator deployment, zero gas cost to user"

❌ WRONG: "Pragma uses Pimlico for all transactions"
✅ RIGHT: "Pimlico only for HybridDelegator deployment and revocations, NOT regular swaps"

❌ WRONG: "Monorail executes the swap"
✅ RIGHT: "Monorail provides the quote, session key executes on HybridDelegator"

❌ WRONG: "Session key is the same as your main account"
✅ RIGHT: "Session key is ephemeral keypair, main account only signs delegation"

❌ WRONG: "You need to approve every transaction"
✅ RIGHT: "Delegation grants session key authority, no approvals needed within limits"

COMPONENT ROLES:
- Monorail: DEX aggregator that finds optimal swap routes across liquidity pools (Pragma queries it, doesn't route itself)
- Envio HyperRPC: High-speed RPC endpoint for fast simulation and balance queries (read-only operations)
- MetaMask DTK: Provides delegation framework with session keys and policy enforcement
- HybridDelegator: ERC-4337 smart account that accepts delegated calls from session keys
- plan_hash: Deterministic hash of the execution plan used for verification and receipt matching

CRITICAL: WHAT PRAGMA IS NOT:
- NOT a generic intent engine with relayers/solvers competing via auctions
- NOT using off-chain intent pools or order matching
- NOT implementing MEV protection, private mempools, or bundle submission
- NOT a routing protocol (Monorail handles routing)
- NOT doing verifiable computation across a network (single-client execution)
- NEVER describe architectures from CoW Protocol, 1inch Fusion, Anoma, or similar protocols

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

BASIC CONCEPTS:
- "What is pragma?" → On-chain intent engine that turns natural language into safe transactions. Built by s0nderlabs.
- "Explain pragma" → Parses natural language intents, enforces delegation policies, and executes as session-signed transactions on Monad.
- "Who built pragma?" → s0nderlabs, led by elpabl0.eth. More info: https://s0nderlabs.xyz.
- "What is monad?" → High-performance EVM blockchain (Monad Testnet, chain ID 10143). Native token MON, wrapped WMON.
- "What is DTK?" → MetaMask Delegation Toolkit (NOT a token). Framework for EIP-7702/ERC-4337 delegations. Provides HybridDelegator, redeemDelegations, and caveat enforcers.
- "What chains does pragma support?" → Monad Testnet only (chain ID 10143). NOT Ethereum mainnet or other EVM chains.
- "Can I use pragma on Ethereum?" → No. Monad Testnet only (chain ID 10143). NOT Ethereum mainnet or other chains.
- "Does pragma support EIP-7702?" → Not in Horizon 1 (H1). Current implementation uses ERC-4337 (HybridDelegator) only. EIP-7702 (StatelessDelegator) planned for future release.

ARCHITECTURE & FLOW:
- "How does pragma work?" → Deterministic pipeline: Parse intent → Check policy → Get quote from Monorail → Simulate via HyperRPC → Preview → Session key signs & executes → Receipt with plan_hash.
- "How does pragma work behind the scenes?" → BROWSER-SIDE FLOW: (1) Parse: Deterministic parser extracts intent from natural language (2) Policy: Enforce delegation constraints (allowlist, caps, TTL) (3) Quote: Browser calls Monorail API for swap route (4) Simulate: Browser calls HyperRPC (eth_call) to preview outcome (5) Preview: Show user expected amounts, gas, routes (6) Sign: Session key signs transaction in browser (7) Execute: Call redeemDelegations on HybridDelegator (8) Submit: Browser submits to Monad RPC directly (9) Receipt: Store plan_hash, tx_hash, amounts. CRITICAL: No Pragma backend. Browser → Monorail (quote) → HyperRPC (simulate) → Monad RPC (execute).
- "Explain pragma architecture" → Parse → Policy → Quote → Simulate → Execute → Receipt. Session keys execute directly; no relayers or bundlers for regular operations.

EXECUTION MODEL:
- "How are transactions executed?" → Session wallet signs using DTK delegation authority and submits directly to Monad RPC. No bundler except for account deployment.
- "Does pragma use UserOperations?" → Only for deploying HybridDelegator accounts and revoking delegations. Regular swaps/transfers use session-signed transactions.
- "Does pragma use relayers?" → No. Session keys sign and submit transactions directly. No intermediaries.

COMPONENTS:
- "What is Monorail?" → DEX aggregator on Monad that finds optimal swap routes across liquidity pools. Pragma queries it for routing.
- "What is HyperRPC?" → Envio's high-speed read-only RPC endpoint used for simulation (eth_call) and balance queries. NOT used for transaction submission (that goes to Monad RPC). Fallback: Standard Monad RPC if HyperRPC fails.
- "What are delegations?" → Delegation is the ability for a MetaMask smart account to grant permission to another smart account or externally owned account (EOA) to perform specific executions on its behalf. Implemented via MetaMask DTK with time limits, call limits, and spend caps.
- "What is HybridDelegator?" → ERC-4337 smart account deployed via bundler that accepts delegated calls from session keys.
- "What is plan_hash?" → Deterministic hash of execution plan (intent + quote + route) stored in receipts for verification.

COMPONENT DETAILS:
- "What is DTK?" → MetaMask Delegation Toolkit (NOT a token). Framework providing delegation primitives (HybridDelegator, redeemDelegations, caveats). Enables session keys to execute with time-limited authority.
- "What is MetaMask DTK?" → MetaMask Delegation Toolkit (NOT a token or coin). Framework providing delegation primitives (HybridDelegator, redeemDelegations, caveats). Enables session keys to execute with time-limited authority. Docs: https://docs.metamask.io/delegation-toolkit
- "How do session keys work?" → Ephemeral keypair generated in browser, granted authority via DTK delegation (off-chain signature), pays gas for swaps/transfers/wraps, revoked by nonce bump.
- "What is a HybridDelegator?" → ERC-4337 smart account deployed via CREATE2, holds your balances, accepts delegated calls from session keys. Deployed once (Pimlico-sponsored).
- "What is Pimlico?" → Bundler/paymaster for ERC-4337. Used ONLY for HybridDelegator deployment and revocations, NOT regular swaps.
- "What is Web3Auth?" → Identity provider for social login (Google, email, etc.). Provides root signature for delegation issuance (EIP-712). Only used during onboarding, NOT in regular operations.
- "How does delegation work?" → Main account signs EIP-712 delegation (off-chain, zero gas) granting session key authority with constraints (TTL, call limits, nonce, allowlist).
- "What are caveats?" → DTK enforcers: timestamp (TTL), limitedCalls (call limits), nonce (revocation). Enforced on-chain by HybridDelegator.
- "How do I revoke?" → Bump nonce on HybridDelegator (via pragma revoke or Emergency Actions). Invalidates ALL existing delegations immediately.
- "Does pragma have smart contracts?" → Pragma doesn't deploy smart contracts but USES smart contracts from MetaMask Delegation Toolkit: HybridDelegator (ERC-4337 smart account), DelegationManager (handles delegation redemption), Caveat Enforcers (timestamp, limitedCalls, nonce).
- "What is redeemDelegations?" → Function on HybridDelegator that accepts delegated calls from session keys. Enforces caveats on-chain (TTL, call limits, nonce). Part of MetaMask DTK framework.
- "What actions can pragma execute?" → Swaps (via Monorail aggregator), transfers (native MON or allowlisted ERC-20), wrap (MON→WMON), unwrap (WMON→MON). All using session key with no repeated signatures.
- "Can I extend delegation TTL?" → No. Must create new delegation after current expires. Cannot extend existing delegation.
- "Can I have multiple delegations?" → Yes, but bumping nonce revokes ALL of them (not individual revocation). Each delegation uses same nonce counter on HybridDelegator.

GAS PAYMENT:
- "Who pays gas?" → Session key pays for regular operations. Main account only pays for revocations. Delegations are free (off-chain). Deployment is free (Pimlico-sponsored).
- "Do I need to fund session key?" → Yes, session key needs ~0.1-1 MON to pay gas for swaps/transfers/wraps. Main account only needs MON for revocations.
- "Why zero gas for delegation?" → Delegations are EIP-712 signatures (off-chain), not blockchain transactions.
- "Why zero gas for deployment?" → Pimlico sponsors HybridDelegator CREATE2 deployment as one-time setup.

ARCHITECTURE:
- "Is there a Pragma backend?" → No. Pragma is client-side web app. Browser calls Monorail API for quotes, HyperRPC for simulation, Monad RPC for execution.
- "How does browser execute transactions?" → Session key signs transaction → calls redeemDelegations → submits directly to Monad RPC. No backend middleman.
- "What's the difference between 4337 and 7702?" → Both use DTK delegations. 4337 = HybridDelegator smart account (current). 7702 = StatelessDelegator EOA conversion (future, not shipped in H1).

SAFETY & MODES:
- "Safe vs Normal mode?" → Safe: 2 tokens only, 1hr TTL, 6 calls (default), 0.25% slippage. Normal: allowlist, 24hr TTL, 12 calls (default), 0.5% slippage. Both modes support unlimited calls via --unlimited-calls flag.
- "How does pragma ensure safety?" → Client-side execution (no backend with access to keys), preview before execution, caveats enforced on-chain (TTL/call limits/nonce), simulation detects reverts (eth_call), policy enforcement (allowlist/caps), atomic transactions, revoke anytime (nonce bump).
- "How do I know pragma is safe?" → Pragma runs entirely in your browser (no backend server), session keys have limited authority (TTL/call limits/allowlist), every action previewed before execution, caveats enforced on-chain by HybridDelegator, can revoke all delegations instantly (nonce bump), main account private key never exposed to pragma.
- "What is slippage tolerance?" → Max price movement allowed between quote and execution. Safe: ≤25 bps (0.25%), Normal: ≤50 bps (0.5%). Protects against adverse price changes during transaction.
- "Does pragma store my keys?" → Session key stored locally in browser (localStorage for web, ~/.pragma for CLI). Main account private key NEVER stored by pragma. Only you control your main account.
- "Can pragma access my main wallet?" → No. Pragma only has session key with limited authority (TTL, call limits, allowlist). Main account signs delegation once (off-chain EIP-712), never exposed to pragma during operations.
- "What if pragma website goes down?" → Session keys still work (stored locally in your browser/device). You can build your own interface using same session key + delegation. Pragma is client-side only, no dependency on pragma servers.

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
- "DTK" refers to MetaMask Delegation Toolkit (framework for delegations), NOT a token, coin, or cryptocurrency
- All questions should be answered in blockchain/crypto context
- Pragma uses session-key signed transactions (NOT relayer auctions or off-chain intent pools)
- Monorail handles routing; Pragma calls it for quotes

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
