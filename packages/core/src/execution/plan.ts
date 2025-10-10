import { type Address, type Hex, encodeAbiParameters, keccak256, toHex } from "viem";

export interface SwapPlanHashInput {
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  amountInWei: bigint;
  minAmountOutWei: bigint;
  slippageBps: number;
  deadlineSeconds?: number;
  quoteId?: string;
  previewId?: string;
}

const hashIdentifier = (value?: string): Hex => keccak256(toHex(value ?? ""));

export const computeSwapPlanHash = ({
  chainId,
  tokenIn,
  tokenOut,
  amountInWei,
  minAmountOutWei,
  slippageBps,
  deadlineSeconds,
  quoteId,
  previewId,
}: SwapPlanHashInput): Hex => {
  const encoded = encodeAbiParameters(
    [
      { type: "uint256" },
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bytes32" },
      { type: "bytes32" },
    ],
    [
      BigInt(chainId),
      tokenIn,
      tokenOut,
      amountInWei,
      minAmountOutWei,
      BigInt(slippageBps),
      BigInt(deadlineSeconds ?? 0),
      hashIdentifier(quoteId),
      hashIdentifier(previewId),
    ],
  );

  return keccak256(encoded);
};

