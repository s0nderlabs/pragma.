import { NextResponse } from "next/server";
import { getAddress, type Address } from "viem";
import { fetchWalletBalances } from "@pragma/core/monorail/balances";

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
    const balances = await fetchWalletBalances(checksummedAddress, config);
    const normalized = JSON.parse(
      JSON.stringify(balances, (_, value) => (typeof value === "bigint" ? value.toString() : value)),
    );
    return NextResponse.json(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
