import type { Address } from "viem";

import type { AllowedToken } from "../monorail/tokens.js";
import type { DelegationContext, IntentParseOutcome } from "./types.js";
import { parseIntent } from "./parser.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export const createTestToken = (overrides: Partial<AllowedToken> = {}): AllowedToken => ({
  address: overrides.address ?? ZERO_ADDRESS,
  symbol: overrides.symbol ?? "TOKEN",
  name: overrides.name ?? "Token",
  decimals: overrides.decimals ?? 18,
  kind: overrides.kind,
  categories: overrides.categories,
});

export const createDelegationContext = (
  allowedTokens: AllowedToken[],
  mode: DelegationContext["mode"] = "normal",
): DelegationContext => ({
  mode,
  allowedTokens,
  nativeTokenSymbol: "MON",
  nativeTokenAddress: ZERO_ADDRESS,
  wrappedNativeSymbol: "WMON",
  defaultSlippageBps: mode === "safe" ? 50 : 100,
  defaultDeadlineMinutes: mode === "safe" ? 15 : 30,
});

export const parseIntentForTest = (
  utterance: string,
  allowedTokens: AllowedToken[],
  mode: DelegationContext["mode"] = "normal",
): IntentParseOutcome => parseIntent(utterance, createDelegationContext(allowedTokens, mode));
