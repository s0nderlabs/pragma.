/**
 * Get Transfer Quote Tool (Read-Only)
 *
 * Prepares a token transfer without executing.
 * Use this tool for transfer preparation and validation.
 *
 * This tool DOES NOT execute transfers - it only validates and stores quote data.
 * Call executeTransfer tool after user confirms.
 */

import { tool } from "langchain";
import { z } from "zod";
import { Address, getAddress, formatUnits, parseUnits, getContract, erc20Abi, type PublicClient } from "viem";

import { resolveTokenFromAllowlist, type AllowedToken } from "../../monorail/tokens.js";
import { createErrorFromCode } from "../../errors/index.js";
import { generateQuoteId, storeTransferQuote } from "../execution/quoteStore.js";
import type { TransferQuoteData } from "../execution/types.js";

// ============================================================================
// Constants
// ============================================================================

const QUOTE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_GAS_ESTIMATE = 21000n; // Standard ERC20 transfer gas

// ============================================================================
// Get Transfer Quote Tool Implementation
// ============================================================================

export const getTransferQuoteTool = tool(
  async ({ token, recipient, amount, decimals }, config) => {
    try {
      // Get context
      const allowedTokens = (config?.configurable?.allowedTokens as AllowedToken[]) || [];
      const userAddress = config?.configurable?.userAddress as string;
      const publicClient = config?.configurable?.publicClient as PublicClient;

      if (!userAddress) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "User address is required but not provided in context.",
          context: { field: "userAddress" },
        });
      }

      if (!publicClient) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Public client is required but not provided in context.",
          context: { field: "publicClient" },
        });
      }

      // Resolve token (if symbol provided)
      const resolvedToken = resolveTokenFromAllowlist(token, allowedTokens);
      const tokenAddress = resolvedToken?.address || getAddress(token);
      const tokenSymbol = resolvedToken?.symbol || token;
      const tokenDecimals = decimals || resolvedToken?.decimals || 18;

      // Normalize recipient address
      const recipientAddress = getAddress(recipient);

      // Parse amount
      const amountWei = parseUnits(amount, tokenDecimals);
      const amountFormatted = formatUnits(amountWei, tokenDecimals);

      // Check user's balance
      const tokenContract = getContract({
        address: tokenAddress,
        abi: erc20Abi,
        client: publicClient,
      });

      const balance = await tokenContract.read.balanceOf([getAddress(userAddress)]);

      if (balance < amountWei) {
        throw createErrorFromCode("INSUFFICIENT_BALANCE", {
          message: `Insufficient ${tokenSymbol} balance. ` +
                  `Required: ${amountFormatted}, Available: ${formatUnits(balance, tokenDecimals)}`,
          context: {
            token: tokenSymbol,
            required: amountFormatted,
            available: formatUnits(balance, tokenDecimals),
          },
        });
      }

      // Estimate gas (simple transfer ~21,000 gas, ~0.00002 MON at 1 gwei)
      const gasEstimateWei = DEFAULT_GAS_ESTIMATE * 1_000_000_000n; // 1 gwei
      const gasEstimateFormatted = formatUnits(gasEstimateWei, 18);

      // Generate and store quote
      const quoteId = generateQuoteId();
      const now = Date.now();

      const quoteData: TransferQuoteData = {
        quoteId,
        token: tokenAddress,
        tokenSymbol,
        tokenDecimals,
        recipient: recipientAddress,
        amount: amountFormatted,
        amountWei,
        gasEstimate: gasEstimateWei,
        createdAt: now,
        expiresAt: now + QUOTE_EXPIRY_MS,
        userAddress: getAddress(userAddress),
      };

      storeTransferQuote(quoteData);

      // Return conversational quote
      return `Transfer prepared:

• Token: ${tokenSymbol}
• Amount: ${amountFormatted}
• Recipient: ${recipient}
• Fee: FREE (only gas: ~${gasEstimateFormatted} MON)
• Your Balance: ${formatUnits(balance, tokenDecimals)} ${tokenSymbol}

Quote ID: ${quoteId}
Valid for: 5 minutes

Ready to send?`;
    } catch (error) {
      throw createErrorFromCode("QUOTE_PREPARATION_ERROR", {
        message: `Failed to prepare transfer: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "getTransferQuote",
    description: `Prepare a token transfer. Use this tool FIRST before executing transfers.

**IMPORTANT:** This tool does NOT execute transfers - it only validates and prepares the transfer.
After the user confirms, call executeTransfer with the quote ID.

Use this tool when the user:
- Wants to send tokens: "send 100 USDC to 0x..."
- Asks about transfer: "how much to send to..."
- Checks if they can transfer: "can I send 50 MON to..."

Features:
- FREE operation (no protocol fee, only gas)
- Balance validation
- Supports token symbols (USDC, MON) and addresses (0x...)
- Gas estimates

Returns: Conversational quote with Quote ID for execution

Example inputs:
- token: "USDC" or "0x..." (symbol preferred)
- recipient: "0x..." (Ethereum address)
- amount: "100" (decimal string)
- decimals: 6 (optional, defaults to 18 or token's decimals from allowlist)`,
    schema: z.object({
      token: z.string().describe("Token to transfer (symbol like 'USDC' or address like '0x...')"),
      recipient: z.string().describe("Recipient address (0x...)"),
      amount: z.string().describe("Amount to transfer (decimal string like '100.5')"),
      decimals: z.number().optional().describe("Token decimals (optional, defaults to 18)"),
    }),
  }
);
