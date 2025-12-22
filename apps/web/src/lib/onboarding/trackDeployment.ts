/**
 * Track Deployment Utility
 *
 * Records successful account deployments to Supabase for admin dashboard.
 */

import { type Address, type Hex } from "viem";
import { authenticatedFetch } from "../api/authenticatedFetch";

interface TrackDeploymentParams {
  txHash: Hex;
  blockNumber?: number;
  eoaAddress: Address;
  smartAccount: Address;
  factoryAddress?: Address;
  paymasterAddress?: Address;
}

interface TrackDeploymentResult {
  success: boolean;
  error?: string;
}

/**
 * Track a successful account deployment.
 * This is a fire-and-forget operation - errors are logged but not thrown.
 */
export async function trackDeployment(params: TrackDeploymentParams): Promise<TrackDeploymentResult> {
  try {
    const response = await authenticatedFetch("/api/onboarding/track-deployment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        txHash: params.txHash,
        blockNumber: params.blockNumber,
        eoaAddress: params.eoaAddress,
        smartAccount: params.smartAccount,
        factoryAddress: params.factoryAddress,
        paymasterAddress: params.paymasterAddress,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("[TrackDeployment] Failed to track deployment:", errorText);
      return { success: false, error: errorText };
    }

    const data = await response.json();
    return { success: true };
  } catch (error) {
    // Log but don't throw - tracking is non-critical
    console.warn("[TrackDeployment] Error tracking deployment:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
