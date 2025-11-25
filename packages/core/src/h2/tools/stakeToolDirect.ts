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
  type Transport,
  createWalletClient,
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
import { getMinBalanceForOperation } from "../execution/sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";
import {
  APRIORI_ADDRESS,
  DELEGATION_MANAGER_ADDRESS,
  NONCE_ENFORCER_ADDRESS,
  NONCE_ENFORCER_ABI,
  MONAD_CHAIN,
  PROTOCOL_FEES,
  MON_ADDRESS,
  DELEGATION_MANAGER_ABI,
} from "../config.js";
import { emitProgress } from "../progress/emitter.js";
import {
  addPragmaFeeEnforcer,
  calculateProtocolFee,
  requiresFee
} from "../delegation/withFeeEnforcer.js";
import { buildDelegationTypedData } from "../../delegations/typedData.js";

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

      // Check MON balance
      const userBalance = await publicClient.getBalance({ address: getAddress(userAddress) });

      if (userBalance < amountWei) {
        throw createErrorFromCode("INSUFFICIENT_BALANCE", {
          message: `Insufficient MON balance. Required: ${amountFormatted}, Available: ${formatUnits(userBalance, 18)}`,
        });
      }

      // Progress: Staking into aPriori
      emitProgress(`Staking ${amountFormatted} MON into aPriori...`);

      // Calculate protocol fee (0.5% on input)
      const feeAmount = calculateProtocolFee(amountWei, PROTOCOL_FEES.stake);
      const netStakeAmount = amountWei - feeAmount;
      const netStakeAmountFormatted = formatUnits(netStakeAmount, 18);
      const feeAmountFormatted = formatUnits(feeAmount, 18);

      // Check session key balance (throw error if insufficient)
      const sessionKeyBalance = await publicClient.getBalance({
        address: sessionData.sessionKeyAddress,
      });

      const minStakeBalance = getMinBalanceForOperation('stake');
      if (sessionKeyBalance < minStakeBalance) {
        throw createErrorFromCode("SESSION_KEY_LOW_BALANCE", {
          message: `Session key balance too low: ${formatEther(sessionKeyBalance)} MON (minimum for stake: ${formatEther(minStakeBalance)} MON). Fund session key first using fundSessionKey tool.`,
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
      // - assets: Amount of MON being deposited (net amount after fee)
      // - receiver: Address to receive aprMON tokens (user's smart account)
      const depositCalldata = encodeFunctionData({
        abi: APRIORI_ABI,
        functionName: "deposit",
        args: [netStakeAmount, getAddress(userAddress)],
      });

      // Create ephemeral delegation for stake
      const { delegation, typedData } = createStakeDelegation({
        aprioriAddress: getAddress(APRIORI_ADDRESS),
        amount: netStakeAmount,  // Net amount (after fee)
        delegator: getAddress(userAddress),
        sessionKey: getAddress(sessionData.sessionKeyAddress),
        nonce,
        chainId: sessionData.chainId,
        delegationManager: DELEGATION_MANAGER_ADDRESS,
      });

      // Add fee enforcer if protocol fees are enabled
      let feeEnforcedStake = null;
      let feeAllowanceDelegation = null;

      if (requiresFee("stake", PROTOCOL_FEES) && feeAmount > 0n) {
        feeEnforcedStake = addPragmaFeeEnforcer({ delegation, typedData }, {
          feeAmount,
          swapAmount: amountWei,  // Original input amount (for percentage validation)
          tokenAddress: MON_ADDRESS,
          isNative: true,
          sessionKey: getAddress(sessionData.sessionKeyAddress),
        });

        // CRITICAL: Rebuild typedData to include fee enforcer caveat
        feeEnforcedStake.mainDelegation.typedData = buildDelegationTypedData(
          feeEnforcedStake.mainDelegation.delegation,
          sessionData.chainId,
          DELEGATION_MANAGER_ADDRESS
        );
      }

      // Use fee-enforced delegation if available
      const finalDelegation = feeEnforcedStake?.mainDelegation.delegation || delegation;
      const finalTypedData = feeEnforcedStake?.mainDelegation.typedData || typedData;

      // Sign delegation (with fee enforcer if added)
      const { signature } = await web3authBridge.signTypedData({
        typedDataJson: JSON.stringify(finalTypedData),
        from: sessionData.ownerAddress,
      });
      finalDelegation.signature = signature;

      // If fee enforcer added, get hash and create fee allowance
      if (feeEnforcedStake) {
        // Get delegation hash
        const stakeDelegationHash = await publicClient.readContract({
          address: DELEGATION_MANAGER_ADDRESS,
          abi: DELEGATION_MANAGER_ABI,
          functionName: "getDelegationHash",
          args: [finalDelegation as any],
        });

        // Create fee allowance delegation
        feeAllowanceDelegation = feeEnforcedStake.createFeeAllowanceDelegation(stakeDelegationHash);

        // Sign fee allowance delegation
        const feeAllowanceTypedData = buildDelegationTypedData(
          feeAllowanceDelegation,
          sessionData.chainId,
          DELEGATION_MANAGER_ADDRESS
        );

        const feeSignatureResult = await web3authBridge.signTypedData({
          typedDataJson: JSON.stringify(feeAllowanceTypedData),
          from: sessionData.ownerAddress,
        });
        feeAllowanceDelegation.signature = feeSignatureResult.signature;

        // Update stake delegation's caveat args (no re-signing needed!)
        feeEnforcedStake.updateMainDelegationArgs(feeAllowanceDelegation);
      }

      // Create execution
      const execution = createExecution({
        target: getAddress(APRIORI_ADDRESS),
        value: netStakeAmount,  // Net amount (after fee)
        callData: depositCalldata,
      });

      // Get or create session wallet using transport from config
      if (!sessionWallet) {
        sessionWallet = createWalletClient({
          account: privateKeyToAccount(sessionData.sessionKeyPrivateKey),
          chain: MONAD_CHAIN,
          transport: transport!,
        });
      }

      // Execute
      const txHash = await redeemDelegations(
        sessionWallet,
        publicClient,
        DELEGATION_MANAGER_ADDRESS,
        [{
          permissionContext: [finalDelegation],  // Use final delegation (with updated args)
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
      const aprMonBalanceFormatted = formatUnits(aprMonBalance, 18);

      // Format message for LLM (clean, human-readable)
      const message = `Stake executed successfully! 🎉

📊 Receipt:
• Input: ${amountFormatted} MON
• Pragma Fee: ${feeAmountFormatted} MON (0.5%)
• Staked: ${netStakeAmountFormatted} MON → aprMON
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
        fromAmount: amountFormatted,
        toAmount: aprMonBalanceFormatted,
        pragmaFee: feeAmountFormatted,  // NEW: Show fee in metadata
        netStaked: netStakeAmountFormatted,  // NEW: Show net staked
        delegationMetadata: {
          delegator: userAddress,
          sessionKey: sessionData.sessionKeyAddress,
          nonce: nonce.toString(), // Convert BigInt to string
          delegationCount: feeAllowanceDelegation ? 2 : 1,  // Main + fee allowance
          delegationTypes: ['stake'],
          expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes in seconds
          feeEnforced: !!feeEnforcedStake,  // Dynamic flag
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
2. Deducts 0.5% Pragma protocol fee
3. Creates ephemeral delegation (1-time use)
4. Executes stake via aPriori.deposit() with net amount
5. Returns transaction receipt with aprMON balance

Fee: 0.5% on input amount (deducted before staking)
Example: Stake 1.0 MON → 0.005 MON fee, 0.995 MON staked

Example: "stake 1 MON" or "stake all my MON"`,
    schema: z.object({
      amount: z.string().describe("Amount of MON to stake (decimal string like '1.0')"),
    }),
  }
);
