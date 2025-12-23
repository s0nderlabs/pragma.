/**
 * Direct Wrap Tool (No Quote Phase)
 *
 * Wraps MON → WMON in one step:
 * 1. Validate balance inline
 * 2. Create ephemeral delegation
 * 3. Execute immediately
 * 4. Return transaction receipt
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
  getContract,
  encodeFunctionData,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createExecution,
  ExecutionMode,
  redeemDelegations,
} from "@metamask/delegation-toolkit";

import { createWrapDelegation } from "../delegation/wrapDelegation.js";
import { getMinBalanceForOperation } from "../execution/sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";
import { createSyncTransport } from "../execution/syncTransport.js";
import { waitForReceiptSync } from "../execution/syncReceipt.js";
import {
  WMON_ADDRESS,
  DELEGATION_MANAGER_ADDRESS,
  NONCE_ENFORCER_ADDRESS,
  NONCE_ENFORCER_ABI,
  MONAD_CHAIN,
} from "../config.js";
import { emitProgress } from "../progress/emitter.js";

const WRAPPED_NATIVE_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

// ============================================================================
// Wrap Tool Implementation
// ============================================================================

export const wrapTool = tool(
  async ({ amount }, config) => {
    try {
      // Get context from config
      const userAddress = config?.configurable?.userAddress as Address;
      const publicClient = config?.configurable?.publicClient as PublicClient;
      const sessionData = config?.configurable?.sessionData as any;
      const web3authBridge = config?.configurable?.web3authBridge as any;
      const smartAccount = config?.configurable?.smartAccount;
      let sessionWallet = config?.configurable?.sessionWallet;
      const bundlerClient = config?.configurable?.bundlerClient;
      const transport = config?.configurable?.transport as Transport;

      if (!userAddress || !publicClient || !sessionData || !web3authBridge) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Missing required context for wrap execution",
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

      // Parse amount
      const amountWei = parseUnits(amount, 18);
      const amountFormatted = formatUnits(amountWei, 18);

      // Generate tool signature for progress routing
      const toolSignature = `wrap:${Date.now()}`;

      // Initial progress
      emitProgress(`Wrapping ${amountFormatted} MON → WMON...`, "wrap", toolSignature, `Wrap ${amountFormatted} MON`);

      // Check user's MON balance
      const userBalance = await publicClient.getBalance({ address: getAddress(userAddress) });

      if (userBalance < amountWei) {
        throw createErrorFromCode("INSUFFICIENT_BALANCE", {
          message: `Insufficient MON balance. Required: ${amountFormatted}, Available: ${formatUnits(userBalance, 18)}`,
        });
      }

      // Check session key balance (throw error if insufficient)
      const sessionKeyBalance = await publicClient.getBalance({
        address: sessionData.sessionKeyAddress,
      });

      const minWrapBalance = getMinBalanceForOperation('wrap');
      if (sessionKeyBalance < minWrapBalance) {
        throw createErrorFromCode("SESSION_KEY_LOW_BALANCE", {
          message: `Session key balance too low: ${formatEther(sessionKeyBalance)} MON (minimum for wrap: ${formatEther(minWrapBalance)} MON). Fund session key first using fundSessionKey tool.`,
        });
      }

      // Fetch delegation nonce from NonceEnforcer (H1 pattern)
      const nonce = await publicClient.readContract({
        address: NONCE_ENFORCER_ADDRESS,
        abi: NONCE_ENFORCER_ABI,
        functionName: "currentNonce",
        args: [DELEGATION_MANAGER_ADDRESS, userAddress],
      }) as bigint;

      // Build deposit calldata
      const depositCalldata = encodeFunctionData({
        abi: WRAPPED_NATIVE_ABI,
        functionName: "deposit",
        args: [],
      });

      emitProgress(`Building Wrap Delegation...`, "wrap", toolSignature);

      // Create ephemeral delegation for wrap
      // deposit() has no parameters → no enforcement needed
      const { delegation, typedData } = createWrapDelegation({
        wmonAddress: getAddress(WMON_ADDRESS),
        amount: amountWei,
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
        target: getAddress(WMON_ADDRESS),
        value: amountWei,
        callData: depositCalldata,
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

      emitProgress(`Executing Wrap Transaction...`, "wrap", toolSignature);

      // Execute transaction
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

      emitProgress(`Waiting for Confirmation...`, "wrap", toolSignature);

      // Wait for confirmation (EIP-7966 optimized)
      const receipt = await waitForReceiptSync(publicClient, txHash);

      // Format message for LLM (clean, human-readable)
      const message = `Wrap executed successfully! 🎉

📊 Receipt:
• Wrapped: ${amountFormatted} MON
• Received: ${amountFormatted} WMON
• Transaction: [View on Explorer](https://monadvision.com/tx/${txHash})
• Block: ${receipt.blockNumber}
• Gas Used: ${receipt.gasUsed} units

Your MON has been wrapped into WMON!`;

      // Prepare metadata for activity extraction
      const metadata = {
        txHash,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status === 'success' ? 'success' : 'failed',
        fromToken: 'MON',
        toToken: 'WMON',
        fromAmount: amountFormatted,
        toAmount: amountFormatted,
        delegationMetadata: {
          delegator: userAddress,
          sessionKey: sessionData.sessionKeyAddress,
          nonce: nonce.toString(), // Convert BigInt to string
          delegationCount: 1,
          delegationTypes: ['wrap'],
          expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes in seconds
          feeEnforced: false, // Wraps are FREE (gas only)
        },
      };

      // Return message with embedded metadata (hidden from LLM via HTML comment)
      return `${message}\n\n<!--PRAGMA_METADATA:${JSON.stringify(metadata)}-->`;
    } catch (error) {
      throw createErrorFromCode("EXEC_DELEGATION_REDEEM_REVERT", {
        message: `Failed to wrap: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "wrap",
    description: "Wrap MON → WMON (1:1 exchange). FREE (no protocol fee, gas only). WMON is ERC20 version of native MON, required by some protocols. Normal mode: confirm with user first. Quick mode: execute without asking. IMPORTANT: For 'all', 'half', 'max', call getBalance first.",
    schema: z.object({
      amount: z.string().describe("Amount of MON to wrap (decimal string like '0.5')"),
    }),
  }
);
