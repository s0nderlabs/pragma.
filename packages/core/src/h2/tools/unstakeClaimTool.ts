/**
 * Unstake Claim Tool (aPriori - Step 2 of 2)
 *
 * Claims MON from completed withdrawal requests. FREE operation (only gas).
 * Supports batch claiming for gas optimization.
 *
 * Two-Step Unstaking Flow:
 * 1. REQUEST TOOL: requestRedeem() - Creates withdrawal request
 * 2. Wait for epoch to pass (12-18 hours)
 * 3. THIS TOOL: redeem(requestId) - Claims MON back
 *
 * Fee Structure:
 * - aPriori: 0.1% (10 basis points) on claimed MON amount
 * - Pragma: No fee on unstaking/claiming (already collected on staking)
 *
 * Batch Support:
 * - Can claim multiple requestIds in one transaction
 * - More gas efficient than claiming individually
 * - Example: "claim unstake [1, 2, 3]" instead of 3 separate transactions
 */

import { tool } from "langchain";
import { z } from "zod";
import {
  type Address,
  type Hex,
  type PublicClient,
  type Transport,
  createWalletClient,
  formatUnits,
  formatEther,
  encodeFunctionData,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createExecution,
  ExecutionMode,
  redeemDelegations,
} from "@metamask/delegation-toolkit";

import { createUnstakeClaimDelegation } from "../delegation/unstakeClaimDelegation.js";
import { getMinBalanceForOperation } from "../execution/sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";
import { createSyncTransport } from "../execution/syncTransport.js";
import { waitForReceiptSync } from "../execution/syncReceipt.js";
import {
  APRIORI_ADDRESS,
  DELEGATION_MANAGER_ADDRESS,
  NONCE_ENFORCER_ADDRESS,
  NONCE_ENFORCER_ABI,
  MONAD_CHAIN,
} from "../config.js";
import { APRIORI_ABI } from "../../contracts/aprMonABI.js";
import { emitProgress } from "../progress/emitter.js";

// ============================================================================
// Unstake Claim Tool Implementation
// ============================================================================

export const unstakeClaimTool = tool(
  async ({ requestIds }, config) => {
    try {
      const userAddress = config?.configurable?.userAddress as Address;
      const publicClient = config?.configurable?.publicClient as PublicClient;
      const sessionData = config?.configurable?.sessionData as any;
      const web3authBridge = config?.configurable?.web3authBridge as any;
      const smartAccount = config?.configurable?.smartAccount;
      const bundlerClient = config?.configurable?.bundlerClient;
      let sessionWallet = config?.configurable?.sessionWallet;
      const transport = config?.configurable?.transport as Transport;

      if (!userAddress || !publicClient || !sessionData || !web3authBridge) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Missing required context",
        });
      }

      // Transport is required if sessionWallet not provided
      if (!sessionWallet && !transport) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Transport is required for RPC calls - cannot use direct RPC",
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

      // Parse requestIds (comma-separated string to bigint array)
      const requestIdArray = requestIds.split(",").map((id) => BigInt(id.trim()));

      // Generate tool signature for progress routing
      const toolSignature = `unstakeClaim:${Date.now()}`;

      // First progress with description for parent tool display
      const claimLabel = requestIdArray.length > 1 ? `${requestIdArray.length} requests` : `request ${requestIdArray[0]}`;
      emitProgress(`Claiming ${claimLabel}...`, "unstakeClaim", toolSignature, `Claim ${claimLabel}`);

      // ALWAYS use batch redeem (even for single claims) due to aPriori contract bug
      // Issue: Single redeem(uint256,address) requires operator approval via setOperator()
      // Fix: Batch redeem(uint256[],address) correctly checks direct controller permission
      // This allows claims to work without needing operator approval
      const isBatch = true;

      // Check session key balance (throw error if insufficient)
      const sessionKeyBalance = await publicClient.getBalance({
        address: sessionData.sessionKeyAddress,
      });

      const minUnstakeClaimBalance = getMinBalanceForOperation('unstakeClaim');
      if (sessionKeyBalance < minUnstakeClaimBalance) {
        throw createErrorFromCode("SESSION_KEY_LOW_BALANCE", {
          message: `Session key balance too low: ${formatEther(sessionKeyBalance)} MON (minimum for unstake claim: ${formatEther(minUnstakeClaimBalance)} MON). Fund session key first using fundSessionKey tool.`,
        });
      }

      // Validate that all requests are claimable
      // Get all user requests (paginated)
      const requestData = await publicClient.readContract({
        address: getAddress(APRIORI_ADDRESS),
        abi: APRIORI_ABI,
        functionName: "getUserRequestData",
        args: [getAddress(userAddress), 0n, 100n], // startIndex=0, pageSize=100
      }) as any[];

      let totalClaimableAssets = 0n;
      for (const requestId of requestIdArray) {
        const request = requestData.find((r: any) => r.id === requestId);
        if (!request) {
          throw createErrorFromCode("EXEC_DELEGATION_REDEEM_REVERT", {
            message: `Request ID ${requestId} not found for this account`,
          });
        }

        if (request.claimed) {
          throw createErrorFromCode("EXEC_DELEGATION_REDEEM_REVERT", {
            message: `Request ID ${requestId} has already been claimed`,
          });
        }

        if (!request.claimable) {
          throw createErrorFromCode("EXEC_DELEGATION_REDEEM_REVERT", {
            message: `Request ID ${requestId} is not yet claimable. Epoch unlock: ${request.unlockEpoch}. Please wait longer.`,
          });
        }

        totalClaimableAssets += request.assets;
      }

      // Fetch delegation nonce from NonceEnforcer
      const nonce = await publicClient.readContract({
        address: NONCE_ENFORCER_ADDRESS,
        abi: NONCE_ENFORCER_ABI,
        functionName: "currentNonce",
        args: [DELEGATION_MANAGER_ADDRESS, userAddress],
      }) as bigint;

      // Build redeem calldata (single or batch)
      // Both overloads require receiver parameter
      let redeemCalldata: Hex;
      if (isBatch) {
        // Batch: redeem(uint256[] requestIds, address receiver)
        redeemCalldata = encodeFunctionData({
          abi: APRIORI_ABI,
          functionName: "redeem",
          args: [requestIdArray, getAddress(userAddress)],
        });
      } else {
        // Single: redeem(uint256 requestId, address receiver)
        redeemCalldata = encodeFunctionData({
          abi: APRIORI_ABI,
          functionName: "redeem",
          args: [requestIdArray[0], getAddress(userAddress)],
        });
      }

      emitProgress(`Building Claim Delegation...`, "unstakeClaim", toolSignature);

      // Create ephemeral delegation for unstake claim
      const { delegation, typedData } = createUnstakeClaimDelegation({
        aprioriAddress: getAddress(APRIORI_ADDRESS),
        batchClaim: isBatch,
        delegator: getAddress(userAddress),
        sessionKey: getAddress(sessionData.sessionKeyAddress),
        nonce,
        chainId: sessionData.chainId,
        delegationManager: DELEGATION_MANAGER_ADDRESS,
      });

      // Sign delegation
      const { signature } = await web3authBridge.signTypedData({
        typedDataJson: JSON.stringify(typedData),
        from: sessionData.ownerAddress,
      });
      delegation.signature = signature;

      // Create execution
      const execution = createExecution({
        target: getAddress(APRIORI_ADDRESS),
        value: 0n,
        callData: redeemCalldata,
      });

      // Get or create session wallet using transport from config
      // Wrap transport with EIP-7966 sync support for faster confirmations
      if (!sessionWallet) {
        sessionWallet = createWalletClient({
          account: privateKeyToAccount(sessionData.sessionKeyPrivateKey),
          chain: MONAD_CHAIN,
          transport: createSyncTransport(transport!),
        });
      }

      // Get MON balance before claiming
      const balanceBefore = await publicClient.getBalance({ address: getAddress(userAddress) });

      emitProgress(`Executing Claim Transaction...`, "unstakeClaim", toolSignature);

      // Execute
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

      emitProgress(`Waiting for Blockchain Confirmation...`, "unstakeClaim", toolSignature);

      // Wait for confirmation (EIP-7966 optimized)
      const receipt = await waitForReceiptSync(publicClient, txHash);

      // Get MON balance after claiming
      const balanceAfter = await publicClient.getBalance({ address: getAddress(userAddress) });
      const claimedAmount = balanceAfter - balanceBefore;

      // Calculate aPriori fee (0.1% of claimed amount)
      const aprioriFeeBps = 10n; // 10 basis points = 0.1%
      const aprioriFee = (totalClaimableAssets * aprioriFeeBps) / 10000n;

      // Format amounts for display
      const claimedAmountFormatted = formatUnits(claimedAmount, 18);
      const aprioriFeeFormatted = formatUnits(aprioriFee, 18);

      // Format message for LLM (clean, human-readable)
      const message = `Unstake claim executed successfully! 🎉

📊 Receipt:
• Request ID${isBatch ? "s" : ""}: ${requestIds}
• Claimed: ${claimedAmountFormatted} MON
• aPriori Fee: ${aprioriFeeFormatted} MON (0.1%)
• Tx Hash: ${txHash}
• Block: ${receipt.blockNumber}
• Gas Used: ${receipt.gasUsed} units

Your MON has been returned from staking. ${isBatch ? `${requestIdArray.length} requests` : "Request"} successfully claimed.`;

      // Prepare metadata for activity extraction
      const metadata = {
        txHash,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status === 'success' ? 'success' : 'failed',
        fromToken: undefined, // Claiming previously unstaked amount
        toToken: 'MON',
        fromAmount: undefined, // We don't have the original aprMON amount here
        toAmount: claimedAmountFormatted,
        requestIds, // Store claimed request IDs
        delegationMetadata: {
          delegator: userAddress,
          sessionKey: sessionData.sessionKeyAddress,
          nonce: nonce.toString(), // Convert BigInt to string
          delegationCount: 1,
          delegationTypes: ['unstakeClaim'],
          expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes in seconds
          feeEnforced: false, // No Pragma fee (aPriori charges 0.1% protocol fee)
        },
      };

      // Return message with embedded metadata
      return `${message}\n\n<!--PRAGMA_METADATA:${JSON.stringify(metadata)}-->`;
    } catch (error) {
      throw createErrorFromCode("EXEC_DELEGATION_REDEEM_REVERT", {
        message: `Failed to claim unstake: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "unstakeClaim",
    description: "Claim MON from completed unstake request. FREE (gas only). Pass requestId from unstakeRequest. Check status with checkUnstakeStatus first to verify request is claimable. Returns claimed MON amount.",
    schema: z.object({
      requestIds: z.string().describe("Comma-separated request IDs to claim (e.g., '123' or '1,2,3')"),
    }),
  }
);
