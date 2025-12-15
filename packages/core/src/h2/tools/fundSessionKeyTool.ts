/**
 * Fund Session Key Tool
 *
 * Funds session key with MON from smart account to cover gas costs.
 * Transfers a fixed amount (1.0 MON) to the session key.
 *
 * Uses two-phase funding approach:
 * - Initial funding (0 MON): Uses UserOp via bundler
 * - Refill funding (> 0 but < 0.1 MON): Uses ephemeral delegation
 */

import { tool } from "langchain";
import { z } from "zod";
import type { Address, PublicClient, Hex, Transport } from "viem";
import { formatEther, getAddress } from "viem";

import {
  fundSessionKey,
  SESSION_KEY_FUNDING_AMOUNT,
  MIN_GAS_FOR_DELEGATION,
  estimateGasForOperations,
  type SessionKeyFundingConfig,
  type OperationType,
} from "../execution/sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";
import { DELEGATION_MANAGER_ADDRESS } from "../config.js";

// ============================================================================
// Fund Session Key Tool Implementation
// ============================================================================

export const fundSessionKeyTool = tool(
  async (input, config) => {
    try {
      const userAddress = config?.configurable?.userAddress;
      const sessionData = config?.configurable?.sessionData;
      const publicClient = config?.configurable?.publicClient as PublicClient;
      const web3authBridge = config?.configurable?.web3authBridge;
      const smartAccount = config?.configurable?.smartAccount;
      const bundlerClient = config?.configurable?.bundlerClient;
      const transport = config?.configurable?.transport as Transport;
      const operationType = input.operationType as OperationType | undefined;

      if (!sessionData || !publicClient || !web3authBridge || !transport) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Missing required configuration for session key funding (sessionData, publicClient, web3authBridge, or transport)",
        });
      }

      const fundingConfig: SessionKeyFundingConfig = {
        smartAccountAddress: userAddress as Address,
        sessionKeyAddress: sessionData.sessionKeyAddress as Address,
        sessionKeyPrivateKey: sessionData.sessionKeyPrivateKey as Hex,
        ownerAddress: sessionData.ownerAddress as Address,
        chainId: sessionData.chainId,
        delegationManager: DELEGATION_MANAGER_ADDRESS,
        smartAccount,
        bundlerClient,
      };

      // Check balance before funding to determine which method will be used
      const balanceBefore = await publicClient.getBalance({
        address: getAddress(fundingConfig.sessionKeyAddress),
      });
      const fundingMethod = balanceBefore < MIN_GAS_FOR_DELEGATION ? 'userOp' : 'delegation';

      // Simple tool with single operation - no progress needed (parent name is sufficient)

      // Fund session key with operation-specific calculation
      const result = await fundSessionKey(
        fundingConfig,
        publicClient,
        web3authBridge,
        transport, // Authenticated transport from config (e.g., /api/rpc proxy)
        {
          estimatedOperations: input.estimatedOperations,
          operationType, // Use operation-specific gas costs (e.g., swap = 0.14 MON)
        }
      );

      // Format response
      const fundedAmountFormatted = formatEther(result.fundedAmount);
      const newBalanceFormatted = formatEther(result.newBalance);

      if (result.fundedAmount === 0n) {
        return `**Session Key Funding**

Status: ✅ No funding needed
Current Balance: ${newBalanceFormatted} MON (sufficient)

Session key already has enough balance for operations.`;
      }

      // Embed metadata for activity tracking
      const metadata = {
        txHash: result.txHash,
        status: 'success',
        fundedAmount: fundedAmountFormatted,
        newBalance: newBalanceFormatted,
        fromToken: 'MON',
        toToken: 'MON',
        fromAmount: fundedAmountFormatted,
        toAmount: fundedAmountFormatted,
        fundingMethod,
        fromAddress: fundingConfig.smartAccountAddress,
        recipientAddress: fundingConfig.sessionKeyAddress,
      };

      return `**Session Key Funding Complete**

✅ Funded: ${fundedAmountFormatted} MON
New Balance: ${newBalanceFormatted} MON
Transaction: ${result.txHash}
Method: ${fundingMethod === 'userOp' ? 'UserOp' : 'Delegation'}

Session key is now funded and ready for operations.
You can proceed with swaps, transfers, and other operations.

<!--PRAGMA_METADATA:${JSON.stringify(metadata)}-->`;
    } catch (error) {
      throw createErrorFromCode("TRANSACTION_EXECUTION_FAILED", {
        message: `Failed to fund session key: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "fundSessionKey",
    description: "Fund session key with MON from smart account for gas. Pass estimatedOperations count. Formula: (N × gas per op) + 0.20 MON buffer. Use when checkSessionKeyBalance shows needsFunding.",
    schema: z.object({
      operationType: z.enum(["swap", "transfer", "wrap", "unwrap", "stake", "unstake", "unstakeClaim"]).optional().describe(
        "Type of operation to fund for. IMPORTANT: Always specify this for accurate gas calculation! " +
        "Each operation has different gas costs: swap=0.14 MON, transfer/wrap/unwrap=0.04 MON, stake=0.07 MON, unstake=0.075 MON"
      ),
      estimatedOperations: z.number().optional().describe(
        "Number of operations planned. Combined with operationType for accurate calculation. " +
        "Examples: 1 swap = 0.14 + 0.02 buffer = 0.16 MON needed, 3 swaps = 0.44 MON needed"
      ),
    }),
  }
);
