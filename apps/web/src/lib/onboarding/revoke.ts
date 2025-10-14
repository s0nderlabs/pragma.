"use client";

import { encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import type { Mode } from "@pragma/core/delegations/types";

import { createHybridDelegatorHandle, fetchHybridDelegatorOwner } from "./hybridDelegator";
import { markDelegationsRevoked, listDelegations } from "../storage/delegations";
import { clearQuickModePreference } from "../storage/quick-mode";
import { IDENTITY_EVENT } from "../storage/active-delegator";
import type { WalletWithAddress } from "../clients";

const NONCE_ENFORCER_ABI = [
  {
    type: "function",
    name: "incrementNonce",
    stateMutability: "nonpayable",
    inputs: [{ name: "delegationManager", type: "address" }],
    outputs: [],
  },
] as const;

const DELEGATION_MANAGER_DISABLE_ABI = [
  {
    type: "function",
    name: "disableDelegation",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "delegation",
        type: "tuple",
        components: [
          { name: "delegate", type: "address" },
          { name: "delegator", type: "address" },
          { name: "authority", type: "bytes32" },
          {
            name: "caveats",
            type: "tuple[]",
            components: [
              { name: "enforcer", type: "address" },
              { name: "terms", type: "bytes" },
              { name: "args", type: "bytes" },
            ],
          },
          { name: "salt", type: "uint256" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

export interface RevokeDelegationsOptions {
  walletClient: WalletWithAddress["walletClient"];
  ownerAddress: Address;
  mode?: Mode;
  delegationId?: string;
}

export interface RevokeDelegationsResult {
  delegator: Address;
  userOperationHash?: Hex;
  transactionHash?: Hex;
  revokedDelegations: ReturnType<typeof markDelegationsRevoked>;
  simulated: boolean;
}

const isMockIdentity = process.env.NEXT_PUBLIC_PRAGMA_IDENTITY_PROVIDER === "mock";

export const revokeDelegations = async ({
  walletClient,
  ownerAddress,
  mode,
  delegationId,
}: RevokeDelegationsOptions): Promise<RevokeDelegationsResult> => {
  const normalizedOwner = getAddress(ownerAddress);
  const handle = await createHybridDelegatorHandle(walletClient, normalizedOwner);
  const { bundlerClient, smartAccount, environment, delegator } = handle;

  const currentOwner = await fetchHybridDelegatorOwner(handle);
  if (currentOwner && currentOwner.toLowerCase() !== normalizedOwner.toLowerCase()) {
    throw new Error(
      `Connected wallet ${normalizedOwner} does not control HybridDelegator ${delegator}. Expected owner ${currentOwner}.`,
    );
  }

  const nonceEnforcerAddress = environment.caveatEnforcers?.NonceEnforcer;
  if (!nonceEnforcerAddress) {
    throw new Error("NonceEnforcer address missing from environment; cannot revoke delegations.");
  }

  if (!environment.DelegationManager) {
    throw new Error("DelegationManager address missing from environment; cannot revoke delegations.");
  }

  const entries = listDelegations(delegator).filter((entry) => {
    if (entry.revokedAt) return false;
    if (!mode) return true;
    return (entry.artifact.mode ?? "safe") === mode;
  });

  const targetDelegation = delegationId
    ? entries.find((entry) => entry.id === delegationId)
    : entries[0];

  const calls: { to: Address; data: Hex; value?: bigint }[] = [];

  const incrementData = encodeFunctionData({
    abi: NONCE_ENFORCER_ABI,
    functionName: "incrementNonce",
    args: [getAddress(environment.DelegationManager as Address)],
  });
  calls.push({ to: getAddress(nonceEnforcerAddress as Address), data: incrementData });

  if (targetDelegation?.artifact.delegation) {
    const delegationStruct = {
      ...targetDelegation.artifact.delegation,
      salt: BigInt(targetDelegation.artifact.delegation.salt),
    };
    const disableData = encodeFunctionData({
      abi: DELEGATION_MANAGER_DISABLE_ABI,
      functionName: "disableDelegation",
      args: [delegationStruct],
    });
    calls.push({ to: getAddress(environment.DelegationManager as Address), data: disableData });
  }

  if (calls.length === 0) {
    throw new Error("No delegation revoke actions prepared.");
  }

  let userOperationHash: Hex | undefined;
  let transactionHash: Hex | undefined;
  const simulated = isMockIdentity;

  if (!simulated) {
    userOperationHash = await bundlerClient.sendUserOperation({
      account: smartAccount,
      entryPointAddress: environment.EntryPoint as Address,
      calls,
    });
    const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOperationHash });
    transactionHash = receipt.receipt?.transactionHash as Hex | undefined;
    if (!transactionHash) {
      throw new Error("Delegation revoke completed without transaction hash.");
    }
  }

  const revokedEntries = markDelegationsRevoked(delegator);
  clearQuickModePreference(delegator);

  if (typeof window !== "undefined") {
    const detail = { delegator: getAddress(delegator), owner: normalizedOwner } as const;
    window.dispatchEvent(new Event("pragma:delegation:updated"));
    window.dispatchEvent(new CustomEvent(IDENTITY_EVENT, { detail }));
  }

  return {
    delegator,
    userOperationHash,
    transactionHash,
    revokedDelegations: revokedEntries,
    simulated,
  };
};
