/**
 * Unstake Request Tool (aPriori - Step 1 of 2)
 *
 * Initiates aprMON → MON unstaking by creating a withdrawal request.
 * This is FREE (only gas) but requires waiting 12-18 hours before claiming.
 *
 * Two-Step Unstaking Flow:
 * 1. THIS TOOL: requestRedeem() - Creates withdrawal request, returns requestId
 * 2. Wait for epoch to pass (12-18 hours)
 * 3. CLAIM TOOL: redeem(requestId) - Claims MON back (separate tool)
 *
 * Why Two Steps:
 * - aPriori needs time to prepare liquidity from staking pool
 * - Epoch-based queuing system ensures fair processing
 * - Prevents bank-run scenarios on staking protocol
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
  parseUnits,
  encodeFunctionData,
  getAddress,
  decodeEventLog,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createExecution,
  ExecutionMode,
  redeemDelegations,
} from "@metamask/delegation-toolkit";

import { createUnstakeRequestDelegation } from "../delegation/unstakeRequestDelegation.js";
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

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ============================================================================
// Unstake Request Tool Implementation
// ============================================================================

export const unstakeRequestTool = tool(
  async ({ amount }, config) => {
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

      const sharesWei = parseUnits(amount, 18);
      const sharesFormatted = formatUnits(sharesWei, 18);

      // Generate tool signature for progress routing
      const toolSignature = `unstakeRequest:${Date.now()}`;

      // First progress with description for parent tool display
      emitProgress(`Requesting Unstake for ${sharesFormatted} aprMON...`, "unstakeRequest", toolSignature, `Unstake ${sharesFormatted} aprMON`);

      // Check aprMON balance
      const aprMonBalance = await publicClient.readContract({
        address: getAddress(APRIORI_ADDRESS),
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [getAddress(userAddress)],
      }) as bigint;

      if (aprMonBalance < sharesWei) {
        throw createErrorFromCode("INSUFFICIENT_BALANCE", {
          message: `Insufficient aprMON balance. Required: ${sharesFormatted}, Available: ${formatUnits(aprMonBalance, 18)}`,
        });
      }

      // Check session key balance (throw error if insufficient)
      const sessionKeyBalance = await publicClient.getBalance({
        address: sessionData.sessionKeyAddress,
      });

      const minUnstakeBalance = getMinBalanceForOperation('unstake');
      if (sessionKeyBalance < minUnstakeBalance) {
        throw createErrorFromCode("SESSION_KEY_LOW_BALANCE", {
          message: `Session key balance too low: ${formatEther(sessionKeyBalance)} MON (minimum for unstake: ${formatEther(minUnstakeBalance)} MON). Fund session key first using fundSessionKey tool.`,
        });
      }

      // Fetch delegation nonce from NonceEnforcer
      const nonce = await publicClient.readContract({
        address: NONCE_ENFORCER_ADDRESS,
        abi: NONCE_ENFORCER_ABI,
        functionName: "currentNonce",
        args: [DELEGATION_MANAGER_ADDRESS, userAddress],
      }) as bigint;

      // Build requestRedeem calldata
      // requestRedeem(uint256 shares, address controller, address owner)
      // - shares: Amount of aprMON to unstake
      // - controller: Who can claim the withdrawal (user's smart account)
      // - owner: Who owns the shares (user's smart account)
      const requestRedeemCalldata = encodeFunctionData({
        abi: APRIORI_ABI,
        functionName: "requestRedeem",
        args: [sharesWei, getAddress(userAddress), getAddress(userAddress)],
      });

      emitProgress(`Building Unstake Delegation...`, "unstakeRequest", toolSignature);

      // Create ephemeral delegation for unstake request
      const { delegation, typedData } = createUnstakeRequestDelegation({
        aprioriAddress: getAddress(APRIORI_ADDRESS),
        shares: sharesWei,
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
        callData: requestRedeemCalldata,
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

      emitProgress(`Executing Unstake Request...`, "unstakeRequest", toolSignature);

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

      emitProgress(`Waiting for Blockchain Confirmation...`, "unstakeRequest", toolSignature);

      // Wait for confirmation (EIP-7966 optimized)
      const receipt = await waitForReceiptSync(publicClient, txHash);

      // Parse logs to detect both request creation AND instant claim completion
      // Testnet (withdrawalDelay=0): Both RedeemRequest + Redeem events emitted
      // Mainnet (withdrawalDelay>0): Only RedeemRequest event emitted
      let requestId: bigint | undefined;
      let hasInstantClaim = false;
      let claimedAssets: bigint | undefined;

      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: APRIORI_ABI,
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === "RedeemRequest") {
            requestId = (decoded.args as any).requestId;
          }

          // Check if withdrawal was instantly claimed in same transaction
          if (decoded.eventName === "Redeem") {
            hasInstantClaim = true;
            claimedAssets = (decoded.args as any).assets;
          }
        } catch {
          // Not the event we're looking for, continue
        }
      }

      if (!requestId) {
        throw createErrorFromCode("EXEC_DELEGATION_REDEEM_REVERT", {
          message: "Failed to find requestId in transaction logs",
        });
      }

      // Dynamic messaging based on whether unstaking completed instantly
      if (hasInstantClaim) {
        const claimedAssetsFormatted = formatUnits(claimedAssets || 0n, 18);

        // Format message for LLM (clean, human-readable)
        const message = `Unstake executed successfully! 🎉

📊 Receipt:
• Unstaked: ${sharesFormatted} aprMON → ${claimedAssetsFormatted} MON
• Request ID: ${requestId}
• Tx Hash: ${txHash}
• Block: ${receipt.blockNumber}
• Gas Used: ${receipt.gasUsed} units

⚡ **Testnet Mode:** Withdrawals are instant (withdrawalDelay = 0 epochs)

Your aprMON has been converted back to MON instantly!`;

        // Prepare metadata for activity extraction
        const metadata = {
          txHash,
          blockNumber: receipt.blockNumber.toString(),
          gasUsed: receipt.gasUsed.toString(),
          status: receipt.status === 'success' ? 'success' : 'failed',
          fromToken: 'aprMON',
          toToken: 'MON',
          fromAmount: sharesFormatted,
          toAmount: claimedAssetsFormatted,
          requestId: requestId.toString(),
          delegationMetadata: {
            delegator: userAddress,
            sessionKey: sessionData.sessionKeyAddress,
            nonce: nonce.toString(), // Convert BigInt to string
            delegationCount: 1,
            delegationTypes: ['unstakeRequest'],
            expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes in seconds
            feeEnforced: false, // FREE operation
          },
        };

        // Return message with embedded metadata
        return `${message}\n\n<!--PRAGMA_METADATA:${JSON.stringify(metadata)}-->`;
      } else {
        // Format message for LLM (clean, human-readable)
        const message = `Unstake request submitted! 🎉

📊 Receipt:
• Request ID: ${requestId}
• aprMON Requested: ${sharesFormatted}
• Tx Hash: ${txHash}
• Block: ${receipt.blockNumber}
• Gas Used: ${receipt.gasUsed} units

⏳ **Next Steps:**
1. Wait 12-18 hours for the epoch to pass
2. Check status with: "check unstake status"
3. Once claimable, use: "claim unstake ${requestId}"

Your withdrawal request is queued and will be claimable after the current staking epoch ends.`;

        // Prepare metadata for activity extraction
        const metadata = {
          txHash,
          blockNumber: receipt.blockNumber.toString(),
          gasUsed: receipt.gasUsed.toString(),
          status: receipt.status === 'success' ? 'success' : 'failed',
          fromToken: 'aprMON',
          toToken: 'MON',
          fromAmount: sharesFormatted,
          toAmount: undefined, // Will be claimed later
          requestId: requestId.toString(),
          delegationMetadata: {
            delegator: userAddress,
            sessionKey: sessionData.sessionKeyAddress,
            nonce: nonce.toString(), // Convert BigInt to string
            delegationCount: 1,
            delegationTypes: ['unstakeRequest'],
            expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes in seconds
            feeEnforced: false, // FREE operation
          },
        };

        // Return message with embedded metadata
        return `${message}\n\n<!--PRAGMA_METADATA:${JSON.stringify(metadata)}-->`;
      }
    } catch (error) {
      throw createErrorFromCode("EXEC_DELEGATION_REDEEM_REVERT", {
        message: `Failed to request unstake: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "unstakeRequest",
    description: "Request unstake aprMON → MON. FREE (gas only). Testnet: instant. Mainnet: 12-18h wait. Call search_tool_docs('unstakeRequest') for detailed usage.",
    schema: z.object({
      amount: z.string().describe("Amount of aprMON to unstake (decimal string like '0.5')"),
    }),
  }
);
