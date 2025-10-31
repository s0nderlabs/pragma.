/**
 * Direct Transfer Tool (No Quote Phase)
 *
 * Transfers ERC20 tokens OR native MON in one step.
 * Supports both token transfers and native currency transfers.
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
  isAddress,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createExecution,
  ExecutionMode,
  redeemDelegations,
  createDelegation,
  getDeleGatorEnvironment,
  type Delegation,
  type Caveats,
} from "@metamask/delegation-toolkit";

import { createEphemeralDelegation } from "../delegation/ephemeral.js";
import { checkSessionKeyBalance } from "../execution/sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";
import { buildDelegationTypedData } from "../../delegations/typedData.js";
import { ZERO_SALT } from "../../delegations/hybrid.js";

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

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

// Helper to detect if token is native MON
const isNativeMON = (tokenSymbol: string): boolean => {
  return tokenSymbol.toUpperCase() === "MON";
};

export const transferTool = tool(
  async ({ tokenSymbol, amount, recipientAddress }, config) => {
    try {
      const userAddress = config?.configurable?.userAddress as Address;
      const publicClient = config?.configurable?.publicClient as PublicClient;
      const sessionData = config?.configurable?.sessionData as any;
      const web3authBridge = config?.configurable?.web3authBridge as any;
      const allowedTokens = config?.configurable?.allowedTokens as any[];

      if (!userAddress || !publicClient || !sessionData || !web3authBridge || !allowedTokens) {
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

      // Validate recipient address
      if (!isAddress(recipientAddress)) {
        throw createErrorFromCode("INVALID_ADDRESS", {
          message: `Invalid recipient address: ${recipientAddress}`,
        });
      }

      const recipient = getAddress(recipientAddress);
      const isNativeTransfer = isNativeMON(tokenSymbol);

      let amountWei: bigint;
      let amountFormatted: string;
      let tokenAddress: Address;
      let decimals: number;

      // Zero address represents native token (MON)
      const NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

      if (isNativeTransfer) {
        // Native MON transfer
        decimals = 18;
        amountWei = parseUnits(amount, decimals);
        amountFormatted = formatUnits(amountWei, decimals);

        // Check MON balance
        const monBalance = await publicClient.getBalance({ address: getAddress(userAddress) });

        if (monBalance < amountWei) {
          throw createErrorFromCode("INSUFFICIENT_BALANCE", {
            message: `Insufficient MON balance. Required: ${amountFormatted}, Available: ${formatUnits(monBalance, decimals)}`,
          });
        }

        // Use zero address for native token representation
        tokenAddress = NATIVE_TOKEN_ADDRESS;
      } else {
        // ERC20 token transfer
        // Find token in allowed list
        const token = allowedTokens.find(
          (t: any) => t.symbol.toUpperCase() === tokenSymbol.toUpperCase()
        );

        if (!token) {
          throw createErrorFromCode("TOKEN_NOT_FOUND", {
            message: `Token ${tokenSymbol} not found in allowed list`,
          });
        }

        tokenAddress = getAddress(token.address);
        decimals = token.decimals || 18;

        amountWei = parseUnits(amount, decimals);
        amountFormatted = formatUnits(amountWei, decimals);

        // Check token balance
        const tokenBalance = await publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [getAddress(userAddress)],
        }) as bigint;

        if (tokenBalance < amountWei) {
          throw createErrorFromCode("INSUFFICIENT_BALANCE", {
            message: `Insufficient ${tokenSymbol} balance. Required: ${amountFormatted}, Available: ${formatUnits(tokenBalance, decimals)}`,
          });
        }
      }

      // Check session key balance
      const { needsFunding, balance } = await checkSessionKeyBalance(
        sessionData.sessionKeyAddress,
        publicClient
      );

      if (needsFunding) {
        throw createErrorFromCode("SESSION_KEY_LOW_BALANCE", {
          message: `Session key balance too low: ${formatUnits(balance, 18)} MON`,
        });
      }

      // Fetch delegation nonce from NonceEnforcer (H1 pattern)
      const nonce = await publicClient.readContract({
        address: NONCE_ENFORCER_ADDRESS,
        abi: NONCE_ENFORCER_ABI,
        functionName: "currentNonce",
        args: [DELEGATION_MANAGER_ADDRESS, userAddress],
      }) as bigint;

      // Build calldata
      let calldata: Hex;
      let value: bigint;
      let target: Address;

      if (isNativeTransfer) {
        // Native transfer: send MON directly with value
        calldata = "0x" as Hex;
        value = amountWei;
        target = recipient;
      } else {
        // ERC20 transfer: call transfer(address,uint256)
        calldata = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [recipient, amountWei],
        });
        value = 0n;
        target = tokenAddress;
      }

      // Create delegation (conditional based on transfer type)
      let delegation: Delegation;
      let typedData: ReturnType<typeof buildDelegationTypedData>;

      if (isNativeTransfer) {
        // Native MON transfer: use nativeTokenTransferAmount scope (H1 pattern)
        const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 minutes
        const environment = getDeleGatorEnvironment(sessionData.chainId);

        const transferScope = {
          type: "nativeTokenTransferAmount" as const,
          maxAmount: amountWei,
        };

        const transferCaveats: Caveats = [
          {
            type: "timestamp" as const,
            afterThreshold: 0,
            beforeThreshold: expiresAt,
          },
          {
            type: "nonce" as const,
            nonce: toHex(nonce),
          },
          {
            type: "limitedCalls" as const,
            limit: 1,
          },
        ] as unknown as Caveats;

        delegation = createDelegation({
          environment,
          scope: transferScope,
          from: getAddress(userAddress) as Hex,
          to: getAddress(sessionData.sessionKeyAddress) as Hex,
          caveats: transferCaveats,
          salt: ZERO_SALT,
        });

        typedData = buildDelegationTypedData(delegation, sessionData.chainId, DELEGATION_MANAGER_ADDRESS);
      } else {
        // ERC20 transfer: use functionCall scope via createEphemeralDelegation
        const result = createEphemeralDelegation({
          quote: {
            quoteId: `transfer-${Date.now()}`,
            aggregator: target,
            transactionData: calldata,
            transactionValue: value,
            rawInput: amountWei,
            rawOutput: amountWei,
            rawMinOutput: amountWei,
          },
          delegator: getAddress(userAddress),
          sessionKey: getAddress(sessionData.sessionKeyAddress),
          nonce,
          chainId: sessionData.chainId,
          delegationManager: DELEGATION_MANAGER_ADDRESS,
          fromToken: tokenAddress,
          toToken: tokenAddress,
          nativeTokenAddress: NATIVE_TOKEN_ADDRESS,
          currentAllowance: 0n, // Transfers don't require approval
          requiredAmount: 0n,
        });
        delegation = result.delegation;
        typedData = result.typedData;
      }

      // Sign delegation
      const { signature } = await web3authBridge.signTypedData({
        typedDataJson: JSON.stringify(typedData),
        from: sessionData.ownerAddress,
      });
      delegation.signature = signature;

      // Create execution
      const execution = createExecution({
        target,
        value,
        callData: calldata,
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

      return `✅ Transfer successful!

• Sent: ${amountFormatted} ${tokenSymbol}
• To: ${recipient}
• Transaction: ${txHash}
• Block: ${receipt.blockNumber}
• Gas Used: ${receipt.gasUsed}

Transfer complete!`;
    } catch (error) {
      throw createErrorFromCode("EXEC_DELEGATION_REDEEM_REVERT", {
        message: `Failed to transfer: ${(error as Error).message}`,
        cause: error,
      });
    }
  },
  {
    name: "transfer",
    description: `Transfer ERC20 tokens or native MON to another address. FREE operation (only gas).

Executes immediately - no quote phase needed.

Supports:
- ERC20 token transfers (e.g., USDC, DAK, WMON)
- Native MON transfers (use symbol "MON")

Use when user wants to:
- Send tokens to someone
- Transfer MON to address
- Move tokens between accounts

Examples:
- "send 100 USDC to 0x..."
- "transfer 0.5 MON to 0x..."
- "send 50 DAK to 0x..."`,
    schema: z.object({
      tokenSymbol: z.string().describe("Token symbol to transfer (e.g., 'USDC', 'MON', 'DAK')"),
      amount: z.string().describe("Amount to transfer (decimal string like '100')"),
      recipientAddress: z.string().describe("Recipient address (0x...)"),
    }),
  }
);
