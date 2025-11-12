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
import { formatEther } from "viem";

import {
  fundSessionKey,
  SESSION_KEY_FUNDING_AMOUNT,
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
  async (_input, config) => {
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

      // Fund session key
      const result = await fundSessionKey(fundingConfig, publicClient, web3authBridge);

      // Format response
      const fundedAmountFormatted = formatEther(result.fundedAmount);
      const newBalanceFormatted = formatEther(result.newBalance);

      if (result.fundedAmount === 0n) {
        return `**Session Key Funding**

Status: ✅ No funding needed
Current Balance: ${newBalanceFormatted} MON (sufficient)

Session key already has enough balance for operations.`;
      }

      return `**Session Key Funding Complete**

✅ Funded: ${fundedAmountFormatted} MON
New Balance: ${newBalanceFormatted} MON
Transaction: ${result.txHash}

Session key is now funded and ready for operations.
You can proceed with swaps, transfers, and other operations.`;
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
    description: `Fund session key with MON from smart account to cover gas costs. Transfers 1.0 MON.

⚡ **WHEN TO USE:**
Call this tool when checkSessionKeyBalance reports "needsFunding = true" or when
execution tools fail with "Session key balance too low" error.

**Funding Method:**
- Initial funding (0 MON): Uses UserOp via bundler (no gas needed from session key)
- Refill funding (> 0 but < 0.1 MON): Uses ephemeral delegation (session key pays gas from remaining balance)

**Amount:** Always funds 1.0 MON (enough for ~12 swaps)

**Workflow:**
1. checkSessionKeyBalance → if needsFunding = true
2. fundSessionKey → adds 1.0 MON
3. Execute operations → swaps, transfers, etc.

Returns:
- Funded amount (MON)
- New session key balance
- Transaction hash

Example: "fund session key" or auto-called after balance check shows low balance`,
    schema: z.object({}),
  }
);
