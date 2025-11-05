/**
 * Execute Swap Tool (Write Operation)
 *
 * Executes a confirmed swap transaction using ephemeral delegations.
 *
 * **CRITICAL:** Only call this tool AFTER:
 * 1. User has seen the quote (from getSwapQuote)
 * 2. User has explicitly confirmed execution
 *
 * This tool will:
 * - Check and fund session key if needed
 * - Create ephemeral delegation
 * - Sign delegation with Web3Auth
 * - Submit transaction
 * - Wait for confirmation
 * - Return detailed receipt
 */

import { tool } from "langchain";
import { z } from "zod";
import { formatUnits } from "viem";

import { executeSwap } from "../execution/executeSwap.js";
import { getSwapQuote } from "../execution/quoteStore.js";
import { createErrorFromCode } from "../../errors/index.js";

// ============================================================================
// Execute Swap Tool Implementation
// ============================================================================

export const executeSwapTool = tool(
  async ({ quoteId }, config) => {
    try {
      // Get execution context from config
      const userAddress = config?.configurable?.userAddress;
      const sessionData = config?.configurable?.sessionData as any;
      const publicClient = config?.configurable?.publicClient;
      const web3authBridge = config?.configurable?.web3authBridge;
      const smartAccount = config?.configurable?.smartAccount;
      const bundlerClient = config?.configurable?.bundlerClient;
      const sessionWallet = config?.configurable?.sessionWallet; // Shared wallet for nonce management

      // Validate context
      if (!userAddress || !sessionData || !publicClient || !web3authBridge) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Execution context is incomplete. Required: userAddress, sessionData, publicClient, web3authBridge.",
          context: {
            hasUserAddress: !!userAddress,
            hasSessionData: !!sessionData,
            hasPublicClient: !!publicClient,
            hasWeb3authBridge: !!web3authBridge,
          },
        });
      }

      // Validate session data completeness
      const missingFields = [
        !sessionData.sessionKeyAddress && "sessionKeyAddress",
        !sessionData.sessionKeyPrivateKey && "sessionKeyPrivateKey",
        !sessionData.ownerAddress && "ownerAddress",
        !sessionData.chainId && "chainId",
      ].filter(Boolean);

      if (missingFields.length > 0) {
        throw createErrorFromCode("SESSION_INCOMPLETE", {
          message: `Session data is incomplete. Missing required fields: ${missingFields.join(", ")}`,
        });
      }

      // Retrieve quote to show details
      const quote = getSwapQuote(quoteId);

      // Execute swap
      const result = await executeSwap({
        quoteId,
        userAddress,
        sessionKeyAddress: sessionData.sessionKeyAddress,
        sessionKeyPrivateKey: sessionData.sessionKeyPrivateKey,
        ownerAddress: sessionData.ownerAddress,
        publicClient,
        web3authBridge,
        chainId: sessionData.chainId,
        smartAccount,
        bundlerClient,
        sessionWallet, // Pass shared wallet to prevent nonce collisions in parallel execution
      });

      // Format receipt
      const gasUsedFormatted = formatUnits(result.gasUsed, 18);

      return `Swap executed successfully!

📊 Receipt:
• Swapped: ${quote.amount} ${quote.fromTokenSymbol}
• Received: ${result.actualOutputFormatted || quote.expectedOutput} ${quote.toTokenSymbol}
• Gas Used: ${gasUsedFormatted} MON
• Status: ${result.status}
• Block: ${result.blockNumber.toString()}
• Tx Hash: ${result.txHash}

Your ${quote.toTokenSymbol} balance has been updated.`;
    } catch (error) {
      // Handle specific errors
      const err = error as Error;

      if (err.name === "QuoteNotFoundError" || err.name === "QuoteExpiredError") {
        return `❌ ${err.message}\n\nPlease request a new quote by asking for a swap again.`;
      }

      if (err.name === "SessionKeyFundingError") {
        return `❌ Session key funding failed: ${err.message}\n\nPlease try again or contact support.`;
      }

      // If execution not fully implemented yet
      if (err.message.includes("not fully implemented")) {
        return `⚠️  Swap execution is not fully implemented yet.\n\n` +
               `This is a placeholder response. The actual implementation requires:\n` +
               `- Web3Auth bridge integration for delegation signing\n` +
               `- Delegation redemption via bundler\n` +
               `- Transaction confirmation handling\n\n` +
               `Quote details:\n` +
               `• From: ${getSwapQuote(quoteId).amount} ${getSwapQuote(quoteId).fromTokenSymbol}\n` +
               `• To: ~${getSwapQuote(quoteId).expectedOutput} ${getSwapQuote(quoteId).toTokenSymbol}\n` +
               `• Quote ID: ${quoteId}`;
      }

      throw createErrorFromCode("EXECUTION_FAILED", {
        message: `Swap execution failed: ${err.message}`,
        cause: error,
      });
    }
  },
  {
    name: "executeSwap",
    description: `Execute a confirmed swap transaction.

**CRITICAL RULES:**
1. ONLY call this after getSwapQuote has been called
2. ONLY call this after user has explicitly confirmed
3. Pass the quote ID from getSwapQuote

This tool will:
- Validate the quote (not expired, still valid)
- Check session key balance (fund if needed, with user permission)
- Create ephemeral delegation (5 min expiry, single-use)
- Sign delegation with Web3Auth (owner's signature)
- Sign transaction with session key
- Submit to blockchain
- Wait for confirmation (6-8 seconds)
- Return detailed receipt

Example flow:
User: "swap 1 MON to USDC"
AI: [calls getSwapQuote] → Shows quote to user
User: "yes, execute"
AI: [calls executeSwap with quoteId] → Executes transaction

Security:
- Ephemeral delegation created just-in-time
- Single-use (1-2 calls max)
- Short-lived (5 minute expiry)
- Exact calldata matching quote
- User confirmation required (except yolo mode)

Returns: Conversational receipt with transaction details`,
    schema: z.object({
      quoteId: z.string().describe("Quote ID from getSwapQuote tool"),
    }),
  }
);
