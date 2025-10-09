import type { Address } from "viem";

import type { AllowedToken } from "../monorail/tokens.js";
import type { Mode } from "../delegations/types.js";

export type IntentAction = "swap" | "wrap" | "unwrap" | "transfer" | "delegation_issue";

export type AmountKind = "exact" | "max" | "fraction";

export interface ExactAmount {
  kind: "exact";
  /** Decimal string representation supplied by the user (not yet converted to wei). */
  value: string;
  /** Optional resolved wei amount (as a decimal string) once decimals are known. */
  valueWei?: string;
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
  deadlineTimestamp: number;
  chainId?: number;
  sessionKeyId?: string;
  nonce?: number;
  feeBps?: number;
  feeRecipient?: Address;
  defaultsApplied?: string[];
  symbolResolutions?: Record<string, Address>;
  amountWei?: string;
}

export interface WrapIntentFields {
  action: "wrap" | "unwrap";
  amount: AmountSpecification;
  amountWei?: string;
}

export interface TransferIntentFields {
  action: "transfer";
  /** If undefined, the intent refers to native token. */
  token?: AllowedToken;
  amount: AmountSpecification;
  recipient?: Address;
  amountWei?: string;
}

export interface DelegationIssueIntentFields {
  action: "delegation_issue";
  mode?: Mode;
}

export interface IntentMeta {
  sourceText?: string;
  defaultsApplied?: string[];
  symbolResolutions?: Record<string, Address>;
  policySnapshotId?: string;
  sessionKeyId?: string;
  nonce?: number;
  chainId?: number;
  feeBps?: number;
  feeRecipient?: Address;
  amountExactWei?: string;
}

export type CanonicalIntent =
  | SwapIntentFields
  | WrapIntentFields
  | TransferIntentFields
  | DelegationIssueIntentFields;

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
  mode?: Mode;
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
  chainId?: number;
  sessionKeyId?: string;
  nonce?: number;
  feeBps?: number;
  feeRecipient?: Address;
  policySnapshotId?: string;
  nowSeconds?: number;
  /** Optional per-token caps (wei) keyed by lowercased token address. */
  perTokenCapsWei?: Record<string, bigint>;
  /** Optional native token cap (wei). */
  nativeTokenCapWei?: bigint;
  /** Optional pair restriction for safe-mode delegations. */
  pairAddresses?: Address[];
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
      meta?: IntentMeta;
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
