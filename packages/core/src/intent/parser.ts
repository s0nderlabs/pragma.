import type { Address } from "viem";
import { isAddress } from "viem";

import { normalizeUtterance } from "./normalization.js";
import {
  AmountSpecification,
  ClarificationQuestion,
  ClarificationRequest,
  DelegationContext,
  IntentParseOutcome,
  NormalizedUtterance,
  ParsedSlots,
  PolicyViolation,
} from "./types.js";
import type { CanonicalIntent, IntentAction, AmountKind } from "./types.js";
import type { AllowedToken } from "../monorail/tokens.js";

const CONNECTOR_TOKENS = new Set(["to", "into", "for"]);
const FROM_TOKENS = new Set(["from"]);
const RECIPIENT_HINTS = new Set(["to", "into", "for"]);
const MAX_KEYWORDS = new Set(["max", "everything", "all"]);
const STOP_WORDS = new Set(["my", "the", "a", "an", "some", "any"]);
const FRACTION_KEYWORDS = new Map<string, number>([
  ["half", 1 / 2],
  ["quarter", 1 / 4],
  ["third", 1 / 3],
  ["threequarters", 3 / 4],
  ["three-quarter", 3 / 4],
  ["threequarters", 3 / 4],
  ["threequarter", 3 / 4],
  ["three-quarters", 3 / 4],
  ["three quarters", 3 / 4],
  ["threequarter", 3 / 4],
  ["two-thirds", 2 / 3],
  ["two thirds", 2 / 3],
  ["twothirds", 2 / 3],
  ["twothird", 2 / 3],
  ["thirds", 1 / 3],
  ["quarters", 1 / 4],
]);

const nextMeaningfulToken = (tokens: string[], startIndex: number): string | undefined => {
  for (let i = startIndex; i < tokens.length; i += 1) {
    const candidate = tokens[i];
    if (!STOP_WORDS.has(candidate)) {
      return candidate;
    }
  }
  return undefined;
};

const previousMeaningfulToken = (tokens: string[], startIndex: number): string | undefined => {
  for (let i = startIndex; i >= 0; i -= 1) {
    const candidate = tokens[i];
    if (!STOP_WORDS.has(candidate)) {
      return candidate;
    }
  }
  return undefined;
};

const DEFAULT_SLIPPAGE_SAFE_BPS = 50;
const DEFAULT_SLIPPAGE_NORMAL_BPS = 100;
const DEFAULT_DEADLINE_SAFE_MIN = 15;
const DEFAULT_DEADLINE_NORMAL_MIN = 30;
const MAX_SLIPPAGE_SAFE_BPS = 250; // 2.5%
const MAX_SLIPPAGE_NORMAL_BPS = 500; // 5%
const MAX_DEADLINE_SAFE_MIN = 60;
const MAX_DEADLINE_NORMAL_MIN = 120;

const NUMBER_REGEX = /^(?:\d+)(?:\.\d+)?$/;

interface NumberWithIndex {
  value: string;
  index: number;
  start: number;
  end: number;
}

const gatherNumericMatches = (utterance: NormalizedUtterance): NumberWithIndex[] => {
  const matches: NumberWithIndex[] = [];
  const regex = /\b(\d+(?:\.\d+)?)\b/g;
  let match: RegExpExecArray | null;
  let tokenIndex = 0;
  let currentPos = 0;
  for (const token of utterance.tokens) {
    const idx = utterance.normalized.indexOf(token, currentPos);
    if (idx === -1) continue;
    if (NUMBER_REGEX.test(token)) {
      matches.push({ value: token, index: tokenIndex, start: idx, end: idx + token.length });
    }
    currentPos = idx + token.length;
    tokenIndex += 1;
  }
  while ((match = regex.exec(utterance.normalized))) {
    const value = match[1];
    if (matches.some((m) => m.start === match!.index)) continue;
    matches.push({ value, index: -1, start: match.index, end: match.index + match[0].length });
  }
  return matches;
};

const extractSlippageBps = (utterance: NormalizedUtterance): { value?: number; usedIndices: Set<number> } => {
  const used = new Set<number>();
  const patterns = [
    /(?:slippage|tolerance)\s*(\d+(?:\.\d+)?)\s*%/,
    /(\d+(?:\.\d+)?)\s*%\s*(?:slippage|tolerance)/,
  ];
  for (const pattern of patterns) {
    const match = utterance.normalized.match(pattern);
    if (match) {
      const numeric = Number.parseFloat(match[1]);
      if (!Number.isNaN(numeric)) {
        return { value: Math.round(numeric * 100), usedIndices: used };
      }
    }
  }
  return { usedIndices: used };
};

const extractDeadlineMinutes = (utterance: NormalizedUtterance): { value?: number; usedIndices: Set<number> } => {
  const used = new Set<number>();
  const pattern = /(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\s*(?:deadline|limit|good|window)?/;
  const match = utterance.normalized.match(pattern);
  if (match) {
    const numeric = Number.parseFloat(match[1]);
    if (!Number.isNaN(numeric)) {
      const unit = match[2];
      const minutes = unit.startsWith("hour") || unit.startsWith("hr") ? numeric * 60 : numeric;
      return { value: Math.round(minutes), usedIndices: used };
    }
  }
  return { usedIndices: used };
};

const firstAlphaToken = (tokens: string[], startIndex: number): string | undefined => {
  for (let i = startIndex; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!NUMBER_REGEX.test(token) && !CONNECTOR_TOKENS.has(token) && !FROM_TOKENS.has(token)) {
      return token;
    }
  }
  return undefined;
};

const parseAmountFromToken = (token: string): AmountSpecification | undefined => {
  if (MAX_KEYWORDS.has(token)) {
    return { kind: "max" };
  }
  if (NUMBER_REGEX.test(token)) {
    return { kind: "exact", value: token };
  }
  return undefined;
};

const parseSlots = (utterance: NormalizedUtterance): ParsedSlots => {
  const result: ParsedSlots = { warnings: [] };
  const numericMatches = gatherNumericMatches(utterance);
  const { value: slippageBps } = extractSlippageBps(utterance);
  const { value: deadlineMinutes } = extractDeadlineMinutes(utterance);

  if (slippageBps !== undefined) {
    result.slippageBps = slippageBps;
  }
  if (deadlineMinutes !== undefined) {
    result.deadlineMinutes = deadlineMinutes;
  }

  let candidateTokenIn: string | undefined;
  let candidateTokenOut: string | undefined;
  let candidateToken: string | undefined;
  let candidateRecipient: string | undefined;
  let amount: AmountSpecification | undefined;
  let amountAssignedFromNumber = false;

  const tokens = utterance.tokens;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const prevRaw = tokens[i - 1];
    const nextRaw = tokens[i + 1];
    const prev = previousMeaningfulToken(tokens, i - 1);
    const next = nextMeaningfulToken(tokens, i + 1);

    if (token === "of") {
      continue;
    }

    if (STOP_WORDS.has(token)) {
      continue;
    }

    if ((token === "swap" || token === "wrap" || token === "unwrap" || token === "transfer") && !result.action) {
      result.action = token as IntentAction;
      continue;
    }

    if (!amount && MAX_KEYWORDS.has(token)) {
      amount = { kind: "max" };
      continue;
    }

    if (!amount && FRACTION_KEYWORDS.has(token)) {
      const fraction = FRACTION_KEYWORDS.get(token)!;
      const amountToken = next ?? candidateToken ?? candidateTokenIn;
      if (!amountToken) {
        amount = {
          kind: "fraction",
          numerator: Math.round(fraction * 1000),
          denominator: 1000,
        };
        continue;
      }
      const denominator = 1_000_000;
      const numerator = Math.round(fraction * denominator);
      amount = {
        kind: "fraction",
        numerator,
        denominator,
      };
      candidateToken ??= amountToken;
      continue;
    }

    if (!amount && NUMBER_REGEX.test(token)) {
      amount = { kind: "exact", value: token };
      amountAssignedFromNumber = true;
      continue;
    }

    if (token.startsWith("0x") && token.length === 42) {
      candidateRecipient = token;
      continue;
    }

    if (FROM_TOKENS.has(token) && next) {
      candidateTokenIn = next;
      continue;
    }

    if (CONNECTOR_TOKENS.has(token) && next) {
      if (next.startsWith("0x") && next.length === 42) {
        candidateRecipient = next;
      } else if (!candidateTokenOut) {
        candidateTokenOut = next;
      }
      continue;
    }

    if (!candidateTokenIn && !CONNECTOR_TOKENS.has(token) && !FROM_TOKENS.has(token) && token !== "max" && token !== "swap") {
      if ((prevRaw === "of" || prev === "of") && next && CONNECTOR_TOKENS.has(next)) {
        candidateTokenIn = token;
        continue;
      }
      if (!candidateToken) {
        candidateToken = token;
      }
    }
  }

  if (!amount && !amountAssignedFromNumber) {
    const numeric = numericMatches.find((match) => !Number.isNaN(Number.parseFloat(match.value)));
    if (numeric) {
      amount = { kind: "exact", value: numeric.value };
    }
  }

  if (result.action === "swap") {
    if (!candidateTokenIn) {
      candidateTokenIn = candidateToken ?? firstAlphaToken(tokens, 0);
    }
    if (!candidateTokenOut) {
      const secondCandidate = firstAlphaToken(tokens, tokens.indexOf(candidateTokenIn ?? "") + 1) ?? undefined;
      if (secondCandidate && secondCandidate !== candidateTokenIn) {
        candidateTokenOut = secondCandidate;
      }
    }
    result.tokenIn = candidateTokenIn;
    result.tokenOut = candidateTokenOut;
  } else if (result.action === "transfer") {
    result.token = candidateToken ?? candidateTokenIn;
    result.recipient = candidateRecipient;
  } else if (result.action === "wrap" || result.action === "unwrap") {
    result.token = candidateToken ?? candidateTokenIn;
  }

  if (amount) {
    result.amount = amount;
  }
  if (candidateRecipient && !result.recipient) {
    result.recipient = candidateRecipient;
  }

  return result;
};

const findTokenMatch = (
  identifier: string,
  allowedTokens: AllowedToken[],
  nativeSymbol?: string,
  wrappedNativeSymbol?: string,
): AllowedToken | undefined => {
  const normalized = identifier.toLowerCase();
  for (const token of allowedTokens) {
    if (token.symbol && token.symbol.toLowerCase() === normalized) return token;
    if (token.name && token.name.toLowerCase() === normalized) return token;
    if (token.address.toLowerCase() === normalized) return token;
  }
  if (nativeSymbol && normalized === nativeSymbol.toLowerCase()) {
    return allowedTokens.find((token) => token.symbol?.toLowerCase() === nativeSymbol.toLowerCase());
  }
  if (normalized === "native" || normalized === "mon") {
    return allowedTokens.find((token) => token.symbol?.toLowerCase() === nativeSymbol?.toLowerCase());
  }
  if (wrappedNativeSymbol && normalized === wrappedNativeSymbol.toLowerCase()) {
    return allowedTokens.find((token) => token.symbol?.toLowerCase() === wrappedNativeSymbol.toLowerCase());
  }
  return undefined;
};

const ensureAmount = (slots: ParsedSlots, questions: ClarificationQuestion[]): AmountSpecification | undefined => {
  if (slots.amount) return slots.amount;
  questions.push({ id: "amount", prompt: "How much would you like to move?" });
  return undefined;
};

const toDeadlineSeconds = (minutes: number): number => Math.round(minutes * 60);

const clampPolicyValues = (
  context: DelegationContext,
  slots: ParsedSlots,
  violations: PolicyViolation[],
): { slippageBps: number; deadlineSeconds: number } => {
  const safeMode = context.mode === "safe";
  const defaultSlippage = context.defaultSlippageBps ?? (safeMode ? DEFAULT_SLIPPAGE_SAFE_BPS : DEFAULT_SLIPPAGE_NORMAL_BPS);
  const defaultDeadline =
    context.defaultDeadlineMinutes ?? (safeMode ? DEFAULT_DEADLINE_SAFE_MIN : DEFAULT_DEADLINE_NORMAL_MIN);

  const maxSlippage = safeMode
    ? context.maxSlippageBpsSafe ?? MAX_SLIPPAGE_SAFE_BPS
    : context.maxSlippageBpsNormal ?? MAX_SLIPPAGE_NORMAL_BPS;
  const maxDeadline = safeMode
    ? context.maxDeadlineMinutesSafe ?? MAX_DEADLINE_SAFE_MIN
    : context.maxDeadlineMinutesNormal ?? MAX_DEADLINE_NORMAL_MIN;

  const slippage = slots.slippageBps ?? defaultSlippage;
  if (slippage > maxSlippage) {
    violations.push({ code: "SLIPPAGE_TOO_HIGH", message: `Slippage ${slippage / 100}% exceeds limit`, field: "slippage" });
  }

  const deadlineMinutes = slots.deadlineMinutes ?? defaultDeadline;
  if (deadlineMinutes > maxDeadline) {
    violations.push({
      code: "DEADLINE_TOO_LONG",
      message: `Deadline ${deadlineMinutes} minutes exceeds limit`,
      field: "deadline",
    });
  }

  return { slippageBps: Math.min(slippage, maxSlippage), deadlineSeconds: toDeadlineSeconds(Math.min(deadlineMinutes, maxDeadline)) };
};

const buildClarification = (slots: ParsedSlots, questions: ClarificationQuestion[], warnings: string[]): IntentParseOutcome => ({
  type: "clarification",
  clarification: {
    questions,
    partialIntent: slots,
  },
  warnings,
});

const buildError = (violations: PolicyViolation[], warnings: string[]): IntentParseOutcome => ({
  type: "error",
  violations,
  warnings,
});

const buildSuccess = (intent: CanonicalIntent, warnings: string[]): IntentParseOutcome => ({
  type: "success",
  intent,
  warnings,
});

const resolveSwapIntent = (
  slots: ParsedSlots,
  context: DelegationContext,
  warnings: string[],
): IntentParseOutcome => {
  const questions: ClarificationQuestion[] = [];
  const violations: PolicyViolation[] = [];

  if (!slots.tokenIn || !slots.tokenOut) {
    if (!slots.tokenIn) {
      questions.push({ id: "tokenIn", prompt: "Which token are you swapping from?" });
    }
    if (!slots.tokenOut) {
      questions.push({ id: "tokenOut", prompt: "Which token are you swapping to?" });
    }
    return buildClarification(slots, questions, warnings);
  }

  const tokenIn = findTokenMatch(slots.tokenIn, context.allowedTokens, context.nativeTokenSymbol, context.wrappedNativeSymbol);
  const tokenOut = findTokenMatch(slots.tokenOut, context.allowedTokens, context.nativeTokenSymbol, context.wrappedNativeSymbol);

  if (!tokenIn) {
    violations.push({ code: "TOKEN_IN_NOT_ALLOWED", message: `Token ${slots.tokenIn} is not delegated`, field: "tokenIn" });
  }
  if (!tokenOut) {
    violations.push({ code: "TOKEN_OUT_NOT_ALLOWED", message: `Token ${slots.tokenOut} is not delegated`, field: "tokenOut" });
  }
  if (violations.length > 0) return buildError(violations, warnings);

  if (tokenIn!.address.toLowerCase() === tokenOut!.address.toLowerCase()) {
    violations.push({ code: "TOKENS_IDENTICAL", message: "Source and destination token must differ", field: "tokenOut" });
    return buildError(violations, warnings);
  }

  const amount = ensureAmount(slots, questions);
  if (!amount) return buildClarification(slots, questions, warnings);

  const { slippageBps, deadlineSeconds } = clampPolicyValues(context, slots, violations);
  if (violations.length > 0) return buildError(violations, warnings);

  return buildSuccess(
    {
      action: "swap",
      tokenIn: tokenIn!,
      tokenOut: tokenOut!,
      amount,
      slippageBps,
      deadlineSeconds,
    },
    warnings,
  );
};

const resolveWrapIntent = (slots: ParsedSlots, context: DelegationContext, warnings: string[], action: "wrap" | "unwrap") => {
  const questions: ClarificationQuestion[] = [];
  const amount = ensureAmount(slots, questions);
  if (!amount) return buildClarification(slots, questions, warnings);
  return buildSuccess({ action, amount }, warnings);
};

const resolveTransferIntent = (slots: ParsedSlots, context: DelegationContext, warnings: string[]): IntentParseOutcome => {
  const questions: ClarificationQuestion[] = [];
  const violations: PolicyViolation[] = [];

  const amount = ensureAmount(slots, questions);
  if (!amount) return buildClarification(slots, questions, warnings);

  if (!slots.recipient) {
    questions.push({ id: "recipient", prompt: "Who should receive the transfer?" });
    return buildClarification(slots, questions, warnings);
  }

  if (!isAddress(slots.recipient)) {
    violations.push({ code: "RECIPIENT_INVALID", message: "Recipient address is invalid", field: "recipient" });
    return buildError(violations, warnings);
  }

  let token: AllowedToken | undefined;
  if (slots.token) {
    token = findTokenMatch(slots.token, context.allowedTokens, context.nativeTokenSymbol);
    if (!token) {
      violations.push({ code: "TOKEN_NOT_ALLOWED", message: `Token ${slots.token} is not delegated`, field: "token" });
      return buildError(violations, warnings);
    }
  }

  return buildSuccess(
    {
      action: "transfer",
      token,
      amount,
      recipient: slots.recipient as Address,
    },
    warnings,
  );
};

export const parseIntent = (input: string, context: DelegationContext): IntentParseOutcome => {
  const utterance = normalizeUtterance(input);
  const slots = parseSlots(utterance);
  const warnings = [...slots.warnings];

  if (!slots.action) {
    return buildClarification(slots, [{ id: "action", prompt: "What would you like to do? (swap, wrap, unwrap, transfer)" }], warnings);
  }

  switch (slots.action) {
    case "swap":
      return resolveSwapIntent(slots, context, warnings);
    case "wrap":
    case "unwrap":
      return resolveWrapIntent(slots, context, warnings, slots.action);
    case "transfer":
      return resolveTransferIntent(slots, context, warnings);
    default:
      return buildError([
        { code: "ACTION_UNSUPPORTED", message: `Action ${slots.action} is not supported`, field: "action" },
      ], warnings);
  }
};
