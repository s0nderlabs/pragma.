import { formatUnits } from "viem";

import type { AmountSpecification } from "../intent/types.js";
import { callWithRetry } from "../utils/rpcFallback.js";

export interface ResolveAmountOptions {
  amount: AmountSpecification;
  tokenDecimals: number;
  fetchBalance: () => Promise<bigint>;
}

export interface ResolvedAmount {
  amountInput: string;
  resolvedDisplay?: string;
}

const isAlmostEqual = (value: number, target: number, tolerance = 0.01): boolean =>
  Math.abs(value - target) < tolerance;

export const describeAmount = (amount: AmountSpecification): string => {
  switch (amount.kind) {
    case "exact":
      return amount.value ?? "";
    case "max":
      return "max";
    case "fraction": {
      if (amount.denominator === 0) return "a portion of your balance";
      const ratio = amount.numerator / amount.denominator;
      if (isAlmostEqual(ratio, 0.5)) return "half of your balance";
      if (isAlmostEqual(ratio, 0.25)) return "a quarter of your balance";
      if (isAlmostEqual(ratio, 0.75)) return "three quarters of your balance";
      if (isAlmostEqual(ratio, 1 / 3)) return "a third of your balance";
      if (isAlmostEqual(ratio, 2 / 3)) return "two thirds of your balance";
      const percent = (ratio * 100).toFixed(2).replace(/\.00$/, "");
      return `${percent}% of your balance`;
    }
    default:
      return "unknown";
  }
};

export const resolveAmountInput = async (options: ResolveAmountOptions): Promise<ResolvedAmount> => {
  const { amount, tokenDecimals, fetchBalance } = options;

  if (amount.kind === "exact") {
    if (!amount.value) {
      throw new Error("Amount must include a numeric value.");
    }
    if (Number(amount.value) <= 0) {
      throw new Error("Amount must be greater than zero.");
    }
    return { amountInput: amount.value };
  }

  const balance = await callWithRetry(() => fetchBalance());
  if (balance <= 0n) {
    throw new Error("Delegated account balance is zero; unable to compute relative amount.");
  }

  if (amount.kind === "max") {
    const decimal = formatUnits(balance, tokenDecimals);
    return { amountInput: decimal, resolvedDisplay: decimal };
  }

  if (amount.kind === "fraction") {
    if (amount.denominator === 0) {
      throw new Error("Fraction denominator must be greater than zero.");
    }
    const fraction = (balance * BigInt(amount.numerator)) / BigInt(amount.denominator);
    if (fraction === 0n) {
      throw new Error("Computed fraction results in zero amount. Adjust the fraction or fund the account.");
    }
    const decimal = formatUnits(fraction, tokenDecimals);
    return { amountInput: decimal, resolvedDisplay: decimal };
  }

  throw new Error(`Unsupported amount specification kind ${(amount as { kind?: string }).kind ?? "unknown"}.`);
};

export type { AmountSpecification } from "../intent/types.js";
