/**
 * Session Key Funding via Delegation
 *
 * Funds session key from smart account using native MON transfer delegation.
 * This approach is used for REFILLS when session key has > 0 but < 0.1 MON.
 *
 * Uses `nativeTokenTransferAmount` scope (same pattern as transferToolDirect.ts).
 *
 * Flow:
 * 1. Fetch current nonce from DelegationManager
 * 2. Create delegation with nativeTokenTransferAmount scope
 * 3. Sign delegation with Web3Auth (EOA signature)
 * 4. Build native transfer execution (to session key)
 * 5. Sign transaction with session key (pays gas from remaining balance)
 * 6. Submit via delegation redemption
 * 7. Wait for confirmation
 * 8. Return result
 *
 * Benefits over UserOp:
 * - Consistent with all other native transfers in codebase
 * - Session key autonomously manages its own refills
 * - More efficient (no bundler overhead)
 * - Uses NativeTokenTransferAmountEnforcer (not AllowedMethodsEnforcer)
 */

import {
  type Address,
  type Hex,
  type PublicClient,
  type Transport,
  createWalletClient,
  formatEther,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createExecution,
  ExecutionMode,
  redeemDelegations,
} from "@metamask/delegation-toolkit";

import { SESSION_KEY_FUNDING_AMOUNT } from "./sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";
import { emitProgress } from "../progress/emitter.js";
import { createNativeTransferDelegation } from "../delegation/transferDelegation.js";
import { createSyncTransport } from "./syncTransport.js";
import { waitForReceiptSync } from "./syncReceipt.js";
import {
  DELEGATION_MANAGER_ADDRESS,
  NONCE_ENFORCER_ADDRESS,
  NONCE_ENFORCER_ABI,
} from "../config.js";

// ============================================================================
// Types
// ============================================================================

export interface FundSessionKeyViaDelegationParams {
  /** Smart account address (HybridDelegator - delegator) */
  smartAccountAddress: Address;
  /** Session key address (recipient of funding) */
  sessionKeyAddress: Address;
  /** Session key private key (for signing transaction) */
  sessionKeyPrivateKey: Hex;
  /** Owner address (for signing delegation) */
  ownerAddress: Address;
  /** Chain ID */
  chainId: number;
  /** Public client for reading blockchain state */
  publicClient: PublicClient;
  /** Web3Auth bridge for delegation signing */
  web3authBridge: any;
  /** Transport for wallet client (e.g., authenticated RPC proxy) */
  transport: Transport;
  /** Optional dynamic funding amount (defaults to SESSION_KEY_FUNDING_AMOUNT) */
  fundingAmount?: bigint;
}

export interface FundSessionKeyViaDelegationResult {
  /** Transaction hash */
  transactionHash: Hex;
  /** Block number where tx was included */
  blockNumber: bigint;
  /** Gas used by transaction */
  gasUsed: bigint;
  /** Amount funded (0.5 MON) */
  fundedAmount: bigint;
  /** New session key balance after funding */
  newBalance: bigint;
}

// ============================================================================
// Main Funding Function
// ============================================================================

/**
 * Fund session key via native MON transfer delegation
 *
 * This function creates a delegation with `nativeTokenTransferAmount` scope,
 * allowing the session key to execute a native MON transfer from the smart
 * account to itself.
 *
 * Uses the same pattern as transferToolDirect.ts for native transfers.
 *
 * @param params - Funding parameters
 * @returns Funding result with tx details and new balance
 *
 * @example
 * ```typescript
 * const result = await fundSessionKeyViaDelegation({
 *   smartAccountAddress: "0x123...",
 *   sessionKeyAddress: "0xabc...",
 *   sessionKeyPrivateKey: "0xdef...",
 *   ownerAddress: "0x456...",
 *   chainId: 10143,
 *   publicClient,
 *   web3authBridge,
 * });
 *
 * console.log(`Funded ${formatEther(result.fundedAmount)} MON`);
 * console.log(`New balance: ${formatEther(result.newBalance)} MON`);
 * ```
 */
export async function fundSessionKeyViaDelegation(
  params: FundSessionKeyViaDelegationParams
): Promise<FundSessionKeyViaDelegationResult> {
  const {
    smartAccountAddress,
    sessionKeyAddress,
    sessionKeyPrivateKey,
    ownerAddress,
    chainId,
    publicClient,
    web3authBridge,
    transport,
    fundingAmount = SESSION_KEY_FUNDING_AMOUNT, // Default to fixed amount if not provided
  } = params;

  // Step 1: Fetch current nonce from NonceEnforcer
  const nonce = await publicClient.readContract({
    address: NONCE_ENFORCER_ADDRESS,
    abi: NONCE_ENFORCER_ABI,
    functionName: "currentNonce",
    args: [DELEGATION_MANAGER_ADDRESS, smartAccountAddress],
  }) as bigint;

  // Step 2: Create delegation for native MON transfer with dynamic funding amount
  // Use proven helper function (same pattern as transferToolDirect.ts)
  const { delegation, typedData } = createNativeTransferDelegation({
    recipient: sessionKeyAddress,  // Transfer to session key itself
    amount: fundingAmount,
    delegator: getAddress(smartAccountAddress),
    sessionKey: getAddress(sessionKeyAddress),
    nonce,
    chainId,
    delegationManager: DELEGATION_MANAGER_ADDRESS,
  });

  // Step 3: Sign delegation with Web3Auth (EOA signature)
  const { signature } = await web3authBridge.signTypedData({
    typedDataJson: JSON.stringify(typedData),
    from: ownerAddress,
  });
  delegation.signature = signature;

  // Step 4: Build native transfer execution
  // Transfer dynamic funding amount from smart account to session key
  const execution = createExecution({
    target: sessionKeyAddress,
    value: fundingAmount,
    callData: "0x", // Native transfer (no contract call)
  });

  // Step 5: Create session wallet client
  // Session key will sign the transaction and pay gas from its remaining balance
  // Uses authenticated transport passed from caller (e.g., /api/rpc proxy)
  // Wrap transport with EIP-7966 sync support for faster confirmations
  const sessionWallet = createWalletClient({
    account: privateKeyToAccount(sessionKeyPrivateKey),
    chain: {
      id: chainId,
      name: "Monad",
      nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
      rpcUrls: { default: { http: [] }, public: { http: [] } }, // RPC URLs not needed (transport handles routing)
    },
    transport: createSyncTransport(transport, { debug: true }), // Use authenticated transport from caller
  });

  // Step 6: Submit transaction via delegation redemption
  emitProgress("Executing Funding Transaction...");
  const txHash = await redeemDelegations(
    sessionWallet,
    publicClient,
    DELEGATION_MANAGER_ADDRESS,
    [{
      permissionContext: [delegation],
      executions: [execution],
      mode: ExecutionMode.SingleDefault,
    }],
  );

  // Step 7: Wait for confirmation (EIP-7966 optimized)
  emitProgress("Waiting for Confirmation...");
  const receipt = await waitForReceiptSync(publicClient, txHash);

  // Step 8: Verify success and get new balance
  if (receipt.status !== "success") {
    throw new Error(`Session key refill transaction failed: ${txHash}`);
  }

  // Wait for RPC state propagation (prevent stale balance reads)
  // RPC nodes may have stale state immediately after waitForTransactionReceipt
  // Adding 2s delay ensures balance updates have propagated across the network
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const newBalance = await publicClient.getBalance({
    address: sessionKeyAddress,
  });

  // Step 9: Return result
  return {
    transactionHash: txHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    fundedAmount: fundingAmount,
    newBalance,
  };
}
