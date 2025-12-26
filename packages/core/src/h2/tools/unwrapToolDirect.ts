/**
 * Direct Unwrap Tool (No Quote Phase)
 *
 * Unwraps WMON → MON in one step.
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

import { createUnwrapDelegation } from "../delegation/unwrapDelegation.js";
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
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: [],
  },
] as const;

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const unwrapTool = tool(
  async ({ amount }, config) => {
    try {
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

      const amountWei = parseUnits(amount, 18);
      const amountFormatted = formatUnits(amountWei, 18);

      // Generate tool signature for progress routing
      // Must match generateSignatureFromInput() in browserAgentRunner.ts
      const toolSignature = `unwrap:${amount}`;

      // Initial progress
      emitProgress(`Unwrapping ${amountFormatted} WMON → MON...`, "unwrap", toolSignature, `Unwrap ${amountFormatted} WMON`);

      // Check WMON balance
      const wmonBalance = await publicClient.readContract({
        address: getAddress(WMON_ADDRESS),
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [getAddress(userAddress)],
      }) as bigint;

      if (wmonBalance < amountWei) {
        throw createErrorFromCode("INSUFFICIENT_BALANCE", {
          message: `Insufficient WMON balance. Required: ${amountFormatted}, Available: ${formatUnits(wmonBalance, 18)}`,
        });
      }

      // Check session key balance (throw error if insufficient)
      const sessionKeyBalance = await publicClient.getBalance({
        address: sessionData.sessionKeyAddress,
      });

      const minUnwrapBalance = getMinBalanceForOperation('unwrap');
      if (sessionKeyBalance < minUnwrapBalance) {
        throw createErrorFromCode("SESSION_KEY_LOW_BALANCE", {
          message: `Session key balance too low: ${formatEther(sessionKeyBalance)} MON (minimum for unwrap: ${formatEther(minUnwrapBalance)} MON). Fund session key first using fundSessionKey tool.`,
        });
      }

      // Fetch delegation nonce from NonceEnforcer (H1 pattern)
      const nonce = await publicClient.readContract({
        address: NONCE_ENFORCER_ADDRESS,
        abi: NONCE_ENFORCER_ABI,
        functionName: "currentNonce",
        args: [DELEGATION_MANAGER_ADDRESS, userAddress],
      }) as bigint;

      // Build withdraw calldata
      const withdrawCalldata = encodeFunctionData({
        abi: WRAPPED_NATIVE_ABI,
        functionName: "withdraw",
        args: [amountWei],
      });

      emitProgress(`Building Unwrap Delegation...`, "unwrap", toolSignature);

      // Create ephemeral delegation for unwrap
      // withdraw(uint256) has amount at offset 4 (not enforceable with our offset 132 system)
      const { delegation, typedData } = createUnwrapDelegation({
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
        value: 0n,
        callData: withdrawCalldata,
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

      emitProgress(`Executing Unwrap Transaction...`, "unwrap", toolSignature);

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

      emitProgress(`Waiting for Confirmation...`, "unwrap", toolSignature);

      // Wait for confirmation (EIP-7966 optimized)
      const receipt = await waitForReceiptSync(publicClient, txHash);

      // Format message for LLM (clean, human-readable)
      const message = `Unwrap executed successfully! 🎉

📊 Receipt:
• Unwrapped: ${amountFormatted} WMON
• Received: ${amountFormatted} MON
• Transaction: [View on Explorer](https://monadvision.com/tx/${txHash})
• Block: ${receipt.blockNumber}
• Gas Used: ${receipt.gasUsed} units

Your WMON has been unwrapped back to MON!`;

      // Prepare metadata for activity extraction
      const metadata = {
        txHash,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status === 'success' ? 'success' : 'failed',
        fromToken: 'WMON',
        toToken: 'MON',
        fromAmount: amountFormatted,
        toAmount: amountFormatted,
        delegationMetadata: {
          delegator: userAddress,
          sessionKey: sessionData.sessionKeyAddress,
          nonce: nonce.toString(), // Convert BigInt to string
          delegationCount: 1,
          delegationTypes: ['unwrap'],
          expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes in seconds
          feeEnforced: false, // Unwraps are FREE (gas only)
        },
      };

      // Return message with embedded metadata (hidden from LLM via HTML comment)
      return `${message}\n\n<!--PRAGMA_METADATA:${JSON.stringify(metadata)}-->`;
    } catch (error) {
      throw createErrorFromCode("EXEC_DELEGATION_REDEEM_REVERT", {
        message: `Failed to unwrap: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "unwrap",
    description: "Unwrap WMON → MON (1:1 exchange). FREE (no protocol fee, gas only). Converts ERC20 WMON back to native MON. Normal mode: confirm with user first. Quick mode: execute without asking. IMPORTANT: For 'all', 'half', 'max', call getBalance first.",
    schema: z.object({
      amount: z.string().describe("Amount of WMON to unwrap (decimal string like '1.0')"),
    }),
  }
);
