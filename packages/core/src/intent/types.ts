import type { Address } from "viem";

import type { AllowedToken } from "../monorail/tokens.js";
import type { Mode } from "../delegations/types.js";

export type IntentAction = "swap" | "wrap" | "unwrap" | "transfer";

export type AmountKind = "exact" | "max" | "fraction";

export interface ExactAmount {
  kind: "exact";
  /** Decimal string representation supplied by the user (not yet converted to wei). */
  value: string;
}

export interface FractionAmount {
  kind: "fraction";
  numerator: number;
  denominator: number;
}

export interface MaxAmount {
  kind: "max";
}

export type AmountSpecification = ExactAmount | FractionAmount | MaxAmount;

export interface SwapIntentFields {
  action: "swap";
  tokenIn: AllowedToken;
  tokenOut: AllowedToken;
  amount: AmountSpecification;
  slippageBps: number;
  deadlineSeconds: number;
}

export interface WrapIntentFields {
  action: "wrap" | "unwrap";
  amount: AmountSpecification;
}

export interface TransferIntentFields {
  action: "transfer";
  /** If undefined, the intent refers to native token. */
  token?: AllowedToken;
  amount: AmountSpecification;
  recipient?: Address;
}

export type CanonicalIntent = SwapIntentFields | WrapIntentFields | TransferIntentFields;

export interface NormalizedUtterance {
  raw: string;
  normalized: string;
  tokens: string[];
}

export interface ParsedSlots {
  action?: IntentAction;
  amount?: AmountSpecification;
  tokenIn?: string;
  tokenOut?: string;
  token?: string;
  recipient?: string;
  slippageBps?: number;
  deadlineMinutes?: number;
  warnings: string[];
}

export interface DelegationContext {
  mode: Mode;
  allowedTokens: AllowedToken[];
  /** Optional convenience defaults for policy clamping. */
  defaultSlippageBps?: number;
  defaultDeadlineMinutes?: number;
  maxSlippageBpsSafe?: number;
  maxSlippageBpsNormal?: number;
  maxDeadlineMinutesSafe?: number;
  maxDeadlineMinutesNormal?: number;
  nativeTokenSymbol?: string;
  nativeTokenAddress?: Address;
  wrappedNativeSymbol?: string;
  wrappedNativeAddress?: Address;
}

export interface PolicyViolation {
  code: string;
  message: string;
  field?: string;
}

export interface ClarificationQuestion {
  id: string;
  prompt: string;
}

export interface ClarificationRequest {
  questions: ClarificationQuestion[];
  partialIntent: ParsedSlots;
}

export type IntentParseOutcome =
  | {
      type: "success";
      intent: CanonicalIntent;
      warnings: string[];
    }
  | {
      type: "clarification";
      clarification: ClarificationRequest;
      warnings: string[];
    }
  | {
      type: "error";
      violations: PolicyViolation[];
      warnings: string[];
    };
