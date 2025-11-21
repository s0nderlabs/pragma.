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
import type { Address, PublicClient, Hex } from "viem";
import { formatEther, getAddress } from "viem";

import {
  fundSessionKey,
  SESSION_KEY_FUNDING_AMOUNT,
  MIN_GAS_FOR_DELEGATION,
  type SessionKeyFundingConfig,
} from "../execution/sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";

// ============================================================================
// Constants
// ============================================================================

const MONAD_RPC_URL = process.env.MONAD_EXECUTION_RPC_URL || "https://testnet.monad.xyz/";
const DELEGATION_MANAGER_ADDRESS = (process.env.DELEGATION_MANAGER_ADDRESS as Address) || "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" as Address;

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

      if (!sessionData || !publicClient || !web3authBridge) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Missing required configuration for session key funding",
        });
      }

      const fundingConfig: SessionKeyFundingConfig = {
        smartAccountAddress: userAddress as Address,
        sessionKeyAddress: sessionData.sessionKeyAddress as Address,
        sessionKeyPrivateKey: sessionData.sessionKeyPrivateKey as Hex,
        ownerAddress: sessionData.ownerAddress as Address,
        chainId: sessionData.chainId,
        rpcUrl: MONAD_RPC_URL,
        delegationManager: DELEGATION_MANAGER_ADDRESS,
        smartAccount,
        bundlerClient,
      };

      // Check balance before funding to determine which method will be used
      const balanceBefore = await publicClient.getBalance({
        address: getAddress(fundingConfig.sessionKeyAddress),
      });
      const fundingMethod = balanceBefore < MIN_GAS_FOR_DELEGATION ? 'userOp' : 'delegation';

      // Fund session key with optional dynamic calculation
      const result = await fundSessionKey(
        fundingConfig,
        publicClient,
        web3authBridge,
        input.estimatedOperations // Pass through for dynamic funding calculation
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
- Single swap: fundSessionKey({estimatedOperations: 1}) → funds ~0.5 MON
- Batch of 17 swaps: fundSessionKey({estimatedOperations: 17}) → funds ~1.3 MON
- Unknown operations: fundSessionKey() → funds fixed 1.0 MON`,
    schema: z.object({
      estimatedOperations: z.number().optional().describe(
        "Number of operations planned (swaps, transfers, etc.). " +
        "If provided, calculates dynamic funding amount: (N × 0.11 MON) + 0.20 MON buffer. " +
        "Examples: 1 operation = ~0.5 MON, 10 operations = ~1.3 MON, 17 operations = ~2.07 MON"
      ),
    }),
  }
);
