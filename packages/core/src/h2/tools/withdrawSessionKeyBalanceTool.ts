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
  type Hex,
  type PublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { createErrorFromCode } from "../../errors/index.js";

// ============================================================================
// Constants
// ============================================================================

const MONAD_RPC_URL = process.env.MONAD_EXECUTION_RPC_URL || "https://testnet.monad.xyz/";

/** Minimum gas reserve to leave in session key (0.001 MON for withdrawal tx gas) */
const MIN_GAS_RESERVE = parseEther("0.001");

// ============================================================================
// Withdraw Session Key Balance Tool Implementation
// ============================================================================

export const withdrawSessionKeyBalanceTool = tool(
  async ({ amount, recipient }, config) => {
    try {
      const userAddress = config?.configurable?.userAddress as Address;
      const publicClient = config?.configurable?.publicClient as PublicClient;
      const sessionData = config?.configurable?.sessionData as any;

      if (!userAddress || !publicClient || !sessionData) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Missing required context",
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
        const gasPrice = await publicClient.getGasPrice();
        const estimatedGas = 21000n; // Standard ETH transfer gas
        const gasCost = gasPrice * estimatedGas;

        // Add safety margin (20%)
        const gasCostWithMargin = (gasCost * 120n) / 100n;

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
        const gasPrice = await publicClient.getGasPrice();
        const estimatedGas = 21000n;
        const gasCost = (gasPrice * estimatedGas * 120n) / 100n; // 20% margin

        if (sessionKeyBalance - withdrawalAmount < gasCost) {
          return `**Session Key Withdrawal**

Status: ⚠️ Insufficient balance for gas
Session Key Balance: ${formatEther(sessionKeyBalance)} MON
Withdrawal Amount: ${formatEther(withdrawalAmount)} MON
Estimated Gas: ${formatEther(gasCost)} MON

Not enough MON left to pay for gas. Try withdrawing less or use "all" to withdraw maximum possible.`;
        }
      }

      // Create session wallet for withdrawal
      const sessionWallet = createWalletClient({
        account: privateKeyToAccount(sessionData.sessionKeyPrivateKey),
        chain: {
          id: sessionData.chainId,
          name: "Monad",
          nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
          rpcUrls: { default: { http: [MONAD_RPC_URL] }, public: { http: [MONAD_RPC_URL] } },
        },
        transport: http(MONAD_RPC_URL),
      });

      // Execute withdrawal (direct EOA transfer, no delegation needed)
      const txHash = await sessionWallet.sendTransaction({
        to: recipientAddress,
        value: withdrawalAmount,
      });

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      // Get new balance
      const newBalance = await publicClient.getBalance({
        address: sessionData.sessionKeyAddress,
      });

      return `✅ Session Key Withdrawal Complete!

• Withdrawn: ${formatEther(withdrawalAmount)} MON
• To: ${recipientAddress}${recipient ? "" : " (your smart account)"}
• Session Key Balance: ${formatEther(newBalance)} MON remaining
• Transaction: ${txHash}
• Block: ${receipt.blockNumber}
• Gas Used: ${receipt.gasUsed}

${recipient ? `MON sent to ${recipientAddress}` : "MON returned to your smart account. You have full control."}`;
    } catch (error) {
      throw createErrorFromCode("TRANSACTION_EXECUTION_FAILED", {
        message: `Failed to withdraw session key balance: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "withdrawSessionKeyBalance",
    description: `Withdraw MON from session key to smart account or any address. Gives you full control over session key funds.

**WHEN TO USE:**
- User wants to recover session key funds
- User wants to consolidate funds in smart account
- User wants to send session key MON to external address
- User is logging out and wants to withdraw remaining balance

**How It Works:**
This is a direct EOA transfer (session key is a regular Ethereum account that owns its MON).
No delegation or smart account interaction needed - session key can send its own MON freely.

**Amount Options:**
- "all": Withdraws maximum possible (reserves gas for the withdrawal tx itself)
- Specific amount: "0.5" (withdraws exactly 0.5 MON, must leave enough for gas)

**Recipient:**
- Default: Your smart account (userAddress)
- Custom: Any valid Ethereum address

**Security:**
- Session key only holds ~1 MON for gas (low risk)
- Direct transfer - no approval or delegation needed
- Cannot access smart account tokens (only session key's own MON)

**Examples:**
- "withdraw all session key balance" → Sends max MON to smart account
- "withdraw 0.5 MON from session key" → Sends 0.5 MON to smart account
- "send session key balance to 0xABC..." → Sends max MON to custom address

Returns transaction receipt with new session key balance.`,
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
