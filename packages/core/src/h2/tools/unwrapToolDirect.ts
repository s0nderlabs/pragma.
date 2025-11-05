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
  createWalletClient,
  http,
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
import { checkSessionKeyBalance, fundSessionKey, SESSION_KEY_FUNDING_AMOUNT } from "../execution/sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";

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

      const amountWei = parseUnits(amount, 18);
      const amountFormatted = formatUnits(amountWei, 18);

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

      return `✅ Unwrap successful!

• Unwrapped: ${amountFormatted} WMON → ${amountFormatted} MON
• Transaction: ${txHash}
• Block: ${receipt.blockNumber}
• Gas Used: ${receipt.gasUsed}

You now have ${amountFormatted} MON back.`;
    } catch (error) {
      throw createErrorFromCode("EXEC_DELEGATION_REDEEM_REVERT", {
        message: `Failed to unwrap: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "unwrap",
    description: `Unwrap WMON back to native MON. FREE operation (only gas).

Executes immediately - no quote phase needed.

Use when user wants to:
- Convert WMON back to MON
- Unwrap WMON tokens
- Get native MON from wrapped version

Example: "unwrap 1.0 WMON"`,
    schema: z.object({
      amount: z.string().describe("Amount of WMON to unwrap (decimal string like '1.0')"),
    }),
  }
);
