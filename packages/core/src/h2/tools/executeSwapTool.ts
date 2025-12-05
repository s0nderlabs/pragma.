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
      // Use quoteId-only format for guaranteed matching with browserAgentRunner
      // QuoteId is cryptographically unique, preventing signature collisions
      const signature = `executeSwap:${quoteId}`;

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

      // Format receipt - calculate actual gas cost (gasUsed × effectiveGasPrice)
      // gasUsed is in gas units, effectiveGasPrice is in wei per gas unit
      const gasPrice = result.effectiveGasPrice || 50_000_000_000n; // 50 gwei fallback for Monad
      const gasCostWei = result.gasUsed * gasPrice;
      const gasUsedFormatted = formatUnits(gasCostWei, 18);

      // Format message for LLM (clean, human-readable)
      const message = `Swap executed successfully!

📊 Receipt:
• Swapped: ${quote.amount} ${quote.fromTokenSymbol}
• Received: ${result.actualOutputFormatted || quote.expectedOutput} ${quote.toTokenSymbol}
• Gas Used: ${gasUsedFormatted} MON
• Status: ${result.status}
• Block: ${result.blockNumber.toString()}
• Tx Hash: ${result.txHash}

Your ${quote.toTokenSymbol} balance has been updated.`;

      // Prepare metadata for activity extraction (convert BigInt to string)
      const metadata = {
        txHash: result.txHash,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
        status: result.status,
        fromToken: result.fromToken || quote.fromTokenSymbol,
        toToken: result.toToken || quote.toTokenSymbol,
        fromAmount: result.fromAmount || quote.amount,
        toAmount: result.actualOutputFormatted,
        delegationMetadata: result.delegationMetadata ? {
          delegator: result.delegationMetadata.delegator,
          sessionKey: result.delegationMetadata.sessionKey,
          nonce: result.delegationMetadata.nonce.toString(), // Convert BigInt to string
          delegationCount: result.delegationMetadata.delegationCount,
          delegationTypes: result.delegationMetadata.delegationTypes,
          expiresAt: result.delegationMetadata.expiresAt,
          feeEnforced: result.delegationMetadata.feeEnforced,
        } : undefined,
      };

      // Return message with embedded metadata (hidden from LLM via HTML comment)
      return `${message}\n\n<!--PRAGMA_METADATA:${JSON.stringify(metadata)}-->`;
    } catch (error) {
      // Handle specific errors
      // CRITICAL: Throw errors instead of returning strings so LangChain marks tool as "error" not "completed"
      // This prevents phantom "success" activities from being created for pre-execution failures
      const err = error as Error;

      if (err.name === "QuoteNotFoundError" || err.name === "QuoteExpiredError") {
        throw createErrorFromCode("QUOTE_ERROR", {
          message: `${err.message}\n\nPlease request a new quote by asking for a swap again.`,
          cause: error,
        });
      }

      if (err.name === "SessionKeyFundingError") {
        throw createErrorFromCode("FUNDING_ERROR", {
          message: `Session key funding failed: ${err.message}\n\nPlease try again or contact support.`,
          cause: error,
        });
      }

      // If execution not fully implemented yet
      if (err.message.includes("not fully implemented")) {
        throw createErrorFromCode("NOT_IMPLEMENTED", {
          message: `Swap execution is not fully implemented yet.\n\n` +
                 `This is a placeholder response. The actual implementation requires:\n` +
                 `- Web3Auth bridge integration for delegation signing\n` +
                 `- Delegation redemption via bundler\n` +
                 `- Transaction confirmation handling\n\n` +
                 `Quote details:\n` +
                 `• From: ${getSwapQuote(quoteId).amount} ${getSwapQuote(quoteId).fromTokenSymbol}\n` +
                 `• To: ~${getSwapQuote(quoteId).expectedOutput} ${getSwapQuote(quoteId).toTokenSymbol}\n` +
                 `• Quote ID: ${quoteId}`,
          cause: error,
        });
      }

      throw createErrorFromCode("EXECUTION_FAILED", {
        message: `Swap execution failed: ${err.message}`,
        cause: error,
      });
    }
  },
  {
    name: "executeSwap",
    description: "Execute swap with quote ID from getSwapQuote. Reuse exact quote ID from previous message. Call search_tool_docs('executeSwap') for detailed usage.",
    schema: z.object({
      quoteId: z.string().describe("Quote ID from getSwapQuote tool"),
      fromToken: z.string().optional().describe("Source token symbol (e.g., 'MON') - pass this from the quote output for progress tracking"),
      toToken: z.string().optional().describe("Destination token symbol (e.g., 'USDC') - pass this from the quote output for progress tracking"),
      amountIn: z.string().optional().describe("Input amount (e.g., '1.5') - pass this from the quote output"),
      amountOut: z.string().optional().describe("Expected output amount (e.g., '3.5') - pass this from the quote output"),
    }),
  }
);
