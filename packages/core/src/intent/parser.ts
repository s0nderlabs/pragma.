import type { Address } from "viem";
import { formatUnits, isAddress, parseUnits } from "viem";

import { normalizeUtterance } from "./normalization.js";
import {
  AmountSpecification,
  ExactAmount,
  ClarificationQuestion,
  ClarificationRequest,
  DelegationContext,
  IntentMeta,
  IntentParseOutcome,
  NormalizedUtterance,
  ParsedSlots,
  PolicyViolation,
} from "./types.js";
import type { CanonicalIntent, IntentAction, AmountKind, PolicyEnforcement } from "./types.js";
import type { AllowedToken } from "../monorail/tokens.js";

const CONNECTOR_TOKENS = new Set(["to", "into", "for"]);
const FROM_TOKENS = new Set(["from"]);
const RECIPIENT_HINTS = new Set(["to", "into", "for"]);
const MAX_KEYWORDS = new Set(["max", "everything", "all"]);
const STOP_WORDS = new Set(["my", "the", "a", "an", "some", "any", "me", "myself", "your", "of"]);
const DELEGATION_KEYWORDS = new Set([
  "delegation",
  "delegations",
  "session",
  "sessions",
  "allowlist",
  "permissions",
  "scope",
  "scopes",
]);
const DELEGATION_VERBS = new Set([
  "issue",
  "reissue",
  "create",
  "mint",
  "renew",
  "refresh",
  "rotate",
  "reset",
  "new",
  "update",
  "regenerate",
  "generate",
  "setup",
  "set",
  "recreate",
  "redo",
]);
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

const SKIP_FOR_CONTEXT = new Set([...STOP_WORDS, ...CONNECTOR_TOKENS, ...FROM_TOKENS, "of"]);

const AMOUNT_PRIORITY = {
  none: 0,
  max: 1,
  fraction: 2,
  exact: 3,
} as const;

const TOKEN_ROLE_LABEL: Record<"tokenIn" | "tokenOut" | "token", string> = {
  tokenIn: "source token",
  tokenOut: "destination token",
  token: "token",
};

interface TokenResolutionOutcome {
  token?: AllowedToken;
  clarification?: ClarificationQuestion;
  violation?: PolicyViolation;
}

const toLower = (value?: string) => value?.toLowerCase();

const getTokenDecimals = (token: AllowedToken): number => {
  const decimalsCandidate = typeof token.decimals === "number" ? token.decimals : Number(token.decimals ?? 18);
  return Number.isFinite(decimalsCandidate) ? decimalsCandidate : 18;
};

const isNativeToken = (token: AllowedToken, nativeTokenAddress?: Address): boolean => {
  if (token.kind === "native") return true;
  if (!nativeTokenAddress) return false;
  return token.address.toLowerCase() === nativeTokenAddress.toLowerCase();
};

const addMatch = (map: Map<string, AllowedToken>, token: AllowedToken) => {
  map.set(token.address.toLowerCase(), token);
};

const findTokenMatches = (
  identifier: string,
  context: DelegationContext,
): AllowedToken[] => {
  const normalized = identifier.toLowerCase();
  const matches = new Map<string, AllowedToken>();
  const nativeSymbolLc = toLower(context.nativeTokenSymbol);
  const wrappedSymbolLc = toLower(context.wrappedNativeSymbol);
  const nativeAddressLc = context.nativeTokenAddress?.toLowerCase();

  for (const token of context.allowedTokens) {
    const symbolLc = toLower(token.symbol);
    const nameLc = toLower(token.name);
    const addressLc = token.address.toLowerCase();
    if (addressLc === normalized) {
      addMatch(matches, token);
      continue;
    }
    if (symbolLc && symbolLc === normalized) {
      addMatch(matches, token);
      continue;
    }
    if (nameLc && nameLc === normalized) {
      addMatch(matches, token);
      continue;
    }
  }

  if (nativeSymbolLc && normalized === nativeSymbolLc) {
    for (const token of context.allowedTokens) {
      if (toLower(token.symbol) === nativeSymbolLc || isNativeToken(token, context.nativeTokenAddress)) {
        addMatch(matches, token);
      }
    }
  }

  if (normalized === "native" || normalized === toLower(context.nativeTokenSymbol) || normalized === toLower("mon")) {
    for (const token of context.allowedTokens) {
      if (isNativeToken(token, context.nativeTokenAddress)) {
        addMatch(matches, token);
      }
    }
  }

  if (wrappedSymbolLc && normalized === wrappedSymbolLc) {
    for (const token of context.allowedTokens) {
      if (token.kind === "wrappedNative" || toLower(token.symbol) === wrappedSymbolLc) {
        addMatch(matches, token);
      }
    }
  }

  if (nativeAddressLc && normalized === nativeAddressLc) {
    for (const token of context.allowedTokens) {
      if (isNativeToken(token, context.nativeTokenAddress)) {
        addMatch(matches, token);
      }
    }
  }

  return Array.from(matches.values());
};

const resolveTokenCandidate = (
  identifier: string,
  role: "tokenIn" | "tokenOut" | "token",
  context: DelegationContext,
): TokenResolutionOutcome => {
  const matches = findTokenMatches(identifier, context);

  if (matches.length === 0) {
    const code =
      role === "tokenIn"
        ? "TOKEN_IN_NOT_ALLOWED"
        : role === "tokenOut"
        ? "TOKEN_OUT_NOT_ALLOWED"
        : "TOKEN_NOT_ALLOWED";
    return {
      violation: {
        code,
        message: `Token ${identifier} is not delegated`,
        field: role,
      },
    };
  }

  if (matches.length > 1) {
    const formatted = matches
      .map((token) => `${token.symbol ?? token.address.slice(0, 6)} (${token.address})`)
      .join(", ");
    return {
      clarification: {
        id: role,
        prompt: `Multiple tokens match “${identifier}” for the ${TOKEN_ROLE_LABEL[role]}. Specify one of: ${formatted}, or provide the exact address.`,
      },
    };
  }

  return { token: matches[0] };
};

const describeAmountForWarnings = (amount: AmountSpecification): string => {
  switch (amount.kind) {
    case "max":
      return "maximum balance";
    case "fraction": {
      const pct = (amount.numerator * 100) / amount.denominator;
      const pctStr = Number.isFinite(pct) ? pct.toFixed(2).replace(/\.00$/, "") : "fraction";
      return `${pctStr}% of balance`;
    }
    case "exact":
    default:
      return amount.kind === "exact" ? amount.value : "specified amount";
  }
};

const resolveExactAmountWei = (
  amount: ExactAmount,
  decimals: number,
  warnings: string[],
): string | undefined => {
  try {
    const wei = parseUnits(amount.value, decimals);
    amount.valueWei = wei.toString();
    return amount.valueWei;
  } catch (error) {
    warnings.push(`Could not parse amount ${amount.value} with ${decimals} decimals: ${(error as Error).message}`);
    return undefined;
  }
};

const getCapForToken = (token: AllowedToken, context: DelegationContext): bigint | undefined => {
  const perTokenCaps = context.perTokenCapsWei;
  if (perTokenCaps) {
    const cap = perTokenCaps[token.address.toLowerCase()];
    if (cap !== undefined) return cap;
  }
  if (isNativeToken(token, context.nativeTokenAddress)) {
    return context.nativeTokenCapWei;
  }
  return undefined;
};

const enforcePerTxCap = (
  amount: AmountSpecification,
  token: AllowedToken,
  context: DelegationContext,
  warnings: string[],
  violations: PolicyViolation[],
) => {
  const cap = getCapForToken(token, context);
  if (cap === undefined) return;

  const decimals = getTokenDecimals(token);
  const tokenLabel = token.symbol ?? token.address.slice(0, 6);

  if (amount.kind === "exact") {
    try {
      const amountWei = parseUnits(amount.value, decimals);
      if (amountWei > cap) {
        const capFormatted = formatUnits(cap, decimals);
        violations.push({
          code: "AMOUNT_EXCEEDS_CAP",
          message: `Requested amount ${amount.value} ${tokenLabel} exceeds per-tx cap of ${capFormatted} ${tokenLabel}.`,
          field: "amount",
        });
      }
      return;
    } catch (error) {
      warnings.push(
        `Unable to parse amount ${amount.value} ${tokenLabel} for cap comparison: ${(error as Error).message}. Cap will be enforced during execution.`,
      );
      return;
    }
  }

  const capFormatted = formatUnits(cap, decimals);
  warnings.push(
    `Requested ${describeAmountForWarnings(amount)} of ${tokenLabel} will be checked against the ${capFormatted} ${tokenLabel} per-tx cap at execution time.`,
  );
};

const nextMeaningfulToken = (tokens: string[], startIndex: number): string | undefined => {
  for (let i = startIndex; i < tokens.length; i += 1) {
    const candidate = tokens[i];
    if (!SKIP_FOR_CONTEXT.has(candidate)) {
      return candidate;
    }
  }
  return undefined;
};

const previousMeaningfulToken = (tokens: string[], startIndex: number): string | undefined => {
  for (let i = startIndex; i >= 0; i -= 1) {
    const candidate = tokens[i];
    if (!SKIP_FOR_CONTEXT.has(candidate)) {
      return candidate;
    }
  }
  return undefined;
};

const DEFAULT_SLIPPAGE_SAFE_BPS = 25;
const DEFAULT_SLIPPAGE_NORMAL_BPS = 50;
const DEFAULT_DEADLINE_SAFE_MIN = 15;
const DEFAULT_DEADLINE_NORMAL_MIN = 15;
const MIN_DEADLINE_SAFE_MIN = 1;
const MIN_DEADLINE_NORMAL_MIN = 1;
const MAX_SLIPPAGE_SAFE_BPS = 25; // 0.25%
const MAX_SLIPPAGE_NORMAL_BPS = 50; // 0.5%
const MAX_DEADLINE_SAFE_MIN = 15;
const MAX_DEADLINE_NORMAL_MIN = 30;

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
  let amountPriority: number = AMOUNT_PRIORITY.none;
  let amountSource: string | undefined;

  const adoptAmount = (spec: AmountSpecification | undefined, priority: number, source?: string) => {
    if (!spec) return;
    if (priority > amountPriority) {
      if (amount && amountSource && source && source !== amountSource) {
        result.warnings.push(`Using ${source} amount and ignoring previous ${amountSource} instruction.`);
      }
      amount = spec;
      amountPriority = priority;
      amountSource = source;
      return;
    }
    if (priority === amountPriority && amount && amountSource && source && source !== amountSource) {
      result.warnings.push(`Ignoring additional ${source} amount; already using ${amountSource}.`);
    }
    if (priority < amountPriority && source && amountSource && source !== amountSource) {
      result.warnings.push(`Ignoring ${source} amount because a more specific amount is already provided.`);
    }
  };
  let sawDelegationKeyword = false;
  let sawDelegationVerb = false;

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

    if ((token === "safe" || token === "normal") && !result.mode) {
      result.mode = token === "safe" ? "safe" : "normal";
      continue;
    }

    if (DELEGATION_KEYWORDS.has(token)) {
      sawDelegationKeyword = true;
      continue;
    }

    if (DELEGATION_VERBS.has(token)) {
      sawDelegationVerb = true;
      continue;
    }

    if (MAX_KEYWORDS.has(token)) {
      adoptAmount({ kind: "max" }, AMOUNT_PRIORITY.max, "max amount");
      continue;
    }

    if (FRACTION_KEYWORDS.has(token)) {
      const fraction = FRACTION_KEYWORDS.get(token)!;
      const amountToken = next ?? candidateToken ?? candidateTokenIn;
      if (!amountToken) {
        adoptAmount(
          {
            kind: "fraction",
            numerator: Math.round(fraction * 1000),
            denominator: 1000,
          },
          AMOUNT_PRIORITY.fraction,
          "fraction amount",
        );
        continue;
      }
      const denominator = 1_000_000;
      const numerator = Math.round(fraction * denominator);
      adoptAmount(
        {
          kind: "fraction",
          numerator,
          denominator,
        },
        AMOUNT_PRIORITY.fraction,
        "fraction amount",
      );
      candidateToken ??= amountToken;
      continue;
    }

    if (NUMBER_REGEX.test(token)) {
      adoptAmount({ kind: "exact", value: token }, AMOUNT_PRIORITY.exact, "explicit amount");
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

  if (!amount) {
    const numeric = numericMatches.find((match) => !Number.isNaN(Number.parseFloat(match.value)));
    if (numeric) {
      adoptAmount({ kind: "exact", value: numeric.value }, AMOUNT_PRIORITY.exact, "explicit amount");
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

  if (!result.action && sawDelegationKeyword && sawDelegationVerb) {
    result.action = "delegation_issue";
  }

  if (result.mode && result.mode !== "safe" && result.mode !== "normal") {
    delete result.mode;
  }

  return result;
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
  warnings: string[],
): { slippageBps: number; deadlineSeconds: number; defaultsApplied: string[]; policy: PolicyEnforcement[] } => {
  const safeMode = context.mode === "safe";
  const defaultSlippage = context.defaultSlippageBps ?? (safeMode ? DEFAULT_SLIPPAGE_SAFE_BPS : DEFAULT_SLIPPAGE_NORMAL_BPS);
  const defaultDeadline =
    context.defaultDeadlineMinutes ?? (safeMode ? DEFAULT_DEADLINE_SAFE_MIN : DEFAULT_DEADLINE_NORMAL_MIN);

  const minDeadlineMinutes = safeMode ? MIN_DEADLINE_SAFE_MIN : MIN_DEADLINE_NORMAL_MIN;

  const maxSlippage = safeMode
    ? context.maxSlippageBpsSafe ?? MAX_SLIPPAGE_SAFE_BPS
    : context.maxSlippageBpsNormal ?? MAX_SLIPPAGE_NORMAL_BPS;
  const maxDeadline = safeMode
    ? context.maxDeadlineMinutesSafe ?? MAX_DEADLINE_SAFE_MIN
    : context.maxDeadlineMinutesNormal ?? MAX_DEADLINE_NORMAL_MIN;

  const defaultsApplied: string[] = [];
  const policy: PolicyEnforcement[] = [];

  const slippageRequested = slots.slippageBps;
  let slippage = slippageRequested ?? defaultSlippage;
  let slippageReason: PolicyEnforcement["reason"] | undefined = slippageRequested === undefined ? "default" : undefined;
  if (slippageRequested === undefined) {
    defaultsApplied.push("slippage_default");
  }
  if (slippage > maxSlippage) {
    const requestedPct = slippage / 100;
    const maxPct = maxSlippage / 100;
    warnings.push(`Slippage ${requestedPct}% exceeds policy limit (${maxPct}%). Clamped to ${maxPct}%.`);
    slippage = maxSlippage;
    slippageReason = "clamped_max";
    if (!defaultsApplied.includes("slippage_clamped_max")) {
      defaultsApplied.push("slippage_clamped_max");
    }
  }
  if (slippage < 0) {
    warnings.push("Slippage cannot be negative. Using 0 bps.");
    slippage = 0;
    slippageReason = "normalized_negative";
    if (!defaultsApplied.includes("slippage_normalized_negative")) {
      defaultsApplied.push("slippage_normalized_negative");
    }
  }

  if (slippageReason) {
    policy.push({
      key: "slippageBps",
      requested: slippageRequested,
      applied: slippage,
      limit: slippageReason === "clamped_max" ? maxSlippage : slippageReason === "normalized_negative" ? 0 : undefined,
      reason: slippageReason,
      unit: "bps",
    });
  }

  const deadlineRequestedMinutes = slots.deadlineMinutes;
  let deadlineMinutes = deadlineRequestedMinutes ?? defaultDeadline;
  let deadlineReason: PolicyEnforcement["reason"] | undefined = deadlineRequestedMinutes === undefined ? "default" : undefined;
  if (deadlineRequestedMinutes === undefined) {
    defaultsApplied.push("deadline_default");
  }
  if (deadlineMinutes > maxDeadline) {
    warnings.push(
      `Deadline ${deadlineMinutes} minutes exceeds policy limit (${maxDeadline} minutes). Clamped to ${maxDeadline} minutes.`,
    );
    deadlineMinutes = maxDeadline;
    deadlineReason = "clamped_max";
    if (!defaultsApplied.includes("deadline_clamped_max")) {
      defaultsApplied.push("deadline_clamped_max");
    }
  }

  if (deadlineMinutes < minDeadlineMinutes) {
    warnings.push(
      `Deadline ${deadlineMinutes} minutes is below the minimum allowed (${minDeadlineMinutes} minutes). Using ${minDeadlineMinutes} minutes.`,
    );
    deadlineMinutes = minDeadlineMinutes;
    deadlineReason = "clamped_min";
    if (!defaultsApplied.includes("deadline_clamped_min")) {
      defaultsApplied.push("deadline_clamped_min");
    }
  }

  const clampedDeadlineMinutes = Math.min(Math.max(deadlineMinutes, minDeadlineMinutes), maxDeadline);
  const deadlineSeconds = toDeadlineSeconds(clampedDeadlineMinutes);
  const requestedDeadlineSeconds =
    deadlineRequestedMinutes !== undefined ? toDeadlineSeconds(deadlineRequestedMinutes) : undefined;

  if (deadlineReason) {
    policy.push({
      key: "deadlineSeconds",
      requested: requestedDeadlineSeconds,
      applied: deadlineSeconds,
      limit:
        deadlineReason === "clamped_max"
          ? toDeadlineSeconds(maxDeadline)
          : deadlineReason === "clamped_min"
          ? toDeadlineSeconds(minDeadlineMinutes)
          : undefined,
      reason: deadlineReason,
      unit: "seconds",
    });
  }

  return { slippageBps: slippage, deadlineSeconds, defaultsApplied, policy };
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

const buildSuccess = (intent: CanonicalIntent, warnings: string[], meta?: IntentMeta): IntentParseOutcome => ({
  type: "success",
  intent,
  warnings,
  meta,
});

const resolveSwapIntent = (
  slots: ParsedSlots,
  context: DelegationContext,
  warnings: string[],
  baseMeta: IntentMeta,
  nowSeconds: number,
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

  const tokenInResolution = resolveTokenCandidate(slots.tokenIn, "tokenIn", context);
  const tokenOutResolution = resolveTokenCandidate(slots.tokenOut, "tokenOut", context);

  if (tokenInResolution.clarification) {
    questions.push(tokenInResolution.clarification);
  }
  if (tokenOutResolution.clarification) {
    questions.push(tokenOutResolution.clarification);
  }
  if (questions.length > 0) {
    return buildClarification(slots, questions, warnings);
  }

  if (tokenInResolution.violation) {
    violations.push(tokenInResolution.violation);
  }
  if (tokenOutResolution.violation) {
    violations.push(tokenOutResolution.violation);
  }
  if (violations.length > 0) return buildError(violations, warnings);

  const tokenIn = tokenInResolution.token!;
  const tokenOut = tokenOutResolution.token!;

  if (context.mode === "safe" && context.pairAddresses && context.pairAddresses.length > 0) {
    const pairSet = new Set(context.pairAddresses.map((address) => address.toLowerCase()));
    const requested = [tokenIn.address.toLowerCase(), tokenOut.address.toLowerCase()];
    const requestedSet = new Set(requested);

    const allPresent = requested.every((address) => pairSet.has(address));

    if (!allPresent || (pairSet.size >= 2 && requestedSet.size !== 2)) {
      violations.push({
        code: "SAFE_PAIR_MISMATCH",
        message: "Safe mode delegation only permits swaps within the issued token pair.",
        field: "tokenIn",
      });
      return buildError(violations, warnings);
    }
  }

  if (tokenIn!.address.toLowerCase() === tokenOut!.address.toLowerCase()) {
    violations.push({ code: "TOKENS_IDENTICAL", message: "Source and destination token must differ", field: "tokenOut" });
    return buildError(violations, warnings);
  }

  const amount = ensureAmount(slots, questions);
  if (!amount) return buildClarification(slots, questions, warnings);

  let amountWei: string | undefined;
  if (amount.kind === "exact") {
    amountWei = resolveExactAmountWei(amount, getTokenDecimals(tokenIn), warnings);
  }

  enforcePerTxCap(amount, tokenIn, context, warnings, violations);
  if (violations.length > 0) return buildError(violations, warnings);

  const { slippageBps, deadlineSeconds, defaultsApplied, policy } = clampPolicyValues(context, slots, warnings);

  const deadlineTimestamp = nowSeconds + deadlineSeconds;

  const symbolResolutions: Record<string, Address> = {};
  if (slots.tokenIn) {
    symbolResolutions[slots.tokenIn] = tokenIn!.address;
  }
  if (slots.tokenOut) {
    symbolResolutions[slots.tokenOut] = tokenOut!.address;
  }

  const mergedDefaults = Array.from(new Set([...(baseMeta.defaultsApplied ?? []), ...defaultsApplied]));
  const mergedSymbolResolutions = {
    ...(baseMeta.symbolResolutions ?? {}),
    ...symbolResolutions,
  };
  const meta: IntentMeta = {
    ...baseMeta,
    defaultsApplied: mergedDefaults,
    symbolResolutions: mergedSymbolResolutions,
    amountExactWei: amountWei ?? baseMeta.amountExactWei,
    policyEnforcements: [...(baseMeta.policyEnforcements ?? []), ...policy],
  };

  return buildSuccess(
    {
      action: "swap",
      tokenIn: tokenIn!,
      tokenOut: tokenOut!,
      amount,
      slippageBps,
      deadlineSeconds,
      deadlineTimestamp,
      chainId: context.chainId,
      sessionKeyId: context.sessionKeyId,
      nonce: context.nonce,
      feeBps: context.feeBps,
      feeRecipient: context.feeRecipient,
      defaultsApplied,
      symbolResolutions,
      amountWei,
      policyEnforcements: policy,
    },
    warnings,
    meta,
  );
};

const resolveWrapIntent = (
  slots: ParsedSlots,
  context: DelegationContext,
  warnings: string[],
  action: "wrap" | "unwrap",
  baseMeta: IntentMeta,
): IntentParseOutcome => {
  const questions: ClarificationQuestion[] = [];
  const amount = ensureAmount(slots, questions);
  if (!amount) return buildClarification(slots, questions, warnings);
  let amountWei: string | undefined;
  if (amount.kind === "exact") {
    amountWei = resolveExactAmountWei(amount, 18, warnings);
  }
  const meta: IntentMeta = {
    ...baseMeta,
    amountExactWei: amountWei ?? baseMeta.amountExactWei,
  };
  return buildSuccess({ action, amount, amountWei }, warnings, meta);
};

const resolveTransferIntent = (
  slots: ParsedSlots,
  context: DelegationContext,
  warnings: string[],
  baseMeta: IntentMeta,
): IntentParseOutcome => {
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
  const symbolResolutions: Record<string, Address> = {};
  if (slots.token) {
    const tokenResolution = resolveTokenCandidate(slots.token, "token", context);
    if (tokenResolution.clarification) {
      questions.push(tokenResolution.clarification);
      return buildClarification(slots, questions, warnings);
    }
    if (tokenResolution.violation) {
      violations.push(tokenResolution.violation);
      return buildError(violations, warnings);
    }
    token = tokenResolution.token;
    if (token) {
      symbolResolutions[slots.token] = token.address;
    }
  }

  let amountWei: string | undefined;
  if (amount.kind === "exact") {
    const decimals = token ? getTokenDecimals(token) : 18;
    amountWei = resolveExactAmountWei(amount, decimals, warnings);
  }

  const meta: IntentMeta = {
    ...baseMeta,
    symbolResolutions: {
      ...(baseMeta.symbolResolutions ?? {}),
      ...symbolResolutions,
    },
    amountExactWei: amountWei ?? baseMeta.amountExactWei,
  };

  return buildSuccess(
    {
      action: "transfer",
      token,
      amount,
      recipient: slots.recipient as Address,
      amountWei,
    },
    warnings,
    meta,
  );
};

const resolveDelegationIssueIntent = (slots: ParsedSlots, warnings: string[], baseMeta: IntentMeta): IntentParseOutcome => {
  return buildSuccess(
    {
      action: "delegation_issue",
      mode: slots.mode,
    },
    warnings,
    baseMeta,
  );
};

export const parseIntent = (input: string, context: DelegationContext): IntentParseOutcome => {
  const utterance = normalizeUtterance(input);
  const slots = parseSlots(utterance);
  const warnings = [...slots.warnings];

  const nowSeconds = context.nowSeconds ?? Math.floor(Date.now() / 1000);
  const baseMeta: IntentMeta = {
    sourceText: utterance.raw,
    sessionKeyId: context.sessionKeyId,
    nonce: context.nonce,
    chainId: context.chainId,
    feeBps: context.feeBps,
    feeRecipient: context.feeRecipient,
    policySnapshotId: context.policySnapshotId,
  };

  if (!slots.action) {
    return buildClarification(slots, [{ id: "action", prompt: "What would you like to do? (swap, wrap, unwrap, transfer)" }], warnings);
  }

  switch (slots.action) {
    case "swap":
      return resolveSwapIntent(slots, context, warnings, baseMeta, nowSeconds);
    case "wrap":
    case "unwrap":
      return resolveWrapIntent(slots, context, warnings, slots.action, baseMeta);
    case "transfer":
      return resolveTransferIntent(slots, context, warnings, baseMeta);
    case "delegation_issue":
      return resolveDelegationIssueIntent(slots, warnings, baseMeta);
    default:
      return buildError([
        { code: "ACTION_UNSUPPORTED", message: `Action ${slots.action} is not supported`, field: "action" },
      ], warnings);
  }
};
