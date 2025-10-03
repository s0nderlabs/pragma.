import { getAddress } from "viem";
import type { Address } from "viem";
import { ROOT_AUTHORITY } from "@metamask/delegation-toolkit";
import type { Delegation } from "@metamask/delegation-toolkit";

const SIGNABLE_DELEGATION_TYPED_DATA: Record<string, Array<{ name: string; type: string }>> = {
  Caveat: [
    { name: "enforcer", type: "address" },
    { name: "terms", type: "bytes" },
    { name: "args", type: "bytes" },
  ],
  Delegation: [
    { name: "delegate", type: "address" },
    { name: "delegator", type: "address" },
    { name: "authority", type: "bytes32" },
    { name: "caveats", type: "Caveat[]" },
    { name: "salt", type: "uint256" },
  ],
};

type TypedData = {
  domain: {
    chainId: number;
    name: string;
    version: string;
    verifyingContract: Address;
  };
  types: typeof SIGNABLE_DELEGATION_TYPED_DATA;
  primaryType: "Delegation";
  message: {
    delegate: Address;
    delegator: Address;
    authority: string;
    caveats: Array<{ enforcer: Address; terms: string; args: string }>;
    salt: string;
  };
};

export const buildDelegationTypedData = (
  delegation: Delegation,
  chainId: number,
  verifyingContract: Address,
): TypedData => {
  const caveats = (delegation.caveats ?? []).map((caveat) => ({
    enforcer: getAddress(caveat.enforcer),
    terms: caveat.terms,
    args: caveat.args ?? "0x",
  }));

  const authority = delegation.authority && delegation.authority !== "0x"
    ? delegation.authority
    : ROOT_AUTHORITY;

  const saltSource = delegation.salt ?? "0x0";
  const saltBigInt = saltSource === "0x" ? 0n : BigInt(saltSource);

  return {
    domain: {
      chainId,
      name: "DelegationManager",
      version: "1",
      verifyingContract,
    },
    types: SIGNABLE_DELEGATION_TYPED_DATA,
    primaryType: "Delegation",
    message: {
      delegate: getAddress(delegation.delegate),
      delegator: getAddress(delegation.delegator),
      authority,
      caveats,
      salt: saltBigInt.toString(),
    },
  };
};
