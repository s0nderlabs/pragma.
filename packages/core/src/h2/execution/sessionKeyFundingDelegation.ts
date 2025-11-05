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
  createWalletClient,
  http,
  formatEther,
  getAddress,
  toHex,
  keccak256,
  concat,
  numberToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createExecution,
  ExecutionMode,
  redeemDelegations,
  createDelegation,
  getDeleGatorEnvironment,
  type Caveats,
} from "@metamask/delegation-toolkit";

import { buildDelegationTypedData } from "../../delegations/typedData.js";
import { ZERO_SALT } from "../../delegations/hybrid.js";
import { SESSION_KEY_FUNDING_AMOUNT } from "./sessionKeyManager.js";
import {
  MONAD_RPC_URL,
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
  } = params;

  // Step 1: Fetch current nonce from NonceEnforcer
  const nonce = await publicClient.readContract({
    address: NONCE_ENFORCER_ADDRESS,
    abi: NONCE_ENFORCER_ABI,
    functionName: "currentNonce",
    args: [DELEGATION_MANAGER_ADDRESS, smartAccountAddress],
  }) as bigint;

  // Step 2: Create delegation for native MON transfer
  // Use nativeTokenTransferAmount scope (H1 pattern - same as transferToolDirect.ts)
  const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 minutes
  const environment = getDeleGatorEnvironment(chainId);

  const transferScope = {
    type: "nativeTokenTransferAmount" as const,
    maxAmount: SESSION_KEY_FUNDING_AMOUNT,
  };

  const transferCaveats: Caveats = [
    {
      type: "timestamp" as const,
      afterThreshold: 0,
      beforeThreshold: expiresAt,
    },
    {
      type: "nonce" as const,
      nonce: toHex(nonce),
    },
    {
      type: "limitedCalls" as const,
      limit: 1,
    },
  ] as unknown as Caveats;

  // Generate unique salt for this funding delegation
  // CRITICAL: Prevents hash collisions when multiple parallel operations
  // trigger session key funding simultaneously
  const uniqueSalt = keccak256(
    concat([
      numberToHex(Date.now(), { size: 32 }),      // Timestamp (millisecond precision)
      numberToHex(Math.floor(Math.random() * 1e18), { size: 32 }), // Random value
      toHex(nonce),                                // Current nonce
    ])
  );

  const delegation = createDelegation({
    environment,
    scope: transferScope,
    from: getAddress(smartAccountAddress) as Hex,
    to: getAddress(sessionKeyAddress) as Hex,
    caveats: transferCaveats,
    salt: uniqueSalt,  // Unique salt prevents delegation hash collisions
  });

  const typedData = buildDelegationTypedData(delegation, chainId, DELEGATION_MANAGER_ADDRESS);

  // Step 3: Sign delegation with Web3Auth (EOA signature)
  const { signature } = await web3authBridge.signTypedData({
    typedDataJson: JSON.stringify(typedData),
    from: ownerAddress,
  });
  delegation.signature = signature;

  // Step 4: Build native transfer execution
  // Transfer 0.5 MON from smart account to session key
  const execution = createExecution({
    target: sessionKeyAddress,
    value: SESSION_KEY_FUNDING_AMOUNT,
    callData: "0x", // Native transfer (no contract call)
  });

  // Step 5: Create session wallet client
  // Session key will sign the transaction and pay gas from its remaining balance
  const sessionWallet = createWalletClient({
    account: privateKeyToAccount(sessionKeyPrivateKey),
    chain: {
      id: chainId,
      name: "Monad",
      nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
      rpcUrls: { default: { http: [MONAD_RPC_URL] }, public: { http: [MONAD_RPC_URL] } },
    },
    transport: http(MONAD_RPC_URL),
  });

  // Step 6: Submit transaction via delegation redemption
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

  // Step 7: Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });

  // Step 8: Verify success and get new balance
  if (receipt.status !== "success") {
    throw new Error(`Session key refill transaction failed: ${txHash}`);
  }

  const newBalance = await publicClient.getBalance({
    address: sessionKeyAddress,
  });

  // Step 9: Return result
  return {
    transactionHash: txHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    fundedAmount: SESSION_KEY_FUNDING_AMOUNT,
    newBalance,
  };
}
