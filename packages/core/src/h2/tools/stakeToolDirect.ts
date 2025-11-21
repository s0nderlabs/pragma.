/**
 * Direct Stake Tool (No Quote Phase)
 *
 * Stakes MON → aprMON via aPriori liquid staking protocol in one step.
 *
 * Fee Structure:
 * - Pragma: 0.5% on input (MON being staked)
 * - Fee sent to Pragma treasury
 * - Remaining MON staked into aPriori
 *
 * Example: User stakes 1.0 MON
 * - Pragma fee: 0.005 MON (0.5%)
 * - Staked: 0.995 MON
 * - Received: ~0.995 aprMON (varies by protocol exchange rate)
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
  encodeFunctionData,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createExecution,
  ExecutionMode,
  redeemDelegations,
} from "@metamask/delegation-toolkit";

import { createStakeDelegation } from "../delegation/stakeDelegation.js";
import { MIN_SESSION_KEY_BALANCE } from "../execution/sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";
import { APRIORI_ADDRESS, APRIORI_FEE_RATE } from "../config.js";
import { emitProgress } from "../progress/emitter.js";

// ============================================================================
// Constants
// ============================================================================

const MONAD_RPC_URL = process.env.MONAD_EXECUTION_RPC_URL || "https://testnet.monad.xyz/";
const DELEGATION_MANAGER_ADDRESS = (process.env.DELEGATION_MANAGER_ADDRESS as Address) || "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" as Address;
const NONCE_ENFORCER_ADDRESS = (process.env.NONCE_ENFORCER_ADDRESS as Address) || "0xDE4f2FAC4B3D87A1d9953Ca5FC09FCa7F366254f" as Address;

/** Pragma treasury address for fee collection */
const PRAGMA_TREASURY_ADDRESS = (process.env.PRAGMA_TREASURY_ADDRESS as Address) || "0x0000000000000000000000000000000000000000" as Address; // TODO: Update with real treasury

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

const APRIORI_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "assets", type: "uint256", internalType: "uint256" },
      { name: "receiver", type: "address", internalType: "address" }
    ],
    outputs: [{ name: "shares", type: "uint256", internalType: "uint256" }],
    stateMutability: "payable"
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

// ============================================================================
// Stake Tool Implementation
// ============================================================================

export const stakeTool = tool(
  async ({ amount }, config) => {
    try {
      const userAddress = config?.configurable?.userAddress as Address;
      const publicClient = config?.configurable?.publicClient as PublicClient;
      const sessionData = config?.configurable?.sessionData as any;
      const web3authBridge = config?.configurable?.web3authBridge as any;
      const smartAccount = config?.configurable?.smartAccount;
      const bundlerClient = config?.configurable?.bundlerClient;
      let sessionWallet = config?.configurable?.sessionWallet; // Shared wallet for nonce management

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

      // Check MON balance
      const userBalance = await publicClient.getBalance({ address: getAddress(userAddress) });

      if (userBalance < amountWei) {
        throw createErrorFromCode("INSUFFICIENT_BALANCE", {
          message: `Insufficient MON balance. Required: ${amountFormatted}, Available: ${formatUnits(userBalance, 18)}`,
        });
      }

      // Progress: Staking into aPriori
      emitProgress(`Staking ${amountFormatted} MON into aPriori...`);

      // No Pragma protocol fee on staking (fee structure to be decided)
      const stakeAmount = amountWei; // Stake full amount

      // Check session key balance (throw error if insufficient)
      const sessionKeyBalance = await publicClient.getBalance({
        address: sessionData.sessionKeyAddress,
      });

      if (sessionKeyBalance < MIN_SESSION_KEY_BALANCE) {
        throw createErrorFromCode("SESSION_KEY_LOW_BALANCE", {
          message: `Session key balance too low: ${formatEther(sessionKeyBalance)} MON (minimum: ${formatEther(MIN_SESSION_KEY_BALANCE)} MON). Fund session key first using fundSessionKey tool.`,
        });
      }

      // Fetch delegation nonce from NonceEnforcer
      const nonce = await publicClient.readContract({
        address: NONCE_ENFORCER_ADDRESS,
        abi: NONCE_ENFORCER_ABI,
        functionName: "currentNonce",
        args: [DELEGATION_MANAGER_ADDRESS, userAddress],
      }) as bigint;

      // Build deposit calldata
      // deposit(uint256 assets, address receiver)
      // - assets: Amount of MON being deposited (matches msg.value)
      // - receiver: Address to receive aprMON tokens (user's smart account)
      const depositCalldata = encodeFunctionData({
        abi: APRIORI_ABI,
        functionName: "deposit",
        args: [stakeAmount, getAddress(userAddress)],
      });

      // Create ephemeral delegation for stake
      const { delegation, typedData } = createStakeDelegation({
        aprioriAddress: getAddress(APRIORI_ADDRESS),
        amount: stakeAmount,
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
        value: stakeAmount,
        callData: depositCalldata,
      });

      // Get or create session wallet (prefer shared wallet for proper nonce management)
      if (!sessionWallet) {
        // FALLBACK: Create temporary wallet (backward compatibility)
        sessionWallet = createWalletClient({
          account: privateKeyToAccount(sessionData.sessionKeyPrivateKey),
          chain: {
            id: sessionData.chainId,
            name: "Monad",
            nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
            rpcUrls: { default: { http: [MONAD_RPC_URL] }, public: { http: [MONAD_RPC_URL] } },
          },
          transport: http(MONAD_RPC_URL),
        });
      }

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

      // Get updated aprMON balance to show received amount
      const aprMonBalance = await publicClient.readContract({
        address: getAddress(APRIORI_ADDRESS),
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [getAddress(userAddress)],
      }) as bigint;

      // Format amounts for display
      const stakeAmountFormatted = formatUnits(stakeAmount, 18);
      const aprMonBalanceFormatted = formatUnits(aprMonBalance, 18);

      // Format message for LLM (clean, human-readable)
      const message = `Stake executed successfully! 🎉

📊 Receipt:
• Staked: ${stakeAmountFormatted} MON → aprMON
• aprMON Balance: ${aprMonBalanceFormatted}
• Tx Hash: ${txHash}
• Block: ${receipt.blockNumber}
• Gas Used: ${receipt.gasUsed} units

Your MON is now earning staking rewards through aPriori. aprMON appreciates in value over time.`;

      // Prepare metadata for activity extraction
      const metadata = {
        txHash,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status === 'success' ? 'success' : 'failed',
        fromToken: 'MON',
        toToken: 'aprMON',
        fromAmount: stakeAmountFormatted,
        toAmount: aprMonBalanceFormatted,
        delegationMetadata: {
          delegator: userAddress,
          sessionKey: sessionData.sessionKeyAddress,
          nonce: nonce.toString(), // Convert BigInt to string
          delegationCount: 1,
          delegationTypes: ['stake'],
          expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes in seconds
          feeEnforced: false, // No Pragma fee on staking
        },
      };

      // Return message with embedded metadata (hidden from LLM via HTML comment)
      return `${message}\n\n<!--PRAGMA_METADATA:${JSON.stringify(metadata)}-->`;
    } catch (error) {
      throw createErrorFromCode("EXEC_DELEGATION_REDEEM_REVERT", {
        message: `Failed to stake: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "stake",
    description: `Stake MON into aPriori liquid staking to earn rewards. Receives aprMON tokens.

This tool executes immediately - no quote phase needed.

Use when user wants to:
- Stake MON to earn rewards
- Get aprMON liquid staking tokens
- Participate in aPriori staking
- Earn passive income on MON

Process:
1. Validates you have enough MON
2. Creates ephemeral delegation (1-time use)
3. Executes stake via aPriori.deposit()
4. Returns transaction receipt with aprMON balance

Fee: No Pragma fee (aPriori charges from rewards over time)

Example: "stake 1 MON" or "stake all my MON"`,
    schema: z.object({
      amount: z.string().describe("Amount of MON to stake (decimal string like '1.0')"),
    }),
  }
);
