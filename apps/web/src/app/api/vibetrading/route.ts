"use server";

import { NextRequest, NextResponse } from "next/server";
import {
  http,
  createWalletClient,
  createPublicClient,
  parseEther,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { authMiddleware } from "@/lib/auth/authMiddleware";

// Configuration
const MONAD_RPC_URL =
  process.env.MONAD_RPC_URL ??
  process.env.NEXT_PUBLIC_MONAD_RPC_URL ??
  "https://rpc.ankr.com/monad_mainnet";
const MONAD_CHAIN_ID = Number.parseInt(
  process.env.MONAD_CHAIN_ID ?? process.env.NEXT_PUBLIC_MONAD_CHAIN_ID ?? "143",
  10
);

const monadChain = {
  id: MONAD_CHAIN_ID,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [MONAD_RPC_URL] },
    public: { http: [MONAD_RPC_URL] },
  },
} as const;

// Vibetrading amount: exactly 5 MON
const VIBETRADING_AMOUNT = parseEther("5");
// Hex representation for Hypersync comparison: 0x4563918244F40000
const VIBETRADING_AMOUNT_HEX = "0x4563918244F40000";

// Hypersync configuration
const HYPERSYNC_URL = process.env.MONAD_HYPERSYNC_URL ?? "https://monad.hypersync.xyz/query";
const ENVIO_TOKEN = process.env.ENVIO_TOKEN_API;

interface HypersyncTransaction {
  block_number: number;
  hash: string;
  from: string;
  to: string;
  value: string;
}

interface HypersyncResponse {
  data: Array<{
    transactions?: HypersyncTransaction[];
  }>;
  archive_height: number;
  next_block: number;
}

/**
 * Check if user has already claimed via Hypersync
 * Queries transactions from admin address to user address with exact 5 MON value
 */
async function hasAlreadyClaimedViaHypersync(
  adminAddress: Address,
  userAddress: Address
): Promise<{ claimed: boolean; txHash?: string }> {
  if (!ENVIO_TOKEN) {
    console.warn("[Vibetrading] ENVIO_TOKEN_API not configured, skipping Hypersync check");
    return { claimed: false };
  }

  try {
    const response = await fetch(HYPERSYNC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENVIO_TOKEN}`,
      },
      body: JSON.stringify({
        from_block: 0,
        transactions: [
          {
            from: [adminAddress.toLowerCase()],
            to: [userAddress.toLowerCase()],
          },
        ],
        field_selection: {
          transaction: ["block_number", "hash", "from", "to", "value"],
        },
      }),
    });

    if (!response.ok) {
      console.error(`[Vibetrading] Hypersync query failed: ${response.status}`);
      return { claimed: false };
    }

    const result: HypersyncResponse = await response.json();

    // Check all transactions for exact 5 MON value
    for (const dataItem of result.data) {
      if (!dataItem.transactions) continue;

      for (const tx of dataItem.transactions) {
        // Compare hex values (Hypersync returns value as hex string)
        if (tx.value.toLowerCase() === VIBETRADING_AMOUNT_HEX.toLowerCase()) {
          return { claimed: true, txHash: tx.hash };
        }
      }
    }

    return { claimed: false };
  } catch (error) {
    console.error("[Vibetrading] Hypersync query error:", error);
    // On error, allow claim (fail open for testnet)
    return { claimed: false };
  }
}

/**
 * POST /api/vibetrading
 *
 * Easter egg endpoint for beta testers.
 * Sends 5 MON to the user's smart account (one-time only).
 * Uses Hypersync to verify no duplicate claims.
 */
export async function POST(request: NextRequest) {
  // ✅ SECURITY: Require authentication to prevent unauthorized claims
  const authError = await authMiddleware(request);
  if (authError) return authError;

  try {
    // Parse request body
    const body = (await request.json()) as {
      smartAccount?: string;
    };

    const smartAccount = body.smartAccount as Address | undefined;
    if (!smartAccount) {
      return NextResponse.json(
        { success: false, error: "Missing smartAccount in request body" },
        { status: 400 }
      );
    }

    // Get admin private key (testnet only)
    const adminKey = process.env.PRAGMA_ADMIN_TESTNET_PK;
    if (!adminKey) {
      console.error("[Vibetrading] PRAGMA_ADMIN_TESTNET_PK not configured");
      return NextResponse.json(
        { success: false, error: "Vibetrading not configured on server" },
        { status: 500 }
      );
    }

    // Create wallet client
    const account = privateKeyToAccount(`0x${adminKey.replace(/^0x/, "")}` as Hex);

    // Check if already claimed via Hypersync
    const claimCheck = await hasAlreadyClaimedViaHypersync(account.address, smartAccount);
    if (claimCheck.claimed) {
      return NextResponse.json({
        success: false,
        reason: "already_claimed",
        message: "You've already claimed your vibetrading airdrop!",
        txHash: claimCheck.txHash,
      });
    }

    const walletClient = createWalletClient({
      account,
      chain: monadChain,
      transport: http(MONAD_RPC_URL),
    });

    const publicClient = createPublicClient({
      chain: monadChain,
      transport: http(MONAD_RPC_URL),
    });

    // Check admin balance before sending
    const adminBalance = await publicClient.getBalance({ address: account.address });
    if (adminBalance < VIBETRADING_AMOUNT) {
      console.error(
        `[Vibetrading] Insufficient admin balance: ${adminBalance} < ${VIBETRADING_AMOUNT}`
      );
      return NextResponse.json(
        { success: false, error: "Vibetrading funds depleted. Contact team." },
        { status: 503 }
      );
    }

    // Send 5 MON to user's smart account
    const txHash = await walletClient.sendTransaction({
      to: smartAccount,
      value: VIBETRADING_AMOUNT,
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== "success") {
      console.error(`[Vibetrading] Transaction failed: ${txHash}`);
      return NextResponse.json(
        { success: false, error: "Transaction failed on chain" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      txHash,
      amount: "5 MON",
      message: "Welcome to vibetrading!",
      smartAccount,
    });
  } catch (error) {
    console.error("[Vibetrading] Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * GET /api/vibetrading
 *
 * Check claim status for an address via Hypersync.
 */
export async function GET(request: NextRequest) {
  // ✅ SECURITY: Require authentication for status checks
  const authError = await authMiddleware(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") as Address | null;

  if (!address) {
    return NextResponse.json(
      { error: "Missing address query parameter" },
      { status: 400 }
    );
  }

  // Get admin address to check for vibetrading transfers
  const adminKey = process.env.PRAGMA_ADMIN_TESTNET_PK;
  if (!adminKey) {
    return NextResponse.json(
      { error: "Vibetrading not configured" },
      { status: 500 }
    );
  }

  const account = privateKeyToAccount(`0x${adminKey.replace(/^0x/, "")}` as Hex);
  const claimCheck = await hasAlreadyClaimedViaHypersync(account.address, address);

  if (claimCheck.claimed) {
    return NextResponse.json({
      claimed: true,
      txHash: claimCheck.txHash,
    });
  }

  return NextResponse.json({
    claimed: false,
  });
}
