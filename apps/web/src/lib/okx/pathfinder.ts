"use client";

/**
 * OKX Browser Pathfinder Client
 *
 * Browser-side client that calls our /api/okx/swap proxy route.
 * Uses authenticatedFetch for security.
 */

import { getAddress, type Address, type Hex } from "viem";
import { authenticatedFetch } from "../api/authenticatedFetch";
import type { StandardQuote } from "@pragma/core/aggregators";

/**
 * OKX API response types
 */
interface OkxTransaction {
  to: string;
  data: string;
  gas: string;
  gasPrice: string;
  value: string;
  from: string;
  minReceiveAmount: string;
  slippagePercent: string;
}

interface OkxDexProtocol {
  dexName: string;
  percent: string;
}

interface OkxDexRouter {
  dexProtocol: OkxDexProtocol;
}

interface OkxRouterResult {
  fromTokenAmount: string;
  toTokenAmount: string;
  dexRouterList?: OkxDexRouter[];
}

interface OkxSwapData {
  routerResult: OkxRouterResult;
  tx: OkxTransaction;
}

interface OkxSwapResponse {
  code: string;
  msg: string;
  data?: OkxSwapData[];
}

/**
 * Quote request parameters for OKX
 */
export interface OkxQuoteParams {
  fromToken: Address;
  toToken: Address;
  amountWei: bigint;
  sender: Address;
  slippageBps: number;
}

/**
 * Fetch a quote from OKX via our API proxy
 */
export async function fetchOkxQuote(params: OkxQuoteParams): Promise<StandardQuote | null> {
  try {
    const response = await authenticatedFetch("/api/okx/swap", {
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
      let message = `OKX swap request failed (${response.status})`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body?.error) {
          message = `OKX swap request failed (${response.status}): ${body.error}`;
        }
      } catch {
        // ignore JSON parse errors
      }
      console.error("[OKX Browser]", message);
      return null;
    }

    const data = (await response.json()) as OkxSwapResponse;

    if (data.code !== "0") {
      console.error(`[OKX Browser] API error (${data.code}):`, data.msg);
      return null;
    }

    const swapData = data.data?.[0];
    if (!swapData?.tx?.data) {
      console.error("[OKX Browser] Missing transaction data");
      return null;
    }

    const { routerResult, tx } = swapData;

    // Extract route info
    const routeInfo = routerResult.dexRouterList?.[0]?.dexProtocol?.dexName;

    // Calculate min output
    const toTokenAmount = BigInt(routerResult.toTokenAmount);
    const minReceiveAmount = tx.minReceiveAmount
      ? BigInt(tx.minReceiveAmount)
      : toTokenAmount * BigInt(10000 - params.slippageBps) / 10000n;

    return {
      aggregator: "okx",
      aggregatorAddress: getAddress(tx.to) as Address,
      transactionData: tx.data as Hex,
      transactionValue: BigInt(tx.value || "0"),
      rawInput: BigInt(routerResult.fromTokenAmount),
      rawOutput: toTokenAmount,
      rawMinOutput: minReceiveAmount,
      gasEstimate: tx.gas ? BigInt(tx.gas) : undefined,
      routeInfo,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error("[OKX Browser] Failed to fetch quote:", error);
    return null;
  }
}
