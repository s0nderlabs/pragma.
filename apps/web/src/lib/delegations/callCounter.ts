/**
 * Call Counter Utility
 *
 * Fetches on-chain call usage data for delegations with call limits
 * by querying the LimitedCallsEnforcer contract.
 */

import { getAddress, type Address, type Hex, type PublicClient } from "viem";
import { getDeleGatorEnvironment } from "@metamask/delegation-toolkit";
import type { DelegationArtifact } from "@pragma/core/delegations/types";
import { DELEGATION_MANAGER_ABI, LIMITED_CALLS_ABI } from "../contracts/abis";

// Use testnet chain ID (10143) for DTK environment lookup since:
// 1. DTK doesn't have mainnet (143) in its registry yet
// 2. All DTK contracts are deployed at same CREATE2 addresses on both networks
const DTK_CHAIN_ID_FOR_ADDRESSES = 10143;
const environment = getDeleGatorEnvironment(DTK_CHAIN_ID_FOR_ADDRESSES);

export interface CallCountResult {
  used: bigint;
  limit: bigint;
  remaining: bigint;
  percentage: number;
  isUnlimited: boolean;
}

export interface CallCountError {
  error: string;
}

export type CallCountResponse = CallCountResult | CallCountError;

/**
 * Normalize delegation artifact to match contract format
 */
const normalizeDelegation = (artifact: DelegationArtifact) => {
  return {
    delegate: getAddress(artifact.delegation.delegate),
    delegator: getAddress(artifact.delegation.delegator),
    authority: artifact.delegation.authority as Hex,
    caveats: (artifact.delegation.caveats ?? []).map((caveat) => ({
      enforcer: getAddress(caveat.enforcer),
      terms: (caveat.terms ?? "0x") as Hex,
      args: (caveat.args ?? "0x") as Hex,
    })),
    salt: BigInt(artifact.delegation.salt ?? "0x0"),
    signature: artifact.delegation.signature as Hex,
  };
};

/**
 * Fetch on-chain call count for a delegation
 *
 * @param publicClient - Viem public client for reading contract state
 * @param artifact - Delegation artifact containing delegation details and call limits
 * @returns Call count information or error
 */
export const fetchDelegationCallCount = async (
  publicClient: PublicClient,
  artifact: DelegationArtifact,
): Promise<CallCountResponse> => {
  // Handle unlimited calls case
  if (artifact.callsUnlimited || !artifact.callLimit) {
    return {
      used: 0n,
      limit: 0n,
      remaining: 0n,
      percentage: 0,
      isUnlimited: true,
    };
  }

  const limitedCallsAddress = environment.caveatEnforcers?.LimitedCallsEnforcer;

  // If enforcer address not found, return error
  if (!limitedCallsAddress) {
    return {
      error: "LimitedCallsEnforcer address not found in environment",
    };
  }

  try {
    // Normalize delegation to match contract format
    const normalizedDelegation = normalizeDelegation(artifact);

    // Get delegation hash from DelegationManager
    const delegationHash = (await publicClient.readContract({
      address: environment.DelegationManager as Address,
      abi: DELEGATION_MANAGER_ABI,
      functionName: "getDelegationHash",
      args: [normalizedDelegation],
    })) as Hex;

    // Get used calls from LimitedCallsEnforcer
    const usedCalls = (await publicClient.readContract({
      address: limitedCallsAddress as Address,
      abi: LIMITED_CALLS_ABI,
      functionName: "callCounts",
      args: [environment.DelegationManager as Address, delegationHash],
    })) as bigint;

    const limitBigInt = BigInt(artifact.callLimit);
    const remainingBigInt = limitBigInt > usedCalls ? limitBigInt - usedCalls : 0n;

    // Calculate percentage used (0-100)
    const percentage = Number((usedCalls * 100n) / limitBigInt);

    return {
      used: usedCalls,
      limit: limitBigInt,
      remaining: remainingBigInt,
      percentage,
      isUnlimited: false,
    };
  } catch (error) {
    // Return error with graceful degradation
    return {
      error: error instanceof Error ? error.message : "Failed to fetch call count",
    };
  }
};

/**
 * Type guard to check if response is an error
 */
export const isCallCountError = (
  response: CallCountResponse,
): response is CallCountError => {
  return "error" in response;
};
