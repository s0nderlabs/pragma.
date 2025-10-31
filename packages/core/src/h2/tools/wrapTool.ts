/**
 * Wrap & Unwrap Tools
 *
 * Implements MON <-> WMON conversions with no protocol fee.
 */

import { tool } from "langchain";
import { z } from "zod";
import { Address, getAddress, encodeFunctionData, parseUnits, formatUnits } from "viem";

import { createErrorFromCode } from "../../errors/index.js";

// ============================================================================
// WMON Contract Configuration
// ============================================================================

const WMON_ADDRESS = (process.env.MONAD_WMON_ADDRESS || "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701") as Address;

const WRAPPED_NATIVE_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: [],
  },
] as const;

// ============================================================================
// Wrap Tool (MON → WMON)
// ============================================================================

export const wrapTool = tool(
  async ({ amount, userAddress }) => {
    try {
      const senderAddress = getAddress(userAddress as Address);
      const wmonAddress = getAddress(WMON_ADDRESS);

      // Parse amount to wei (MON has 18 decimals)
      const amountWei = parseUnits(amount, 18);

      // Encode deposit calldata
      const calldata = encodeFunctionData({
        abi: WRAPPED_NATIVE_ABI,
        functionName: "deposit",
        args: [],
      });

      const amountFormatted = formatUnits(amountWei, 18);

      return {
        content: `Wrap prepared:
• From: ${amountFormatted} MON
• To: ${amountFormatted} WMON
• Fee: FREE (only gas)`,
        artifact: {
          calldata,
          to: wmonAddress,
          value: amountWei,
          from: senderAddress,
          amount: amountFormatted,
          type: "wrap" as const,
        },
      };
    } catch (error) {
      throw createErrorFromCode("EXECUTION_ERROR", {
        message: `Failed to prepare wrap: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "wrap",
    description: `Wrap native MON into WMON (Wrapped MON) ERC20 token. FREE operation (only gas).

Use this tool when the user wants to:
- Convert MON to WMON
- Wrap MON for use in DeFi protocols
- Get ERC20 version of MON

Example inputs:
- amount: "0.5" (decimal string, amount of MON to wrap)
- userAddress: "0x..." (user's wallet address)`,
    schema: z.object({
      amount: z.string().describe("Amount of MON to wrap (decimal string like '0.5')"),
      userAddress: z.string().describe("User's wallet address (0x...)"),
    }),
    responseFormat: "content_and_artifact",
  }
);

// ============================================================================
// Unwrap Tool (WMON → MON)
// ============================================================================

export const unwrapTool = tool(
  async ({ amount, userAddress }) => {
    try {
      const senderAddress = getAddress(userAddress as Address);
      const wmonAddress = getAddress(WMON_ADDRESS);

      // Parse amount to wei (WMON has 18 decimals)
      const amountWei = parseUnits(amount, 18);

      // Encode withdraw calldata
      const calldata = encodeFunctionData({
        abi: WRAPPED_NATIVE_ABI,
        functionName: "withdraw",
        args: [amountWei],
      });

      const amountFormatted = formatUnits(amountWei, 18);

      return {
        content: `Unwrap prepared:
• From: ${amountFormatted} WMON
• To: ${amountFormatted} MON
• Fee: FREE (only gas)`,
        artifact: {
          calldata,
          to: wmonAddress,
          value: 0n,
          from: senderAddress,
          amount: amountFormatted,
          type: "unwrap" as const,
        },
      };
    } catch (error) {
      throw createErrorFromCode("EXECUTION_ERROR", {
        message: `Failed to prepare unwrap: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "unwrap",
    description: `Unwrap WMON back to native MON. FREE operation (only gas).

Use this tool when the user wants to:
- Convert WMON back to MON
- Unwrap WMON tokens
- Get native MON from wrapped version

Example inputs:
- amount: "1.0" (decimal string, amount of WMON to unwrap)
- userAddress: "0x..." (user's wallet address)`,
    schema: z.object({
      amount: z.string().describe("Amount of WMON to unwrap (decimal string like '1.0')"),
      userAddress: z.string().describe("User's wallet address (0x...)"),
    }),
    responseFormat: "content_and_artifact",
  }
);
