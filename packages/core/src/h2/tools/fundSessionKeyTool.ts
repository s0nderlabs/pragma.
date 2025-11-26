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
      // Log detailed error for debugging
      console.error('[fundSessionKeyTool] Full error:', error);
      console.error('[fundSessionKeyTool] Error message:', (error as Error).message);
      console.error('[fundSessionKeyTool] Error stack:', (error as Error).stack);

      throw createErrorFromCode("TRANSACTION_EXECUTION_FAILED", {
        message: `Failed to fund session key: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "fundSessionKey",
    description: `Fund session key with MON from smart account to cover gas costs.

⚡ **WHEN TO USE:**
Call this tool when checkSessionKeyBalance reports "needsFunding = true" or when
execution tools fail with "Session key balance too low" error.

**Funding Strategy:**
- **Dynamic funding (recommended):** Pass estimatedOperations to calculate exact amount needed
  - Example: 17 swaps → calculates (17 × 0.11 + 0.20) = 2.07 MON requirement
  - Funds: (2.07 - currentBalance) + 0.1 MON buffer
  - Prevents under-funding for large batches
- **Fixed funding (fallback):** If estimatedOperations not provided, funds fixed 1.0 MON

**Funding Method:**
- Initial funding (< 0.05 MON): Uses UserOp via bundler (no gas needed from session key)
- Refill funding (≥ 0.05 MON): Uses ephemeral delegation (session key pays gas from remaining balance)

**Workflow:**
1. checkSessionKeyBalance({estimatedOperations: N}) → reports needsFunding and recommendedAmount
2. fundSessionKey({estimatedOperations: N}) → funds calculated amount
3. Execute operations → swaps, transfers, etc.

Returns:
- Funded amount (MON) - may vary based on estimatedOperations
- New session key balance
- Transaction hash
- Funding method used (userOp or delegation)

Examples:
- Single swap: fundSessionKey({operationType: "swap", estimatedOperations: 1}) → funds for 0.16 MON requirement
- Batch of 3 swaps: fundSessionKey({operationType: "swap", estimatedOperations: 3}) → funds for 0.44 MON requirement
- Transfer: fundSessionKey({operationType: "transfer", estimatedOperations: 1}) → funds for 0.06 MON requirement
- Unknown operations: fundSessionKey() → funds fixed 1.0 MON`,
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
