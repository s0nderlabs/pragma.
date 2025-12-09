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
  type Transport,
  createWalletClient,
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
import { getMinBalanceForOperation } from "../execution/sessionKeyManager.js";
import { createErrorFromCode } from "../../errors/index.js";
import { resolveName } from "../utils/nameResolution.js";
import {
  DELEGATION_MANAGER_ADDRESS,
  NONCE_ENFORCER_ADDRESS,
  NONCE_ENFORCER_ABI,
  MONAD_CHAIN,
} from "../config.js";
import { emitProgress } from "../progress/emitter.js";

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

// User balance token interface (from Monorail balances API)
interface UserBalanceToken {
  address: string;
  symbol?: string;
  name?: string;
  decimals: number;
  categories?: string[];
}

export const transferTool = tool(
  async ({ token, amount, to }, config) => {
    try {
      const userAddress = config?.configurable?.userAddress as Address;
      const publicClient = config?.configurable?.publicClient as PublicClient;
      const sessionData = config?.configurable?.sessionData as any;
      const web3authBridge = config?.configurable?.web3authBridge as any;
      const allowedTokens = config?.configurable?.allowedTokens as any[];
      const userBalances = config?.configurable?.userBalances as UserBalanceToken[] | undefined;
      let sessionWallet = config?.configurable?.sessionWallet;
      const transport = config?.configurable?.transport as Transport;

      if (!userAddress || !publicClient || !sessionData || !web3authBridge || !allowedTokens) {
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

      // Resolve token: can be symbol (USDC) or address (0x...)
      let tokenAddress: Address;
      let tokenDecimals: number;
      let tokenSymbol: string;
      let isNativeTransfer = false;

      // Check if native MON transfer first
      if (isNativeMON(token)) {
        isNativeTransfer = true;
        tokenSymbol = "MON";
        tokenDecimals = 18;
        tokenAddress = "0x0000000000000000000000000000000000000000" as Address;
      } else if (token.startsWith("0x") && isAddress(token)) {
        // Direct address input - read token info onchain
        tokenAddress = getAddress(token as Address);
        try {
          const [onchainDecimals, onchainSymbol] = await Promise.all([
            publicClient.readContract({
              address: tokenAddress,
              abi: ERC20_ABI,
              functionName: "decimals",
            }),
            publicClient.readContract({
              address: tokenAddress,
              abi: ERC20_ABI,
              functionName: "symbol",
            }),
          ]);
          tokenDecimals = onchainDecimals as number;
          tokenSymbol = onchainSymbol as string;
        } catch {
          throw createErrorFromCode("TOKEN_NOT_FOUND", {
            message: `Could not read token info from address ${token}. Make sure it's a valid ERC20 contract.`,
          });
        }
      } else {
        // Symbol input - check allowedTokens first, then userBalances
        const allowedMatch = allowedTokens.find(
          (t: any) => t.symbol?.toUpperCase() === token.toUpperCase()
        );

        if (allowedMatch) {
          tokenAddress = getAddress(allowedMatch.address);
          tokenDecimals = allowedMatch.decimals || 18;
          tokenSymbol = allowedMatch.symbol;
        } else if (userBalances) {
          // Fallback: check user's balance for unverified tokens they own
          const balanceMatch = userBalances.find(
            (b) => b.symbol?.toUpperCase() === token.toUpperCase()
          );
          if (balanceMatch) {
            tokenAddress = getAddress(balanceMatch.address as Address);
            tokenDecimals = balanceMatch.decimals;
            tokenSymbol = balanceMatch.symbol || token;
          } else {
            throw createErrorFromCode("TOKEN_NOT_FOUND", {
              message: `Token "${token}" not found. Try using the contract address (0x...) instead.`,
            });
          }
        } else {
          throw createErrorFromCode("TOKEN_NOT_FOUND", {
            message: `Token "${token}" not found in verified list. Try using the contract address (0x...) instead.`,
          });
        }
      }

      // Generate tool signature for progress routing (must match frontend's format)
      // Format: transfer:TOKEN-0x1234... (first 8 chars of recipient)
      const toolSignature = `transfer:${token.toUpperCase()}-${to.slice(0, 8)}`;

      // Resolve recipient (supports 0x, .nad, .eth)
      emitProgress(`Resolving recipient...`, "transfer", toolSignature, `Transfer ${tokenSymbol}`);

      let recipient: Address;
      let recipientDisplay: string;

      try {
        const resolved = await resolveName(to, publicClient);
        recipient = resolved.address;
        // Format display: "name.nad (0x1234...5678)" or just "0x1234...5678"
        const shortAddr = `${recipient.slice(0, 6)}...${recipient.slice(-4)}`;
        recipientDisplay = resolved.nameType !== "address"
          ? `${resolved.originalInput} (${shortAddr})`
          : shortAddr;
      } catch (resolveError) {
        throw createErrorFromCode("INVALID_ADDRESS", {
          message: (resolveError as Error).message,
        });
      }

      // Progress with resolved recipient
      emitProgress(`Transferring ${tokenSymbol} to ${recipientDisplay}...`, "transfer", toolSignature);

      // Parse amount
      const amountWei = parseUnits(amount, tokenDecimals);
      const amountFormatted = formatUnits(amountWei, tokenDecimals);

      // Check balance
      if (isNativeTransfer) {
        // Check MON balance
        const monBalance = await publicClient.getBalance({ address: getAddress(userAddress) });
        if (monBalance < amountWei) {
          throw createErrorFromCode("INSUFFICIENT_BALANCE", {
            message: `Insufficient MON balance. Required: ${amountFormatted}, Available: ${formatUnits(monBalance, 18)}`,
          });
        }
      } else {
        // Check ERC20 token balance
        const tokenBalance = await publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [getAddress(userAddress)],
        }) as bigint;

        if (tokenBalance < amountWei) {
          throw createErrorFromCode("INSUFFICIENT_BALANCE", {
            message: `Insufficient ${tokenSymbol} balance. Required: ${amountFormatted}, Available: ${formatUnits(tokenBalance, tokenDecimals)}`,
          });
        }
      }

      // Check session key balance (throw error if insufficient)
      const sessionKeyBalance = await publicClient.getBalance({
        address: sessionData.sessionKeyAddress,
      });

      const minTransferBalance = getMinBalanceForOperation('transfer');
      if (sessionKeyBalance < minTransferBalance) {
        throw createErrorFromCode("SESSION_KEY_LOW_BALANCE", {
          message: `Session key balance too low: ${formatEther(sessionKeyBalance)} MON (minimum for transfer: ${formatEther(minTransferBalance)} MON). Fund session key first using fundSessionKey tool.`,
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

      emitProgress(`Building Transfer Delegation...`, "transfer", toolSignature);

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

      // Get or create session wallet using transport from config
      if (!sessionWallet) {
        sessionWallet = createWalletClient({
          account: privateKeyToAccount(sessionData.sessionKeyPrivateKey),
          chain: MONAD_CHAIN,
          transport: transport!,
        });
      }

      emitProgress(`Executing Transfer Transaction...`, "transfer", toolSignature);

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

      emitProgress(`Waiting for Confirmation...`, "transfer", toolSignature);

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
    description: "Transfer tokens or MON to address. FREE (gas only). Executes immediately. Supports both verified tokens (by symbol) and unverified tokens (by contract address). Call search_tool_docs('transfer') for detailed usage.",
    schema: z.object({
      token: z.string().describe("Token symbol (e.g., 'USDC', 'MON') or contract address (0x...) for unverified tokens"),
      amount: z.string().describe("Amount to transfer (decimal string like '100')"),
      to: z.string().describe("Recipient address (0x...), NAD name (.nad), or ENS name (.eth)"),
    }),
  }
);
