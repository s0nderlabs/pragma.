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
import { checkSessionKeyBalance, fundSessionKey, SESSION_KEY_FUNDING_AMOUNT } from "../execution/sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";
import { APRIORI_ADDRESS, APRIORI_FEE_RATE } from "../config.js";

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

      // Note: Fee collection temporarily disabled until treasury system is implemented
      // Will be added in future update with multi-delegation treasury transfers
      const stakeAmount = amountWei; // Stake full amount (no fee for now)

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

      return `✅ Stake successful!

• Staked: ${formatUnits(stakeAmount, 18)} MON → aprMON
• aprMON Balance: ${formatUnits(aprMonBalance, 18)}
• Transaction: ${txHash}
• Block: ${receipt.blockNumber}
• Gas Used: ${receipt.gasUsed}

Your MON is now earning staking rewards through aPriori. aprMON appreciates in value over time.

Note: Protocol fees temporarily disabled - you staked the full amount.`;
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
2. Deducts Pragma fee (0.5%)
3. Creates ephemeral delegation (1-time use)
4. Executes stake via aPriori.deposit()
5. Returns transaction receipt with aprMON balance

Fee: 0.5% Pragma protocol fee on input amount

Example: "stake 1 MON" or "stake all my MON"`,
    schema: z.object({
      amount: z.string().describe("Amount of MON to stake (decimal string like '1.0')"),
    }),
  }
);
