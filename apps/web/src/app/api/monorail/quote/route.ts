import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { fetchMonorailQuote as coreFetchMonorailQuote } from "@pragma/core/monorail/pathfinder";
import type { QuoteRequestParams } from "@pragma/core/monorail/pathfinder";

import {
  MONORAIL_AGGREGATOR_ADDRESS,
  MONORAIL_APP_ID,
  MONORAIL_PATHFINDER_URL,
} from "../../../../lib/config";

// Server-only secrets (never exposed to browser)
const config = {
  appId: MONORAIL_APP_ID ?? "",
  pathfinderUrl: MONORAIL_PATHFINDER_URL,
  aggregatorAddress: getAddress(MONORAIL_AGGREGATOR_ADDRESS),
  apiKey: process.env.MONORAIL_API_KEY,
};

const sanitizePayload = (payload: QuoteRequestParams): QuoteRequestParams => ({
  ...payload,
  fromToken: getAddress(payload.fromToken),
  toToken: getAddress(payload.toToken),
  sender: getAddress(payload.sender),
  destination: payload.destination ? getAddress(payload.destination) : payload.sender,
});

export async function POST(request: Request) {
  if (!config.appId || !config.pathfinderUrl) {
    return NextResponse.json({ error: "Monorail configuration is missing" }, { status: 500 });
  }

  let body: QuoteRequestParams;
  try {
    body = (await request.json()) as QuoteRequestParams;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!body?.fromToken || !body?.toToken || !body?.amountDecimal || !body?.sender) {
    return NextResponse.json({ error: "Missing required quote parameters" }, { status: 400 });
  }

  try {
    const quote = await coreFetchMonorailQuote(sanitizePayload(body), config);
    const normalized = JSON.parse(
      JSON.stringify(quote, (_, value) => (typeof value === "bigint" ? value.toString() : value)),
    );
    return NextResponse.json(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
