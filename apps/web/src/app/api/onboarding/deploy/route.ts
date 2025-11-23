"use server";

import { NextRequest, NextResponse } from "next/server";
import { http, createWalletClient, createPublicClient, type Hex, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const MONAD_RPC_URL =
  process.env.MONAD_RPC_URL ?? process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const MONAD_CHAIN_ID = Number.parseInt(process.env.MONAD_CHAIN_ID ?? process.env.NEXT_PUBLIC_MONAD_CHAIN_ID ?? "10143", 10);
const MONAD_NATIVE_TOKEN_SYMBOL = process.env.MONAD_NATIVE_TOKEN_SYMBOL ?? "MON";
const FACTORY_ADDRESS = "0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c";

const monadChain = {
  id: MONAD_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: MONAD_NATIVE_TOKEN_SYMBOL, decimals: 18 },
  rpcUrls: { default: { http: [MONAD_RPC_URL] }, public: { http: [MONAD_RPC_URL] } },
} as const;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      factory?: string;
      factoryData?: string;
      delegator?: string;
      owner?: string;
    };

    const factory = body.factory ? getAddress(body.factory as string) : null;
    const factoryData = body.factoryData as Hex | undefined;
    if (!factory || !factoryData) {
      return NextResponse.json({ error: "Missing factory deployment data" }, { status: 400 });
    }
    if (factory.toLowerCase() !== FACTORY_ADDRESS.toLowerCase()) {
      return NextResponse.json({ error: "Unsupported factory address" }, { status: 400 });
    }

    // Use server-only admin key (never NEXT_PUBLIC_)
    const adminKey = process.env.PRAGMA_ADMIN_TEST_PK;
    if (!adminKey) {
      return NextResponse.json(
        { error: "Admin fallback not configured (PRAGMA_ADMIN_TEST_PK required)" },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(adminKey as Hex);

    const walletClient = createWalletClient({
      account,
      chain: monadChain,
      transport: http(MONAD_RPC_URL),
    });

    const txHash = await walletClient.sendTransaction({
      account,
      to: factory,
      data: factoryData,
      value: 0n,
    });

    const publicClient = createPublicClient({
      chain: monadChain,
      transport: http(MONAD_RPC_URL),
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return NextResponse.json({ transactionHash: txHash });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
