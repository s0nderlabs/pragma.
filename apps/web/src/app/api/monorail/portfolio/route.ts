import { NextResponse } from "next/server";
import { getAddress, type Address } from "viem";
import { fetchPortfolioValue } from "@pragma/core/monorail/balances";

import {
  MONORAIL_DATA_API_URL,
  MONORAIL_API_KEY,
} from "../../../../lib/config";

const config = {
  dataApiUrl: MONORAIL_DATA_API_URL,
  apiKey: MONORAIL_API_KEY,
};

export async function GET(request: Request) {
  if (!config.dataApiUrl) {
    return NextResponse.json({ error: "Monorail Data API configuration is missing" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Missing required address parameter" }, { status: 400 });
  }

  let checksummedAddress: Address;
  try {
    checksummedAddress = getAddress(address);
  } catch {
    return NextResponse.json({ error: "Invalid address format" }, { status: 400 });
  }

  try {
    const portfolio = await fetchPortfolioValue(checksummedAddress, config);
    return NextResponse.json(portfolio);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
