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
  createWalletClient,
  http,
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
import { checkSessionKeyBalance, fundSessionKey, SESSION_KEY_FUNDING_AMOUNT } from "../execution/sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";
import { APRIORI_ADDRESS } from "../config.js";
import { APRIORI_ABI } from "../../contracts/aprMonABI.js";

// ============================================================================
// Constants
// ============================================================================

const MONAD_RPC_URL = process.env.MONAD_EXECUTION_RPC_URL || "https://testnet.monad.xyz/";
const DELEGATION_MANAGER_ADDRESS = (process.env.DELEGATION_MANAGER_ADDRESS as Address) || "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" as Address;
const NONCE_ENFORCER_ADDRESS = (process.env.NONCE_ENFORCER_ADDRESS as Address) || "0xDE4f2FAC4B3D87A1d9953Ca5FC09FCa7F366254f" as Address;

const NONCE_ENFORCER_ABI = [
  {
    type: "function",
    name: "currentNonce",
    stateMutability: "view",
    inputs: [
      { name: "delegationManager", type: "address" },
      { name: "delegator", type: "address" },
    ],
    outputs: [{ name: "nonce", type: "uint256" }],
  },
] as const;

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

      if (!userAddress || !publicClient || !sessionData || !web3authBridge) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Missing required context",
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
      const isBatch = requestIdArray.length > 1;

      // Check session key balance and auto-fund if needed
      const { needsFunding, balance } = await checkSessionKeyBalance(
        sessionData.sessionKeyAddress,
        publicClient
      );

      if (needsFunding) {
        // Notify user about auto-funding
        console.log(`\n⚡ Session key needs gas`);
        console.log(`   Current balance: ${formatEther(balance)} MON (minimum: 0.1 MON)`);
        console.log(`   Transferring ${formatEther(SESSION_KEY_FUNDING_AMOUNT)} MON from smart account...\n`);

        // Auto-fund session key (user approved this during onboarding)
        const fundingResult = await fundSessionKey(
          {
            smartAccountAddress: userAddress,
            sessionKeyAddress: sessionData.sessionKeyAddress,
            sessionKeyPrivateKey: sessionData.sessionKeyPrivateKey,
            ownerAddress: sessionData.ownerAddress,
            chainId: sessionData.chainId,
            rpcUrl: MONAD_RPC_URL,
            delegationManager: DELEGATION_MANAGER_ADDRESS,
            smartAccount,
            bundlerClient,
          },
          publicClient,
          web3authBridge
        );

        console.log(`✓ Session key funded: ${formatEther(fundingResult.newBalance)} MON`);
        console.log(`   Tx: ${fundingResult.txHash}\n`);
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

      // Create session wallet
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

      // Get MON balance before claiming
      const balanceBefore = await publicClient.getBalance({ address: getAddress(userAddress) });

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

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      // Get MON balance after claiming
      const balanceAfter = await publicClient.getBalance({ address: getAddress(userAddress) });
      const claimedAmount = balanceAfter - balanceBefore;

      // Calculate aPriori fee (0.1% of claimed amount)
      const aprioriFeeBps = 10n; // 10 basis points = 0.1%
      const aprioriFee = (totalClaimableAssets * aprioriFeeBps) / 10000n;

      return `✅ Unstake claim successful!

• Request ID${isBatch ? "s" : ""}: ${requestIds}
• Claimed: ${formatUnits(claimedAmount, 18)} MON
• aPriori Fee: ${formatUnits(aprioriFee, 18)} MON (0.1%)
• Transaction: ${txHash}
• Block: ${receipt.blockNumber}
• Gas Used: ${receipt.gasUsed}

Your MON has been returned from staking. ${isBatch ? `${requestIdArray.length} requests` : "Request"} successfully claimed.`;
    } catch (error) {
      throw createErrorFromCode("EXEC_DELEGATION_REDEEM_REVERT", {
        message: `Failed to claim unstake: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "unstakeClaim",
    description: `Claim MON from completed withdrawal requests (Step 2 of 2). FREE operation (only gas).

⚡ **TESTNET NOTE:** Withdrawals are instant (withdrawalDelay = 0), so you likely already
   received your MON when you unstaked. This tool is only needed on mainnet with delays.

This tool completes the unstaking process and returns your MON.

Use when user wants to:
- Claim MON from withdrawal requests
- Complete the unstaking process
- Get MON back after waiting period

Prerequisites (MAINNET):
- Must have completed unstake request (via unstakeRequest tool)
- Must wait 12-18 hours after request for epoch to pass
- Request must be claimable (check with checkUnstakeStatus tool)

Prerequisites (TESTNET):
- Usually not needed - withdrawals complete instantly
- Only use if you have old pending requests from before instant mode

Process:
1. Validates all requestIds are claimable
2. Creates ephemeral delegation (1-time use)
3. Executes claim via aPriori.redeem()
4. Returns MON to your account (minus 0.1% aPriori fee)

Batch Support:
- Single: "claim unstake 123"
- Batch: "claim unstake 123,456,789" (comma-separated, more gas efficient)

Fee: 0.1% aPriori protocol fee on claimed MON amount (NOT Pragma fee)

Example: "claim unstake 42" or "claim unstake 1,2,3"`,
    schema: z.object({
      requestIds: z.string().describe("Comma-separated request IDs to claim (e.g., '123' or '1,2,3')"),
    }),
  }
);
