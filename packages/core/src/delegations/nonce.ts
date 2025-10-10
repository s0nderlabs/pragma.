import type { Address, PublicClient } from "viem";

import { createErrorFromCode } from "../errors/index.js";

import type { DeleGatorEnv } from "./types.js";

const NONCE_ENFORCER_ABI = [
  {
    type: "function",
    name: "currentNonce",
    stateMutability: "view",
    inputs: [
      { name: "delegationManager", type: "address" },
      { name: "delegator", type: "address" },
    ],
    outputs: [{ name: "nonce", type: "uint256" }],
  },
] as const;

export const fetchDelegatorNonce = async (
  publicClient: PublicClient,
  environment: DeleGatorEnv,
  delegator: Address,
): Promise<bigint> => {
  const nonceEnforcerAddress = environment.caveatEnforcers?.NonceEnforcer;
  if (!nonceEnforcerAddress) {
    throw createErrorFromCode("CONFIG_MISSING", {
      message: "NonceEnforcer address missing in environment configuration",
      context: { component: "NonceEnforcer" },
    });
  }

  return (await publicClient.readContract({
    address: nonceEnforcerAddress as Address,
    abi: NONCE_ENFORCER_ABI,
    functionName: "currentNonce",
    args: [environment.DelegationManager as Address, delegator],
  })) as bigint;
};
