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
  async ({ quoteId, fromToken, toToken, amountIn, amountOut }, config) => {
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

      // Create signature for parallel tool identification
      // Use input tokens if provided (for signature matching), fallback to quote
      // This ensures signature matches browserAgentRunner which uses raw LLM input
      const fromSymbol = (fromToken || quote.fromTokenSymbol).toUpperCase();
      const toSymbol = (toToken || quote.toTokenSymbol).toUpperCase();
      const signature = `executeSwap:${fromSymbol}-${toSymbol}`;

      // Build resolved description for parent tool display (uses actual symbols from quote)
      const resolvedDescription = `Execute ${quote.fromTokenSymbol} → ${quote.toTokenSymbol}`;

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
        signature, // Pass signature for parallel tool progress routing
        description: resolvedDescription, // Pass resolved description for parent display update
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

**CRITICAL RULES FOR QUOTE REUSE:**
1. ONLY call after getSwapQuote has been called AND user confirmed
2. REUSE the exact quote ID you JUST showed in your previous message
3. NEVER call getSwapQuote again before calling this tool
4. Look at YOUR PREVIOUS MESSAGES to find the quote ID you showed to user
5. Quotes are valid for 10 minutes - reusing prevents expiry errors

**Example Flow (CORRECT):**
User: "swap 1 MON to USDC"
AI: [calls getSwapQuote] → Shows "Quote abc123: 1 MON → 3.5 USDC. Execute?"
User: "yes"
AI: [calls executeSwap({ quoteId: "abc123", fromToken: "MON", toToken: "USDC", amountIn: "1", amountOut: "3.5" })]

**IMPORTANT:** Always pass fromToken, toToken, amountIn, and amountOut from the quote output for better progress tracking.

**What NOT to Do:**
❌ After user says "yes", DO NOT call getSwapQuote again (wastes time, causes expiry)
❌ DO NOT check balance again before executing (already checked before quote fetch)
✅ Just call executeSwap with the quote ID you already have

This tool will:
- Validate the quote (not expired, still valid)
- Check session key balance (fund if needed, automatic)
- Create ephemeral delegation (5 min expiry, single-use)
- Sign delegation with Web3Auth (owner's signature)
- Sign transaction with session key
- Submit to blockchain
- Wait for confirmation (6-8 seconds)
- Return detailed receipt

Security:
- Ephemeral delegation created just-in-time
- Single-use (1-2 calls max)
- Short-lived (5 minute expiry)
- Exact calldata matching quote
- User confirmation required (except quick mode)

Returns: Conversational receipt with transaction details`,
    schema: z.object({
      quoteId: z.string().describe("Quote ID from getSwapQuote tool"),
      fromToken: z.string().optional().describe("Source token symbol (e.g., 'MON') - pass this from the quote output for progress tracking"),
      toToken: z.string().optional().describe("Destination token symbol (e.g., 'USDC') - pass this from the quote output for progress tracking"),
      amountIn: z.string().optional().describe("Input amount (e.g., '1.5') - pass this from the quote output"),
      amountOut: z.string().optional().describe("Expected output amount (e.g., '3.5') - pass this from the quote output"),
    }),
  }
);
