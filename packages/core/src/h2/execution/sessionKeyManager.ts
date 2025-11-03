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
import { fundSessionKeyViaUserOp } from "./sessionKeyFundingUserOp.js";
import { fundSessionKeyViaDelegation } from "./sessionKeyFundingDelegation.js";

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
 * **Two-Phase Approach:**
 * - Initial funding (0 MON): Uses UserOp via bundler (no gas needed from session key)
 * - Refill funding (< 0.1 MON): Uses ephemeral delegation (session key pays gas from remaining balance)
 *
 * @param config - Funding configuration
 * @param publicClient - Viem public client
 * @param web3authBridge - Bridge with signTypedData method (used for delegation signing)
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
 *     sessionKeyPrivateKey: "0x...",  // For delegation signing
 *     ownerAddress: "0x...",          // For delegation signing
 *     chainId: 10207,
 *     rpcUrl: "https://testnet.monad.xyz/",
 *     delegationManager: "0x...",
 *     smartAccount: smartAccount,      // For UserOp (initial funding)
 *     bundlerClient: bundlerClient,    // For UserOp (initial funding)
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
  web3authBridge: any, // Web3AuthBridge or direct PK bridge (used for refills only)
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

    // Route based on session key balance:
    // - 0 MON (initial funding) → Use UserOp (no gas needed from session key)
    // - > 0 but < 0.1 MON (refill) → Use delegation (session key pays gas)

    if (balanceBefore === 0n) {
      // INITIAL FUNDING: Use UserOp approach
      if (!config.smartAccount || !config.bundlerClient) {
        throw new SessionKeyFundingError(
          "Initial session key funding requires smartAccount and bundlerClient. " +
          "These are needed to create and submit UserOp for funding."
        );
      }

      const result = await fundSessionKeyViaUserOp({
        smartAccountAddress: config.smartAccountAddress,
        sessionKeyAddress: config.sessionKeyAddress,
        smartAccount: config.smartAccount,
        bundlerClient: config.bundlerClient,
        publicClient,
      });

      return {
        txHash: result.transactionHash || result.userOpHash,
        newBalance: result.newBalance,
        fundedAmount: result.fundedAmount,
      };
    }

    // REFILL FUNDING: Use delegation approach
    // Session key has > 0 but < 0.1 MON - use delegation pattern
    if (!config.sessionKeyPrivateKey || !config.ownerAddress) {
      throw new SessionKeyFundingError(
        "Refill funding requires sessionKeyPrivateKey and ownerAddress. " +
        "These are needed to create and sign ephemeral delegation."
      );
    }

    const result = await fundSessionKeyViaDelegation({
      smartAccountAddress: config.smartAccountAddress,
      sessionKeyAddress: config.sessionKeyAddress,
      sessionKeyPrivateKey: config.sessionKeyPrivateKey,
      ownerAddress: config.ownerAddress,
      chainId: config.chainId,
      publicClient,
      web3authBridge,
    });

    return {
      txHash: result.transactionHash,
      newBalance: result.newBalance,
      fundedAmount: result.fundedAmount,
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
