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
  createWalletClient,
  http,
  formatUnits,
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
import { checkSessionKeyBalance, fundSessionKey } from "../execution/sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";

// ============================================================================
// Constants
// ============================================================================

const WMON_ADDRESS = (process.env.MONAD_WMON_ADDRESS || "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701") as Address;
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
      const bundlerClient = config?.configurable?.bundlerClient;

      if (!userAddress || !publicClient || !sessionData || !web3authBridge) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Missing required context for wrap execution",
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

      // Check user's MON balance
      const userBalance = await publicClient.getBalance({ address: getAddress(userAddress) });

      if (userBalance < amountWei) {
        throw createErrorFromCode("INSUFFICIENT_BALANCE", {
          message: `Insufficient MON balance. Required: ${amountFormatted}, Available: ${formatUnits(userBalance, 18)}`,
        });
      }

      // Check session key balance and auto-fund if needed
      const { needsFunding, balance } = await checkSessionKeyBalance(
        sessionData.sessionKeyAddress,
        publicClient
      );

      if (needsFunding) {
        // Auto-fund session key (user approved this during onboarding)
        await fundSessionKey(
          {
            smartAccountAddress: userAddress,
            sessionKeyAddress: sessionData.sessionKeyAddress,
            chainId: sessionData.chainId,
            rpcUrl: MONAD_RPC_URL,
            delegationManager: DELEGATION_MANAGER_ADDRESS,
            smartAccount,
            bundlerClient,
          },
          publicClient,
          web3authBridge
        );
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

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      // Return result
      return `✅ Wrap successful!

• Wrapped: ${amountFormatted} MON → ${amountFormatted} WMON
• Transaction: ${txHash}
• Block: ${receipt.blockNumber}
• Gas Used: ${receipt.gasUsed}
• Status: ${receipt.status}

You now have ${amountFormatted} WMON in your account.`;
    } catch (error) {
      throw createErrorFromCode("EXEC_DELEGATION_REDEEM_REVERT", {
        message: `Failed to wrap: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "wrap",
    description: `Wrap native MON into WMON (Wrapped MON) ERC20 token. FREE operation (only gas).

This tool executes immediately - no quote phase needed.

Use when user wants to:
- Convert MON to WMON
- Wrap MON for DeFi protocols
- Get ERC20 version of MON

Process:
1. Validates you have enough MON
2. Creates ephemeral delegation (1-time use)
3. Executes wrap via WMON.deposit()
4. Returns transaction receipt

Example: "wrap 0.5 MON"`,
    schema: z.object({
      amount: z.string().describe("Amount of MON to wrap (decimal string like '0.5')"),
    }),
  }
);
