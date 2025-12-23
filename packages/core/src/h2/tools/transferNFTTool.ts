/**
 * Transfer NFT Tool
 *
 * Transfer an NFT to another address. Supports both ERC721 and ERC1155.
 * Uses ephemeral delegation execution. NFT transfers are FREE (no protocol fee).
 *
 * This tool will:
 * - Validate contract address and recipient
 * - Resolve NAD/ENS names to addresses
 * - Detect token standard (ERC721 vs ERC1155)
 * - Verify NFT ownership
 * - Create ephemeral delegation with parameter enforcement
 * - Sign delegation with Web3Auth
 * - Submit transaction via session key
 * - Wait for confirmation
 * - Return detailed receipt
 */

import { tool } from "langchain";
import { z } from "zod";
import type { Address, Hex, PublicClient, Transport } from "viem";
import { getAddress, isAddress } from "viem";
import { executeNFTTransfer } from "../execution/executeNFTTransfer.js";
import { createErrorFromCode } from "../../errors/index.js";
import { emitProgress } from "../progress/emitter.js";
import { resolveName } from "../utils/nameResolution.js";

// ============================================================================
// NFT ABIs
// ============================================================================

const ERC721_ABI = [
  {
    name: "ownerOf",
    type: "function",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const ERC1155_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ============================================================================
// Tool Schema
// ============================================================================

const transferNFTSchema = z.object({
  contract: z
    .string()
    .describe(
      "NFT contract address (must be a valid 0x address). " +
        "Example: '0x6919f8b7e312d5d7c374e679de8c728e474e1557'. " +
        "If you only have the collection name, use getTopCollections first to find the contract."
    ),
  tokenId: z
    .string()
    .describe("Token ID to transfer. Example: '42'"),
  recipient: z
    .string()
    .describe("Recipient address or name. Examples: '0x789...', 'alice.nad', 'vitalik.eth'"),
  amount: z
    .number()
    .optional()
    .describe("Amount to transfer (ERC1155 only). Default: 1"),
});

// ============================================================================
// Tool Implementation
// ============================================================================

export const transferNFTTool = tool(
  async (input, config) => {
    try {
      // Get execution context from config
      const userAddress = config?.configurable?.userAddress as Address | undefined;
      const sessionData = config?.configurable?.sessionData as any;
      const publicClient = config?.configurable?.publicClient as PublicClient | undefined;
      const web3authBridge = config?.configurable?.web3authBridge;
      const sessionWallet = config?.configurable?.sessionWallet;
      const transport = config?.configurable?.transport as Transport | undefined;

      // Validate context
      if (!userAddress || !sessionData || !publicClient || !web3authBridge) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Execution context is incomplete. Required: userAddress, sessionData, publicClient, web3authBridge.",
          context: {
            hasUserAddress: !!userAddress,
            hasSessionData: !!sessionData,
            hasPublicClient: !!publicClient,
            hasWeb3authBridge: !!web3authBridge,
          },
        });
      }

      if (!transport) {
        throw createErrorFromCode("CONFIG_MISSING", {
          message: "Transport is required for RPC calls",
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

      const { contract, tokenId, recipient, amount = 1 } = input;
      const toolSignature = `transferNFT:${contract}:${tokenId}`;

      // Validate contract address
      if (!isAddress(contract)) {
        throw createErrorFromCode("INVALID_INPUT", {
          message: `Invalid contract address "${contract}".`,
        });
      }
      const contractAddress = getAddress(contract);

      // Resolve recipient (supports NAD/ENS names)
      emitProgress("Resolving recipient address...", "transferNFT", toolSignature);

      let recipientAddress: Address;
      let resolvedNameDisplay: string | undefined;

      if (isAddress(recipient)) {
        recipientAddress = getAddress(recipient);
      } else {
        // Try to resolve name
        try {
          const resolved = await resolveName(recipient, publicClient);
          recipientAddress = resolved.address;
          resolvedNameDisplay = resolved.originalInput;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw createErrorFromCode("NAME_RESOLUTION_FAILED", {
            message: `Could not resolve "${recipient}" to an address. ${msg}`,
          });
        }
      }

      // Prevent self-transfer
      if (recipientAddress.toLowerCase() === userAddress.toLowerCase()) {
        throw createErrorFromCode("INVALID_INPUT", {
          message: "Cannot transfer NFT to yourself.",
        });
      }

      // Detect token standard by checking ownerOf (ERC721) vs balanceOf (ERC1155)
      emitProgress("Verifying NFT ownership...", "transferNFT", toolSignature);

      let isERC721 = true;
      let nftName = `NFT #${tokenId}`;

      try {
        // Try ERC721 ownerOf
        const owner = await publicClient.readContract({
          address: contractAddress,
          abi: ERC721_ABI,
          functionName: "ownerOf",
          args: [BigInt(tokenId)],
        });

        if ((owner as Address).toLowerCase() !== userAddress.toLowerCase()) {
          throw createErrorFromCode("NFT_NOT_OWNED", {
            message: `You don't own NFT #${tokenId}. Current owner: ${owner}`,
          });
        }
      } catch (err: any) {
        // Check if it's our own error
        if (err.name && err.name.includes("NFT_NOT_OWNED")) {
          throw err;
        }

        // Not ERC721, try ERC1155
        isERC721 = false;
        try {
          const balance = await publicClient.readContract({
            address: contractAddress,
            abi: ERC1155_ABI,
            functionName: "balanceOf",
            args: [userAddress, BigInt(tokenId)],
          });

          if ((balance as bigint) < BigInt(amount)) {
            throw createErrorFromCode("INSUFFICIENT_NFT_BALANCE", {
              message: `Insufficient NFT balance. You have ${balance} but trying to transfer ${amount}.`,
            });
          }
        } catch (e: any) {
          // Check if it's our own error
          if (e.name && e.name.includes("INSUFFICIENT_NFT_BALANCE")) {
            throw e;
          }
          throw createErrorFromCode("INVALID_NFT_CONTRACT", {
            message: `Could not verify NFT ownership. Contract may not be a valid NFT.`,
          });
        }
      }

      // Execute transfer via delegation
      const recipientShort = `${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`;

      const result = await executeNFTTransfer({
        contractAddress,
        tokenId,
        recipientAddress,
        isERC721,
        amount,
        userAddress,
        sessionKeyAddress: sessionData.sessionKeyAddress,
        sessionKeyPrivateKey: sessionData.sessionKeyPrivateKey,
        ownerAddress: sessionData.ownerAddress,
        publicClient,
        web3authBridge,
        transport,
        chainId: sessionData.chainId,
        sessionWallet,
        signature: toolSignature,
        nftName,
      });

      // Format recipient display
      const recipientDisplay = resolvedNameDisplay
        ? `${resolvedNameDisplay} (${recipientShort})`
        : recipientAddress;

      // Format message for LLM
      const message = `**NFT Transfer Successful!**

**NFT:** ${nftName}
**Contract:** \`${contractAddress}\`
**Token ID:** ${tokenId}
${!isERC721 ? `**Amount:** ${amount}\n` : ""}**Recipient:** ${recipientDisplay}
**Status:** ${result.status}
**Block:** ${result.blockNumber.toString()}
**Transaction:** [View on Explorer](https://monadvision.com/tx/${result.txHash})

The NFT has been transferred. It may take a few minutes to appear in the recipient's wallet.`;

      // Prepare metadata for activity extraction
      const metadata = {
        txHash: result.txHash,
        blockNumber: result.blockNumber.toString(),
        gasUsed: result.gasUsed.toString(),
        status: result.status,
        nftName,
        contractAddress,
        tokenId,
        recipient: recipientAddress,
        recipientName: resolvedNameDisplay,
        isERC721,
        amount: !isERC721 ? amount : undefined,
        delegationMetadata: result.delegationMetadata ? {
          delegator: result.delegationMetadata.delegator,
          sessionKey: result.delegationMetadata.sessionKey,
          nonce: result.delegationMetadata.nonce.toString(),
          delegationCount: result.delegationMetadata.delegationCount,
          delegationTypes: result.delegationMetadata.delegationTypes,
          expiresAt: result.delegationMetadata.expiresAt,
          feeEnforced: result.delegationMetadata.feeEnforced,
        } : undefined,
      };

      // Return message with embedded metadata
      return `${message}\n\n<!--PRAGMA_METADATA:${JSON.stringify(metadata)}-->`;

    } catch (error) {
      const err = error as Error;

      // Re-throw our custom errors
      if (err.name && (
        err.name.includes("CONFIG_MISSING") ||
        err.name.includes("SESSION_INCOMPLETE") ||
        err.name.includes("INVALID_INPUT") ||
        err.name.includes("NAME_RESOLUTION_FAILED") ||
        err.name.includes("NFT_NOT_OWNED") ||
        err.name.includes("INSUFFICIENT_NFT_BALANCE") ||
        err.name.includes("INVALID_NFT_CONTRACT") ||
        err.name.includes("SESSION_KEY_LOW_BALANCE")
      )) {
        throw err;
      }

      throw createErrorFromCode("EXECUTION_FAILED", {
        message: `NFT transfer execution failed: ${err.message}`,
        cause: error,
      });
    }
  },
  {
    name: "transferNFT",
    description: "Send NFT to address. FREE (no protocol fee, gas only). Supports 0x addresses, .nad names, .eth names (auto-resolved). Use contract address + tokenId + recipient. ERC721 and ERC1155 supported. Normal mode: confirm with user first. Quick mode: execute without asking.",
    schema: transferNFTSchema,
  }
);
