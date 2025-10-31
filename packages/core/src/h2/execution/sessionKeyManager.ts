/**
 * H2 Session Key Manager
 *
 * Manages session key balance checking and funding.
 *
 * Session keys are ephemeral keys that hold small amounts of MON (0.5 MON)
 * to pay for gas when executing transactions with ephemeral delegations.
 *
 * Key Features:
 * - Auto-detect low balance (< 0.1 MON)
 * - Fund from smart account (transfer 0.5 MON)
 * - User permission required before funding
 */

import { type Address, type Hex, type PublicClient, parseEther, formatEther } from "viem";
import type {
  SessionKeyBalance,
  SessionKeyFundingConfig,
  SessionKeyFundingResult,
} from "./types.js";
import { SessionKeyFundingError } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Minimum balance threshold (if below this, funding is needed) */
export const MIN_SESSION_KEY_BALANCE = parseEther("0.1"); // 0.1 MON

/** Standard funding amount */
export const SESSION_KEY_FUNDING_AMOUNT = parseEther("0.5"); // 0.5 MON

// ============================================================================
// Balance Checking
// ============================================================================

/**
 * Check session key balance and determine if funding is needed
 *
 * @param sessionKeyAddress - Session key public address
 * @param publicClient - Viem public client
 * @returns Balance information and funding recommendation
 *
 * @example
 * ```typescript
 * const { needsFunding, balance } = await checkSessionKeyBalance(
 *   sessionKeyAddress,
 *   publicClient
 * );
 *
 * if (needsFunding) {
 *   console.log(`Session key needs funding. Current: ${formatEther(balance)} MON`);
 * }
 * ```
 */
export async function checkSessionKeyBalance(
  sessionKeyAddress: Address,
  publicClient: PublicClient,
): Promise<SessionKeyBalance> {
  const balance = await publicClient.getBalance({ address: sessionKeyAddress });

  return {
    balance,
    needsFunding: balance < MIN_SESSION_KEY_BALANCE,
    recommendedFundingAmount: SESSION_KEY_FUNDING_AMOUNT,
  };
}

// ============================================================================
// Session Key Funding
// ============================================================================

/**
 * Fund session key from smart account
 *
 * This function transfers MON from the user's smart account (HybridDelegator)
 * to the session key address to cover gas costs for future transactions.
 *
 * **H2 Approach:** Uses a simple native token transfer through the smart account.
 * The owner signs the transaction via Web3Auth/Bridge, and the smart account
 * executes it without requiring a delegation.
 *
 * @param config - Funding configuration
 * @param publicClient - Viem public client
 * @param web3authBridge - Bridge with sendTransaction method
 * @returns Funding result with transaction hash and new balance
 *
 * @throws {SessionKeyFundingError} If funding fails
 *
 * @example
 * ```typescript
 * const result = await fundSessionKey(
 *   {
 *     smartAccountAddress: "0x...",
 *     sessionKeyAddress: "0x...",
 *     chainId: 10207,
 *     rpcUrl: "https://testnet.monad.xyz/",
 *     delegationManager: "0x...",
 *   },
 *   publicClient,
 *   web3authBridge
 * );
 *
 * console.log(`Funded ${formatEther(result.fundedAmount)} MON`);
 * console.log(`New balance: ${formatEther(result.newBalance)} MON`);
 * ```
 */
export async function fundSessionKey(
  config: SessionKeyFundingConfig,
  publicClient: PublicClient,
  web3authBridge: any, // Web3AuthBridge or direct PK bridge
): Promise<SessionKeyFundingResult> {
  try {
    // Get current balance before funding
    const balanceBefore = await publicClient.getBalance({
      address: config.sessionKeyAddress
    });

    // Check if funding is actually needed
    if (balanceBefore >= MIN_SESSION_KEY_BALANCE) {
      return {
        txHash: "0x" as Hex, // No tx needed
        newBalance: balanceBefore,
        fundedAmount: 0n,
      };
    }

    // Check smart account balance
    const smartAccountBalance = await publicClient.getBalance({
      address: config.smartAccountAddress
    });

    if (smartAccountBalance < SESSION_KEY_FUNDING_AMOUNT) {
      throw new SessionKeyFundingError(
        `Insufficient smart account balance. ` +
        `Need ${formatEther(SESSION_KEY_FUNDING_AMOUNT)} MON, ` +
        `have ${formatEther(smartAccountBalance)} MON`
      );
    }

    // Send funding transaction
    // The bridge should handle signing and sending through the smart account
    let txHash: Hex;

    if (web3authBridge.sendTransaction) {
      // Web3Auth/Privy bridge with sendTransaction method
      const result = await web3authBridge.sendTransaction({
        from: config.smartAccountAddress,
        to: config.sessionKeyAddress,
        value: `0x${SESSION_KEY_FUNDING_AMOUNT.toString(16)}`,
        data: "0x",
      });
      txHash = result.hash || result.transactionHash || result;
    } else {
      // Direct PK bridge (test mode) - needs wallet client
      throw new SessionKeyFundingError(
        "Session key funding requires a bridge with sendTransaction capability"
      );
    }

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== "success") {
      throw new SessionKeyFundingError("Funding transaction reverted");
    }

    // Get new balance
    const balanceAfter = await publicClient.getBalance({
      address: config.sessionKeyAddress
    });

    return {
      txHash,
      newBalance: balanceAfter,
      fundedAmount: balanceAfter - balanceBefore,
    };
  } catch (error) {
    if (error instanceof SessionKeyFundingError) {
      throw error;
    }
    throw new SessionKeyFundingError(
      `Failed to fund session key: ${(error as Error).message}`
    );
  }
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format session key balance for display
 */
export function formatSessionKeyBalance(balance: bigint): string {
  return `${formatEther(balance)} MON`;
}

/**
 * Get conversational message about session key funding
 */
export function getSessionKeyFundingMessage(balance: bigint): string {
  return `Your session key balance is low (${formatSessionKeyBalance(balance)}). ` +
    `I'll transfer ${formatEther(SESSION_KEY_FUNDING_AMOUNT)} MON from your smart account to cover gas costs. ` +
    `Is that okay?`;
}
