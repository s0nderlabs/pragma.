"use client";

import { getAddress } from "viem";
import type { QuoteRequestParams, MonorailQuote } from "@pragma/core/monorail/pathfinder";
import { fetchMonorailQuote as coreFetchMonorailQuote } from "@pragma/core/monorail/pathfinder";

import {
  MONORAIL_APP_ID,
  MONORAIL_PATHFINDER_URL,
  MONORAIL_AGGREGATOR_ADDRESS,
} from "../config";

// Browser routes through /api/monorail/quote proxy (no API key needed)
// SSR fallback config (API key stored server-side in proxy routes)
const config = {
  appId: MONORAIL_APP_ID ?? "",
  pathfinderUrl: MONORAIL_PATHFINDER_URL,
  aggregatorAddress: getAddress(MONORAIL_AGGREGATOR_ADDRESS),
  apiKey: undefined, // Not needed - browser uses proxy, SSR shouldn't happen
};

type SerializableQuote = Omit<MonorailQuote, "transactionValue" | "rawInput" | "rawOutput" | "rawMinOutput" | "gasEstimate" | "fees"> & {
  transactionValue?: string | number | bigint | null;
  rawInput?: string | number | bigint | null;
  rawOutput?: string | number | bigint | null;
  rawMinOutput?: string | number | bigint | null;
  gasEstimate?: string | number | bigint | null;
  fees?: {
    protocolAmount?: string | number | bigint | null;
    protocolBps?: number;
    feeShareAmount?: string | number | bigint | null;
    feeShareBps?: number;
  } | null;
};

const parseBigInt = (value: unknown): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.length > 0) return BigInt(value);
  throw new Error("Expected bigint-compatible value");
};

const parseOptionalBigInt = (value: unknown): bigint | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  return parseBigInt(value);
};

const reviveQuote = (quote: SerializableQuote): MonorailQuote => {
  return {
    ...quote,
    transactionValue: parseBigInt(quote.transactionValue ?? 0n),
    rawInput: parseBigInt(quote.rawInput ?? 0n),
    rawOutput: parseBigInt(quote.rawOutput ?? 0n),
    rawMinOutput: parseBigInt(quote.rawMinOutput ?? 0n),
    gasEstimate: parseOptionalBigInt(quote.gasEstimate),
    fees: quote.fees
      ? {
          protocolAmount: parseOptionalBigInt(quote.fees.protocolAmount),
          protocolBps: quote.fees.protocolBps,
          feeShareAmount: parseOptionalBigInt(quote.fees.feeShareAmount),
          feeShareBps: quote.fees.feeShareBps,
        }
      : undefined,
  };
};

export const fetchMonorailQuote = async (params: QuoteRequestParams): Promise<MonorailQuote> => {
  if (typeof window === "undefined") {
    return coreFetchMonorailQuote(params, config);
  }

  const response = await fetch("/api/monorail/quote", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    let message = `Monorail quote request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) {
        // Preserve status code in message for proper error handling
        message = `Monorail quote request failed (${response.status}): ${body.error}`;
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  const data = await response.json();
  return reviveQuote(data);
};
