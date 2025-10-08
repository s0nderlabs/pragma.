import { Address, Hex, getAddress, getFunctionSelector, toHex } from "viem";
import type { Caveats } from "@metamask/delegation-toolkit";

import type { AllowedToken } from "../monorail/tokens.js";
import { DEFAULT_CALL_LIMITS, type Mode } from "./types.js";

export const ZERO_SALT = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

export const AGGREGATE_SELECTOR = getFunctionSelector({
  type: "function",
  name: "aggregate",
  stateMutability: "payable",
  inputs: [
    { name: "tokenIn", type: "address" },
    { name: "tokenOut", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "minAmountOut", type: "uint256" },
    { name: "destination", type: "address" },
    { name: "deadline", type: "uint256" },
    { name: "referrer", type: "uint64" },
    { name: "quoteId", type: "uint64" },
    {
      name: "trades",
      type: "tuple[]",
      components: [
        { name: "minAmountOut", type: "uint256" },
        { name: "weight", type: "uint32" },
        { name: "routerType", type: "uint8" },
        { name: "router", type: "address" },
        { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" },
        { name: "params", type: "bytes" },
      ],
    },
  ],
  outputs: [],
}) as Hex;

export const APPROVE_SELECTOR = getFunctionSelector({
  type: "function",
  name: "approve",
  stateMutability: "nonpayable",
  inputs: [
    { name: "spender", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  outputs: [{ name: "", type: "bool" }],
}) as Hex;

export const ERC20_TRANSFER_SELECTOR = getFunctionSelector({
  type: "function",
  name: "transfer",
  stateMutability: "nonpayable",
  inputs: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
  ],
  outputs: [{ name: "", type: "bool" }],
}) as Hex;

export const WRAPPED_DEPOSIT_SELECTOR = getFunctionSelector({
  type: "function",
  name: "deposit",
  stateMutability: "payable",
  inputs: [],
  outputs: [],
}) as Hex;

export const WRAPPED_WITHDRAW_SELECTOR = getFunctionSelector({
  type: "function",
  name: "withdraw",
  stateMutability: "nonpayable",
  inputs: [{ name: "wad", type: "uint256" }],
  outputs: [],
}) as Hex;

export interface ScopeOptions {
  allowedTokens: AllowedToken[];
  router: Address;
  delegator?: Address;
}

export const buildHybridScope = ({ allowedTokens, router, delegator }: ScopeOptions) => {
  const targetSet = new Set<Address>();
  targetSet.add(getAddress(router));

  for (const token of allowedTokens) {
    targetSet.add(getAddress(token.address));
  }

  if (delegator) {
    targetSet.add(getAddress(delegator));
  }

  const selectors = new Set<Hex>([AGGREGATE_SELECTOR, APPROVE_SELECTOR, ERC20_TRANSFER_SELECTOR]);
  const hasWrapped = allowedTokens.some((token) => token.kind === "wrappedNative");
  if (hasWrapped) {
    selectors.add(WRAPPED_DEPOSIT_SELECTOR);
    selectors.add(WRAPPED_WITHDRAW_SELECTOR);
  }

  return {
    type: "functionCall" as const,
    targets: Array.from(targetSet),
    selectors: Array.from(selectors),
    allowedCalldata: [],
  };
};

export interface CaveatOptions {
  callLimit?: number | null;
  unlimitedCalls?: boolean;
  nonce: bigint;
}

export const buildHybridCaveats = (
  mode: Mode,
  expiresAt: number,
  { callLimit, unlimitedCalls, nonce }: CaveatOptions,
): Caveats => {
  const baseCaveats = [
    {
      type: "timestamp" as const,
      afterThreshold: 0,
      beforeThreshold: expiresAt,
    },
    {
      type: "nonce" as const,
      nonce: toHex(nonce),
    },
  ];

  const limitedCaveats = !unlimitedCalls
    ? [
        {
          type: "limitedCalls" as const,
          limit: callLimit ?? DEFAULT_CALL_LIMITS[mode],
        },
      ]
    : [];

  return [...baseCaveats, ...limitedCaveats] as unknown as Caveats;
};
