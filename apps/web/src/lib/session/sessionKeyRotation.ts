"use client";

/**
 * Session Key Rotation Logic
 *
 * Handles rotating session keys with fund transfer.
 * Key insight: Session key is a FULL EOA that can sign its own transfers.
 *
 * Flow:
 * 1. Check old session key balance
 * 2. Transfer funds to destination (new key or smart account)
 * 3. Generate new session key and update storage
 * 4. Return new key for state propagation
 *
 * CRITICAL: Transfer BEFORE rotate to prevent orphaned funds.
 */

import {
  type Address,
  type Hex,
  type PublicClient,
  type Transport,
  createWalletClient,
  formatEther,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { generateSessionKey } from "@pragma/core/session/keys";
import { createSyncTransport, waitForReceiptSync } from "@pragma/core/h2/execution";
import { rotateSessionKey as rotateSessionKeyStorage, type SessionKeyRecord } from "../storage/session-keys";
import { monadDevnet } from "../chains";

// ============================================================================
// Constants
// ============================================================================

/** Minimum balance required to attempt transfer (covers gas) */
const MIN_TRANSFER_THRESHOLD = parseEther("0.01");

// ============================================================================
// Types
// ============================================================================

export type FundDestination = "smart_account" | "new_session_key";

export interface RotationConfig {
  delegator: Address;
  oldSessionKeyAddress: Address;
  oldSessionKeyPrivateKey: Hex;
  destination: FundDestination;
  publicClient: PublicClient;
  transport: Transport;
  smartAccountAddress: Address;
}

export interface BalanceCheckResult {
  balance: bigint;
  balanceFormatted: string;
  canTransfer: boolean;
  skipReason?: string;
}

export interface TransferResult {
  success: boolean;
  txHash?: Hex;
  transferredAmount?: bigint;
  error?: string;
}

export interface RotationResult {
  success: boolean;
  newSessionKey: SessionKeyRecord;
  transferResult?: TransferResult;
  error?: string;
}

// ============================================================================
// Balance Check
// ============================================================================

/**
 * Check session key balance and determine if transfer is possible.
 */
export async function checkSessionKeyBalanceForRotation(
  sessionKeyAddress: Address,
  publicClient: PublicClient
): Promise<BalanceCheckResult> {
  const balance = await publicClient.getBalance({
    address: sessionKeyAddress,
  });

  const balanceFormatted = formatEther(balance);

  // Case 1: No balance - skip transfer
  if (balance === 0n) {
    return {
      balance,
      balanceFormatted,
      canTransfer: false,
      skipReason: "Session key has no balance to transfer.",
    };
  }

  // Case 2: Below minimum threshold - can't cover gas
  if (balance < MIN_TRANSFER_THRESHOLD) {
    return {
      balance,
      balanceFormatted,
      canTransfer: false,
      skipReason: `Balance (${balanceFormatted} MON) is below ${formatEther(MIN_TRANSFER_THRESHOLD)} MON minimum needed for gas.`,
    };
  }

  // Case 3: Sufficient balance - can transfer
  return {
    balance,
    balanceFormatted,
    canTransfer: true,
  };
}

// ============================================================================
// Fund Transfer
// ============================================================================

/**
 * Transfer funds from old session key to destination.
 * Session key signs its own transfer (no delegation needed).
 */
export async function transferFundsFromSessionKey(
  config: RotationConfig,
  balance: bigint
): Promise<TransferResult> {
  try {
    const { oldSessionKeyPrivateKey, publicClient, transport, destination, smartAccountAddress } = config;

    // Create wallet client for old session key with EIP-7966 sync support
    const oldSessionAccount = privateKeyToAccount(oldSessionKeyPrivateKey);
    const oldSessionWallet = createWalletClient({
      account: oldSessionAccount,
      chain: monadDevnet,
      transport: createSyncTransport(transport),
    });

    // Estimate gas for the transfer
    const gasPrice = await publicClient.getGasPrice();
    const estimatedGas = 50000n; // Conservative estimate (actual ~40k on Monad)
    const gasCostWithMargin = gasPrice * estimatedGas * 2n; // 100% safety margin

    // Calculate transfer amount (leave enough for gas)
    const transferAmount = balance - gasCostWithMargin;

    if (transferAmount <= 0n) {
      return {
        success: false,
        error: `Balance (${formatEther(balance)} MON) is not enough to cover gas costs.`,
      };
    }

    // Determine recipient based on destination
    let recipientAddress: Address;
    if (destination === "new_session_key") {
      // Generate the new key first to get its address
      const newKey = generateSessionKey();
      recipientAddress = newKey.address;

      // Store the new key temporarily so we can use it after transfer
      // The actual rotation will overwrite this, but we need the address now
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config as any)._pendingNewKey = newKey;
    } else {
      recipientAddress = smartAccountAddress;
    }

    // Execute transfer (direct EOA transaction)
    const txHash = await oldSessionWallet.sendTransaction({
      to: recipientAddress,
      value: transferAmount,
    });

    // Wait for confirmation (EIP-7966 optimized)
    const receipt = await waitForReceiptSync(publicClient, txHash, { timeout: 60_000 });

    if (receipt.status !== "success") {
      return {
        success: false,
        txHash,
        error: "Transfer transaction failed on-chain.",
      };
    }

    return {
      success: true,
      txHash,
      transferredAmount: transferAmount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Transfer failed: ${message}`,
    };
  }
}

// ============================================================================
// Atomic Rotation
// ============================================================================

/**
 * Rotate session key atomically.
 * Updates localStorage and returns new key for state propagation.
 *
 * If a pending new key exists (from transfer to new_session_key),
 * use that instead of generating a new one.
 */
export function rotateSessionKeyAtomic(
  delegator: Address,
  pendingNewKey?: { address: Address; privateKey: Hex }
): SessionKeyRecord {
  if (pendingNewKey) {
    // Use the key we already generated and transferred funds to
    // We need to manually update storage since rotateSessionKeyStorage generates a new one
    const STORAGE_KEY = "pragma.h1.session-keys.v1";
    const normalized = delegator.toLowerCase();

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const records = raw ? JSON.parse(raw) : {};

      const stored = {
        delegator: delegator,
        address: pendingNewKey.address,
        privateKey: pendingNewKey.privateKey,
        createdAt: Date.now(),
      };
      records[normalized] = stored;

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));

      return { ...stored, isNew: true };
    } catch {
      // Fallback to regular rotation if storage fails
      return rotateSessionKeyStorage(delegator);
    }
  }

  // Normal rotation - generate new key
  return rotateSessionKeyStorage(delegator);
}

// ============================================================================
// Combined Flow
// ============================================================================

/**
 * Execute complete session key rotation with optional fund transfer.
 *
 * CRITICAL FLOW ORDER:
 * 1. Check balance
 * 2. Transfer funds (if possible and requested)
 * 3. Rotate key ONLY after transfer succeeds
 *
 * This order prevents orphaned funds.
 */
export async function executeQuickRotation(
  config: RotationConfig
): Promise<RotationResult> {
  try {
    const { delegator, oldSessionKeyAddress, publicClient, destination } = config;

    // Step 1: Check balance
    const balanceCheck = await checkSessionKeyBalanceForRotation(
      oldSessionKeyAddress,
      publicClient
    );

    let transferResult: TransferResult | undefined;

    // Step 2: Transfer funds if possible
    if (balanceCheck.canTransfer) {
      transferResult = await transferFundsFromSessionKey(config, balanceCheck.balance);

      // CRITICAL: Abort rotation if transfer fails
      if (!transferResult.success) {
        return {
          success: false,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          newSessionKey: null as any, // Will not be used
          transferResult,
          error: `Fund transfer failed: ${transferResult.error}. Rotation aborted to prevent orphaned funds.`,
        };
      }
    }

    // Step 3: Rotate key (only after successful transfer or if no transfer needed)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pendingNewKey = destination === "new_session_key" ? (config as any)._pendingNewKey : undefined;
    const newSessionKey = rotateSessionKeyAtomic(delegator, pendingNewKey);

    return {
      success: true,
      newSessionKey,
      transferResult,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      newSessionKey: null as any,
      error: `Rotation failed: ${message}`,
    };
  }
}

// ============================================================================
// Utility: Simple Rotation (No Transfer)
// ============================================================================

/**
 * Simple rotation without fund transfer.
 * Use when user explicitly skips transfer or balance is too low.
 */
export function executeSimpleRotation(delegator: Address): SessionKeyRecord {
  return rotateSessionKeyStorage(delegator);
}
