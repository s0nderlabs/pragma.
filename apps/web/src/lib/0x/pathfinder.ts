"use client";

/**
 * 0x Browser Pathfinder Client
 *
 * Browser-side client that calls our /api/0x/quote proxy route.
 * Uses authenticatedFetch for security.
 */

import { getAddress, type Address, type Hex } from "viem";
import { authenticatedFetch } from "../api/authenticatedFetch";
import type { StandardQuote } from "@pragma/core/aggregators";

/**
 * 0x API response types
 */
interface ZeroXTransaction {
  to: string;
  data: string;
  gas: string;
  gasPrice: string;
  value: string;
}

interface ZeroXRouteFill {
  source: string;
  proportion: string;
}

interface ZeroXRoute {
  fills: ZeroXRouteFill[];
}

interface ZeroXQuoteResponse {
  liquidityAvailable: boolean;
  sellAmount: string;
  buyAmount: string;
  minBuyAmount: string;
  transaction: ZeroXTransaction;
  route?: ZeroXRoute;
}

/**
 * Quote request parameters for 0x
 */
export interface ZeroXQuoteParams {
  fromToken: Address;
  toToken: Address;
  amountWei: bigint;
  sender: Address;
  slippageBps: number;
}

/**
 * Fetch a quote from 0x via our API proxy
 */
export async function fetchZeroXQuote(params: ZeroXQuoteParams): Promise<StandardQuote | null> {
  try {
    const response = await authenticatedFetch("/api/0x/quote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fromToken: params.fromToken,
        toToken: params.toToken,
        amountWei: params.amountWei.toString(),
        sender: params.sender,
        slippageBps: params.slippageBps,
      }),
    });

    if (!response.ok) {
      let message = `0x quote request failed (${response.status})`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body?.error) {
          message = `0x quote request failed (${response.status}): ${body.error}`;
        }
      } catch {
        // ignore JSON parse errors
      }
      console.error("[0x Browser]", message);
      return null;
    }

    const data = (await response.json()) as ZeroXQuoteResponse;

    if (!data.liquidityAvailable) {
      console.log("[0x Browser] No liquidity available");
      return null;
    }

    if (!data.transaction?.data) {
      console.error("[0x Browser] Missing transaction data");
      return null;
    }

    // Extract route info
    const routeInfo = data.route?.fills?.[0]?.source;

    return {
      aggregator: "0x",
      aggregatorAddress: getAddress(data.transaction.to) as Address,
      transactionData: data.transaction.data as Hex,
      transactionValue: BigInt(data.transaction.value || "0"),
      rawInput: BigInt(data.sellAmount),
      rawOutput: BigInt(data.buyAmount),
      rawMinOutput: BigInt(data.minBuyAmount),
      gasEstimate: data.transaction.gas ? BigInt(data.transaction.gas) : undefined,
      routeInfo,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error("[0x Browser] Failed to fetch quote:", error);
    return null;
  }
}
