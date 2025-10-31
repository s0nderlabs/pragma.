/**
 * Transfer Tool
 *
 * Implements simple token transfers with no protocol fee.
 */

import { tool } from "langchain";
import { z } from "zod";
import { Address, getAddress, encodeFunctionData, parseUnits, formatUnits } from "viem";

import { createErrorFromCode } from "../../errors/index.js";

// ============================================================================
// ERC20 Transfer ABI
// ============================================================================

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// ============================================================================
// Transfer Tool Implementation
// ============================================================================

export const transferTool = tool(
  async ({ token, recipient, amount, decimals, userAddress }) => {
    try {
      // Normalize addresses
      const tokenAddress = getAddress(token as Address);
      const recipientAddress = getAddress(recipient as Address);
      const senderAddress = getAddress(userAddress as Address);

      // Parse amount to wei (default 18 decimals)
      const tokenDecimals = decimals || 18;
      const amountWei = parseUnits(amount, tokenDecimals);

      // Encode transfer calldata
      const calldata = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [recipientAddress, amountWei],
      });

      // Format for display
      const amountFormatted = formatUnits(amountWei, tokenDecimals);

      return {
        content: `Transfer prepared:
• Token: ${token}
• Amount: ${amountFormatted}
• Recipient: ${recipient}
• Fee: FREE (only gas)`,
        artifact: {
          calldata,
          to: tokenAddress,
          value: 0n,
          from: senderAddress,
          token: {
            address: tokenAddress,
            amount: amountFormatted,
            symbol: token,
          },
          recipient: recipientAddress,
          type: "transfer" as const,
        },
      };
    } catch (error) {
      throw createErrorFromCode("EXECUTION_ERROR", {
        message: `Failed to prepare transfer: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "transfer",
    description: `Transfer ERC20 tokens to another address. Simple and FREE (no protocol fee, only network gas).

Use this tool when the user wants to:
- Send tokens to someone
- Transfer assets to another wallet
- Move tokens between addresses

Example inputs:
- token: "USDC" or "0x..." (token symbol or address)
- recipient: "0x..." or "vitalik.eth" (recipient address or ENS)
- amount: "100" (decimal string)
- decimals: 18 (optional, token decimals, defaults to 18)
- userAddress: "0x..." (sender's wallet address)`,
    schema: z.object({
      token: z.string().describe("Token to transfer (symbol like 'USDC' or address like '0x...')"),
      recipient: z.string().describe("Recipient address (0x... or ENS name like 'vitalik.eth')"),
      amount: z.string().describe("Amount to transfer (decimal string like '100')"),
      decimals: z.number().optional().describe("Token decimals (default: 18)"),
      userAddress: z.string().describe("Sender's wallet address (0x...)"),
    }),
    responseFormat: "content_and_artifact",
  }
);
