/**
 * Withdraw Session Key Balance Tool
 *
 * Transfers MON from session key to smart account or any other address.
 * Gives users full control over session key funds.
 *
 * Security:
 * - Direct EOA transfer (no delegation needed - session key owns the MON)
 * - No smart account interaction (session key is separate EOA)
 * - User can recover all session key MON if needed
 *
 * Use Cases:
 * - User wants to recover session key funds
 * - User wants to withdraw before logging out
 * - User wants to consolidate funds in smart account
 * - User wants to send session key MON to external address
 */

import { tool } from "langchain";
import { z } from "zod";
import {
  type Address,
  type PublicClient,
  type Transport,
  createWalletClient,
  formatEther,
  parseEther,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { createErrorFromCode } from "../../errors/index.js";
import { MONAD_CHAIN } from "../config.js";
import { emitProgress } from "../progress/emitter.js";

/** Minimum gas reserve to leave in session key (0.005 MON for withdrawal tx gas) */
const MIN_GAS_RESERVE = parseEther("0.005");

// ============================================================================
// Withdraw Session Key Balance Tool Implementation
// ============================================================================

export const withdrawSessionKeyBalanceTool = tool(
  async ({ amount, recipient }, config) => {
    try {
      const userAddress = config?.configurable?.userAddress as Address;
      const publicClient = config?.configurable?.publicClient as PublicClient;
      const sessionData = config?.configurable?.sessionData as any;
      const transport = config?.configurable?.transport as Transport;

      if (!userAddress || !publicClient || !sessionData) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Missing required context",
        });
      }

      // Transport is required - no fallback to direct RPC
      if (!transport) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Transport is required for RPC calls - cannot use direct RPC",
        });
      }

      // Validate session data completeness
      const missingFields = [
        !sessionData.sessionKeyAddress && "sessionKeyAddress",
        !sessionData.sessionKeyPrivateKey && "sessionKeyPrivateKey",
        !sessionData.chainId && "chainId",
      ].filter(Boolean);

      if (missingFields.length > 0) {
        throw createErrorFromCode("SESSION_INCOMPLETE", {
          message: `Session data is incomplete. Missing required fields: ${missingFields.join(", ")}`,
        });
      }

      // Get current session key balance
      const sessionKeyBalance = await publicClient.getBalance({
        address: sessionData.sessionKeyAddress,
      });

      if (sessionKeyBalance === 0n) {
        return `**Session Key Withdrawal**

Status: ⚠️ No balance to withdraw
Session Key Balance: 0 MON

Session key is already empty. Nothing to withdraw.`;
      }

      // Determine recipient address (default to smart account)
      const recipientAddress = recipient ? getAddress(recipient) : getAddress(userAddress);

      // Calculate withdrawal amount
      let withdrawalAmount: bigint;

      if (amount === "all") {
        // Reserve minimum for gas, withdraw the rest
        if (sessionKeyBalance <= MIN_GAS_RESERVE) {
          return `**Session Key Withdrawal**

Status: ⚠️ Insufficient balance
Session Key Balance: ${formatEther(sessionKeyBalance)} MON
Minimum Reserve: ${formatEther(MIN_GAS_RESERVE)} MON (needed for gas)

Balance too low to withdraw. The entire balance is needed for gas.`;
        }

        // Estimate gas for the withdrawal transaction
        // Note: Session key withdrawal uses ~40k gas (not standard 21k) due to Monad's account model
        const gasPrice = await publicClient.getGasPrice();
        const estimatedGas = 50000n; // Conservative estimate (actual ~39802)
        const gasCost = gasPrice * estimatedGas;

        // Add 100% safety margin for gas price volatility on Monad
        const gasCostWithMargin = gasCost * 2n;

        if (sessionKeyBalance <= gasCostWithMargin) {
          return `**Session Key Withdrawal**

Status: ⚠️ Insufficient balance
Session Key Balance: ${formatEther(sessionKeyBalance)} MON
Estimated Gas Cost: ${formatEther(gasCostWithMargin)} MON

Balance too low to withdraw. Entire balance needed for gas.`;
        }

        withdrawalAmount = sessionKeyBalance - gasCostWithMargin;
      } else {
        // Parse specific amount
        withdrawalAmount = parseEther(amount);

        if (withdrawalAmount <= 0n) {
          throw createErrorFromCode("INVALID_AMOUNT", {
            message: "Withdrawal amount must be greater than 0",
          });
        }

        if (withdrawalAmount > sessionKeyBalance) {
          throw createErrorFromCode("INSUFFICIENT_BALANCE", {
            message: `Insufficient session key balance. Required: ${formatEther(withdrawalAmount)} MON, Available: ${formatEther(sessionKeyBalance)} MON`,
          });
        }

        // Check if enough left for gas
        // Note: Session key withdrawal uses ~40k gas (not standard 21k) due to Monad's account model
        const gasPrice = await publicClient.getGasPrice();
        const estimatedGas = 50000n; // Conservative estimate (actual ~39802)
        const gasCost = gasPrice * estimatedGas * 2n; // 100% margin for gas volatility

        if (sessionKeyBalance - withdrawalAmount < gasCost) {
          return `**Session Key Withdrawal**

Status: ⚠️ Insufficient balance for gas
Session Key Balance: ${formatEther(sessionKeyBalance)} MON
Withdrawal Amount: ${formatEther(withdrawalAmount)} MON
Estimated Gas: ${formatEther(gasCost)} MON

Not enough MON left to pay for gas. Try withdrawing less or use "all" to withdraw maximum possible.`;
        }
      }

      // Create session wallet for withdrawal using transport from config
      const sessionWallet = createWalletClient({
        account: privateKeyToAccount(sessionData.sessionKeyPrivateKey),
        chain: MONAD_CHAIN,
        transport,
      });

      // Generate tool signature for progress routing
      const toolSignature = `withdrawSessionKey:${Date.now()}`;

      // Progress message
      const shortRecipient = `${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`;
      emitProgress(`Withdrawing ${formatEther(withdrawalAmount)} MON to ${shortRecipient}...`, "withdrawSessionKeyBalance", toolSignature, `Withdraw ${formatEther(withdrawalAmount)} MON`);

      // Execute withdrawal (direct EOA transfer, no delegation needed)
      const txHash = await sessionWallet.sendTransaction({
        to: recipientAddress,
        value: withdrawalAmount,
      });

      emitProgress(`Waiting for Confirmation...`, "withdrawSessionKeyBalance", toolSignature);

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      // Get new balance
      const newBalance = await publicClient.getBalance({
        address: sessionData.sessionKeyAddress,
      });

      // Build metadata for activity tracking
      const metadata = {
        txHash,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status === 'success' ? 'success' : 'failed',
        fromToken: 'MON',
        toToken: 'MON',
        fromAmount: formatEther(withdrawalAmount),
        toAmount: formatEther(withdrawalAmount),
        recipientAddress,
        description: `Withdraw ${formatEther(withdrawalAmount)} MON from session key`,
      };

      const humanReadableMessage = `✅ Session Key Withdrawal Complete!

• Withdrawn: ${formatEther(withdrawalAmount)} MON
• To: ${recipientAddress}${recipient ? "" : " (your smart account)"}
• Session Key Balance: ${formatEther(newBalance)} MON remaining
• Transaction: ${txHash}
• Block: ${receipt.blockNumber}
• Gas Used: ${receipt.gasUsed}

${recipient ? `MON sent to ${recipientAddress}` : "MON returned to your smart account. You have full control."}`;

      // Include metadata for activity extractor
      return `${humanReadableMessage}\n\n<!--PRAGMA_METADATA:${JSON.stringify(metadata)}-->`;
    } catch (error) {
      throw createErrorFromCode("TRANSACTION_EXECUTION_FAILED", {
        message: `Failed to withdraw session key balance: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "withdrawSessionKeyBalance",
    description: "Withdraw MON from session key. Direct EOA transfer. Use 'all' for max amount. Call search_tool_docs('withdrawSessionKeyBalance') for detailed usage.",
    schema: z.object({
      amount: z
        .string()
        .describe('Amount to withdraw ("all" for maximum or decimal string like "0.5")'),
      recipient: z
        .string()
        .optional()
        .describe(
          "Optional recipient address (defaults to smart account if not specified)"
        ),
    }),
  }
);
