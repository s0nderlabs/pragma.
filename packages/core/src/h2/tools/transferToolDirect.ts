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
  formatEther,
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
  type Delegation,
} from "@metamask/delegation-toolkit";

import {
  createERC20TransferDelegation,
  createNativeTransferDelegation,
  type TransferDelegationResult,
} from "../delegation/transferDelegation.js";
import { MIN_SESSION_KEY_BALANCE } from "../execution/sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";
import {
  MONAD_RPC_URL,
  DELEGATION_MANAGER_ADDRESS,
  NONCE_ENFORCER_ADDRESS,
  NONCE_ENFORCER_ABI,
} from "../config.js";

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
      let sessionWallet = config?.configurable?.sessionWallet;

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

      // Check session key balance (throw error if insufficient)
      const sessionKeyBalance = await publicClient.getBalance({
        address: sessionData.sessionKeyAddress,
      });

      if (sessionKeyBalance < MIN_SESSION_KEY_BALANCE) {
        throw createErrorFromCode("SESSION_KEY_LOW_BALANCE", {
          message: `Session key balance too low: ${formatEther(sessionKeyBalance)} MON (minimum: ${formatEther(MIN_SESSION_KEY_BALANCE)} MON). Fund session key first using fundSessionKey tool.`,
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
      let typedData: any; // EIP-712 typed data for delegation signing

      if (isNativeTransfer) {
        // Native MON transfer: use nativeTokenTransferAmount scope with recipient enforcement
        const result = createNativeTransferDelegation({
          recipient,
          amount: amountWei,
          delegator: getAddress(userAddress),
          sessionKey: getAddress(sessionData.sessionKeyAddress),
          nonce,
          chainId: sessionData.chainId,
          delegationManager: DELEGATION_MANAGER_ADDRESS,
        });

        delegation = result.delegation;
        typedData = result.typedData;
      } else {
        // ERC20 transfer: use functionCall scope with recipient + amount enforcement
        const result = createERC20TransferDelegation({
          tokenAddress,
          recipient,
          amount: amountWei,
          delegator: getAddress(userAddress),
          sessionKey: getAddress(sessionData.sessionKeyAddress),
          nonce,
          chainId: sessionData.chainId,
          delegationManager: DELEGATION_MANAGER_ADDRESS,
          calldata,
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

      // Get or create session wallet
      if (!sessionWallet) {
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

      // Format message for LLM (clean, human-readable)
      const message = `Transfer executed successfully! 🎉

📊 Receipt:
• Sent: ${amountFormatted} ${tokenSymbol}
• To: ${recipient}
• Tx Hash: ${txHash}
• Block: ${receipt.blockNumber}
• Gas Used: ${receipt.gasUsed} units

The transfer has been confirmed on-chain!`;

      // Prepare metadata for activity extraction
      const metadata = {
        txHash,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status === 'success' ? 'success' : 'failed',
        fromToken: tokenSymbol,
        toToken: tokenSymbol,
        fromAmount: amountFormatted,
        toAmount: amountFormatted,
        recipientAddress: recipient,
        delegationMetadata: {
          delegator: userAddress,
          sessionKey: sessionData.sessionKeyAddress,
          nonce: nonce.toString(), // Convert BigInt to string
          delegationCount: 1,
          delegationTypes: ['transfer'],
          expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes in seconds
          feeEnforced: false, // Transfers are FREE (gas only)
        },
      };

      // Return message with embedded metadata (hidden from LLM via HTML comment)
      return `${message}\n\n<!--PRAGMA_METADATA:${JSON.stringify(metadata)}-->`;
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
