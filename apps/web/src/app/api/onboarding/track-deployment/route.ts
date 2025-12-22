/**
 * Track Deployment API Route
 *
 * Records account deployments to Supabase for admin dashboard tracking.
 * Called by the frontend after successful HybridDelegator deployment.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { authMiddleware } from "@/lib/auth/authMiddleware";
import { recordDeployment } from "@/lib/admin/queries";

export async function POST(request: NextRequest) {
  // Require authentication
  const authError = await authMiddleware(request);
  if (authError) return authError;

  try {
    const body = await request.json();

    const { txHash, blockNumber, eoaAddress, smartAccount, factoryAddress, paymasterAddress } = body as {
      txHash?: string;
      blockNumber?: number;
      eoaAddress?: string;
      smartAccount?: string;
      factoryAddress?: string;
      paymasterAddress?: string;
    };

    // Validate required fields
    if (!txHash || typeof txHash !== "string") {
      return NextResponse.json({ error: "Missing or invalid txHash" }, { status: 400 });
    }

    if (!eoaAddress || !isAddress(eoaAddress)) {
      return NextResponse.json({ error: "Missing or invalid eoaAddress" }, { status: 400 });
    }

    if (!smartAccount || !isAddress(smartAccount)) {
      return NextResponse.json({ error: "Missing or invalid smartAccount" }, { status: 400 });
    }

    // Record to Supabase
    const deployment = await recordDeployment({
      txHash: txHash.toLowerCase(),
      blockNumber: typeof blockNumber === "number" ? blockNumber : undefined,
      eoaAddress: getAddress(eoaAddress),
      smartAccount: getAddress(smartAccount),
      factoryAddress: factoryAddress ? getAddress(factoryAddress) : undefined,
      paymasterAddress: paymasterAddress ? getAddress(paymasterAddress) : undefined,
    });

    console.log(`[TrackDeployment] Recorded: ${smartAccount} owned by ${eoaAddress}`);

    return NextResponse.json({
      success: true,
      deployment: {
        id: deployment.id,
        smartAccount: deployment.smart_account,
        eoaAddress: deployment.eoa_address,
      },
    });
  } catch (error) {
    console.error("[TrackDeployment] Error:", error);

    // Handle duplicate key error gracefully
    if (error instanceof Error && error.message.includes("already recorded")) {
      return NextResponse.json({ success: true, message: "Already recorded" });
    }

    const message = error instanceof Error ? error.message : "Failed to track deployment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
