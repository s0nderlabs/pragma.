/**
 * Admin Treasury API
 *
 * Returns live treasury portfolio from Monorail API.
 * Shows all tokens held by the Pragma treasury with USD values.
 * Includes native MON balance fetched directly from RPC.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createPublicClient, http, formatUnits, getAddress } from "viem";
import { verifyToken } from "@/lib/admin/auth";

const MONORAIL_API_URL = process.env.NEXT_PUBLIC_MONORAIL_DATA_API_URL || "https://api.monorail.xyz/v2";
const PRAGMA_TREASURY_ADDRESS = process.env.PRAGMA_TREASURY_ADDRESS || "";
const MONAD_RPC_URL = process.env.MONAD_RPC_URL || process.env.MONAD_EXECUTION_RPC_URL || "";

// Create a simple public client for fetching native balance
const publicClient = createPublicClient({
  transport: http(MONAD_RPC_URL),
});

// Native MON token address (zero address)
const NATIVE_MON_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Fetch MON/USD price from Monorail token API
 */
async function fetchMonPrice(): Promise<number> {
  try {
    // v2: Use /token/{address} endpoint for native MON
    const response = await fetch(`${MONORAIL_API_URL}/token/${NATIVE_MON_ADDRESS}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 60 },
    });
    if (!response.ok) return 0;
    const data = await response.json();
    return parseFloat(data.usd_per_token || "0");
  } catch {
    return 0;
  }
}

// Monorail v2 API response format (from /wallet/{address}/balances)
interface MonorailRawToken {
  address: string;
  symbol?: string;
  name?: string;
  decimals: number;
  balance: string;
  usd_per_token?: string;
  usd_value?: string;
  image_uri?: string;
  categories?: string[];
}

export interface TreasuryToken {
  address: string;
  symbol: string;
  name: string;
  balance: number;
  price: number;
  usdValue: number;
  logoUrl?: string;
}

export interface TreasuryResponse {
  address: string;
  totalUsd: number;
  tokens: TreasuryToken[];
  lastUpdated: string;
}

export async function GET() {
  // Verify admin token
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // Check treasury address is configured
  if (!PRAGMA_TREASURY_ADDRESS) {
    return NextResponse.json(
      { error: "Treasury address not configured" },
      { status: 500 }
    );
  }

  try {
    // Fetch balances from Monorail v2 API
    const checksummedAddress = getAddress(PRAGMA_TREASURY_ADDRESS);
    const response = await fetch(
      `${MONORAIL_API_URL}/wallet/${checksummedAddress}/balances`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        next: { revalidate: 60 }, // Cache for 1 minute
      }
    );

    if (!response.ok) {
      console.error(`[Treasury] Monorail API error: ${response.status}`);
      return NextResponse.json(
        { error: "Failed to fetch treasury portfolio" },
        { status: 502 }
      );
    }

    const rawTokens: MonorailRawToken[] = await response.json();

    // Transform tokens and calculate total
    let totalUsd = 0;
    const tokens: TreasuryToken[] = [];

    for (const token of rawTokens) {
      // Parse balance (Monorail v2 returns pre-formatted balance strings)
      const balanceFormatted = parseFloat(token.balance ?? "0");

      // Skip zero balances
      if (balanceFormatted <= 0) continue;

      // Get price per token
      const price = parseFloat(token.usd_per_token ?? "0");

      // Calculate USD value
      const usdValue = balanceFormatted * price;

      // Add to total
      totalUsd += usdValue;

      tokens.push({
        address: token.address,
        symbol: token.symbol || "???",
        name: token.name || "Unknown Token",
        balance: balanceFormatted,
        price,
        usdValue,
        logoUrl: token.image_uri,
      });
    }

    // Fetch native MON balance from RPC
    try {
      const monBalanceWei = await publicClient.getBalance({
        address: checksummedAddress as `0x${string}`,
      });

      if (monBalanceWei > 0n) {
        const monBalance = parseFloat(formatUnits(monBalanceWei, 18));
        const monPrice = await fetchMonPrice();
        const monUsdValue = monBalance * monPrice;

        // Add to total
        totalUsd += monUsdValue;

        // Add MON to tokens list
        tokens.push({
          address: "0x0000000000000000000000000000000000000000",
          symbol: "MON",
          name: "Monad",
          balance: monBalance,
          price: monPrice,
          usdValue: monUsdValue,
          logoUrl: "https://monorail-static.fra1.digitaloceanspaces.com/tokens/mon-token.svg",
        });
      }
    } catch (err) {
      console.warn("[Treasury] Failed to fetch native MON balance:", err);
    }

    // Sort by USD value descending
    tokens.sort((a, b) => b.usdValue - a.usdValue);

    const treasury: TreasuryResponse = {
      address: PRAGMA_TREASURY_ADDRESS,
      totalUsd,
      tokens,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(treasury);
  } catch (error) {
    console.error("[Treasury] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch treasury data" },
      { status: 500 }
    );
  }
}
