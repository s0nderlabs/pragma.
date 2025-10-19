---
title: Intent Engine
---

# Intent Engine

The intent engine (`packages/core/src/intent`) transforms natural-language utterances into canonical swap intents. It operates in two phases: a deterministic parser and an optional AI agent layer.

## Dual Architecture: Parser + Agent

The intent engine operates in two distinct phases:

### Phase 1: Deterministic Parser (Always Active)

The core parser (`packages/core/src/intent/parser.ts`) is pure, stateless, and rule-based:
- **Input**: User text + delegation context
- **Output**: Canonical intent, clarification request, or error
- **Characteristics**:
  - Zero LLM calls - fully deterministic and fast (< 10ms)
  - No external API dependencies
  - Consistent results for identical inputs
  - Works offline and in fixture mode

**Operations**:
1. Normalizes text (removes filler, collapses whitespace, maps synonyms)
2. Extracts slots (action, tokens, amount, slippage, deadline)
3. Resolves symbols to delegation allowlist addresses
4. Applies mode-specific defaults and clamps
5. Validates against policy constraints

This phase ensures every request goes through strict validation before any execution path.

### Phase 2: AI Agent (When OPENAI_API_KEY Present)

The agent layer (`packages/core/src/agent/pragmaAgent.ts`, `openai.ts`) enhances the user experience with conversational intelligence:

**Capabilities**:
- **Clarification enhancement**: Transforms basic "missing amount" errors into contextual guidance
- **Educational insights**: Answers questions about Pragma, Monad, delegations, tokens
- **System understanding**: Explains delegation scope, call limits, TTLs, balances
- **Safety warnings**: Highlights low balances, expiring delegations, high slippage
- **Trending data**: Fetches and explains popular tokens from Monorail
- **Natural conversation**: ≤180 words, short paragraphs, bullet lists

**Technical details**:
- **Primary model**: gpt-5-mini (fast, cost-efficient)
- **Fallback model**: gpt-5-nano (when primary fails)
- **Streaming**: Server-Sent Events for real-time responses
- **Timeout**: 1200ms first chunk timeout with non-streaming fallback

**Agent functions**:
1. `llmClarifier`: Enhances clarification requests with delegation context
2. `llmInsight`: Provides educational responses and system explanations
3. `llmInsightStream`: Streams responses incrementally for better UX

**Fallback behavior**: If `OPENAI_API_KEY` is missing or API calls fail, the system gracefully degrades to Phase 1 only. Users receive basic clarifications without AI enhancement, but all core functionality (parsing, execution) remains intact.

**Example enhancement**:

**Without agent** (Phase 1 only):
```
Clarification needed: missing_amount
```

**With agent** (Phase 1 + 2):
```
Need more details

You're requesting a swap but didn't specify the amount. You can provide:
• An exact amount: "swap 0.5 MON to USDC"
• A percentage: "swap 50% MON to USDC"
• Maximum: "swap max MON to USDC"

Your delegation has 10 calls remaining with a 24h expiry.
```

## Responsibilities

1. **Normalization** (`normalization.ts`)  
   - Trims filler words (“please”, emojis), collapses whitespace, and lowercases comparison tokens.  
   - Unifies synonyms: `trade/convert → swap`, `into/for → to`, `all/everything/100% → max`.  
   - Converts fractions: “half”/“50%” → `0.5`, “quarter”/“25%” → `0.25`.  
   - Parses hints such as `0.3% slippage` → `requested_tolerance_bps = 30` and `in 10 minutes` → `requested_deadline_s = 600`.

2. **Slot extraction** (`parser.ts`)  
   - Detects the action (`swap` is the only supported verb in H1).  
   - Captures token candidates before/after “to”.  
   - Recognizes amount expressions (exact decimal, fraction, `max`).  
   - Records optional slippage/deadline hints.

3. **Resolution**  
   - Maps symbols or addresses onto the delegation allowlist (`findTokenMatches`).  
   - Handles native/wrapped synonyms (MON/native) and raises clarifications when multiple matches exist.  
   - Rejects same-token pairs (`SAME_TOKEN_PAIR`).

4. **Policy integration**  
   - Safe mode requires an explicit pair from the delegation.  
   - Normal mode ensures both tokens remain within the curated allowlist; adding new assets requires a fresh delegation.  
   - Clamps slippage (`≤ 25 bps` Safe, `≤ 50 bps` Normal) and deadline (`≤ 900 s` Safe, `≤ 1800 s` Normal) and records which defaults were applied.

5. **Output**  
   - On success emits a `CanonicalIntent` with strict types (addresses are checksummed, amounts are wei strings, tolerance/deadline are already clamped).  
   - Ambiguities yield a single `ClarificationRequest` with human-readable prompts (e.g., “Which token are you swapping from?”).  
   - Violations surface canonical error codes such as `TOKEN_OUT_OF_SCOPE`, `AMOUNT_EXCEEDS_CAP`, or `ACTION_UNSUPPORTED`.

## Metadata & Warnings

The `IntentMeta` payload captures:

- `defaultsApplied`: which defaults/clamps were enforced.  
- `symbolResolutions`: mapping from user input to resolved addresses.  
- `policySnapshotId` / `sessionKeyId`: passed through to downstream logs.  
- `amountExactWei`: when an exact decimal is converted to wei early.

Warnings (string array) are preserved for the preview/execution steps. Examples include fraction requests that might exceed a cap after balance resolution.

## Clarification Prompts

See `prompts_and_tests.md` (internal docs) for the canonical prompt text. User surfaces reuse the same copy to avoid translation drift:

| Scenario | Prompt |
| --- | --- |
| Missing amount | “How much do you want to swap?” |
| Missing token_in | “Which token are you swapping from?” |
| Missing token_out | “Which token are you swapping to?” |
| Ambiguous symbol | “Which USDC did you mean?” (with short address options) |

## Error Codes

Error codes thrown by the intent layer originate from `packages/core/src/errors/index.ts` and align with the [user-facing catalog](errors.md). Notable codes:

- `ACTION_UNSUPPORTED`, `ACTION_MALFORMED`  
- `TOKEN_UNRESOLVED`, `TOKEN_OUT_OF_SCOPE`, `PAIR_REQUIRED_SAFE_MODE`  
- `AMOUNT_MISSING`, `AMOUNT_MALFORMED`, `AMOUNT_EXCEEDS_CAP`  
- `SESSION_KEY_INVALID`, `POLICY_CONFLICT`

Downstream flows must not guess at parsing logic. Always consume the canonical intent returned by `parseIntent` and honor any warnings or metadata it includes.
