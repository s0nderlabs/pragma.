/**
 * H2 Delegation Utilities
 *
 * Exports all delegation-related utilities for creating ephemeral delegations
 * with parameter enforcement.
 */

// ============================================================================
// Core Delegation Builders
// ============================================================================

export {
  createEphemeralDelegation,
  type EphemeralDelegationContext,
  type EphemeralDelegationResult,
} from "./ephemeral.js";

export {
  createApproveDelegation,
  type ApproveDelegationContext,
  type ApproveDelegationResult,
} from "./approveDelegation.js";

export {
  createSwapDelegation,
  type SwapDelegationContext,
  type SwapDelegationResult,
} from "./swapDelegation.js";

export {
  createWrapDelegation,
  type WrapDelegationContext,
  type WrapDelegationResult,
} from "./wrapDelegation.js";

export {
  createUnwrapDelegation,
  type UnwrapDelegationContext,
  type UnwrapDelegationResult,
} from "./unwrapDelegation.js";

export {
  createERC20TransferDelegation,
  createNativeTransferDelegation,
  type ERC20TransferDelegationContext,
  type NativeTransferDelegationContext,
  type TransferDelegationResult,
} from "./transferDelegation.js";

export {
  createNFTBuyDelegation,
  type NFTBuyDelegationContext,
  type NFTBuyDelegationResult,
} from "./nftBuyDelegation.js";

export {
  createNFTTransferDelegation,
  type NFTTransferDelegationContext,
  type NFTTransferDelegationResult,
} from "./nftTransferDelegation.js";

export {
  createNFTApprovalDelegation,
  type NFTApprovalDelegationContext,
  type NFTApprovalDelegationResult,
} from "./nftApprovalDelegation.js";

// ============================================================================
// Calldata Enforcement Utilities
// ============================================================================

export {
  buildApproveEnforcement,
  buildSwapEnforcement,
  buildERC20TransferEnforcement,
  buildNativeTransferEnforcement,
  buildSetApprovalForAllEnforcement,
  validateAddress,
  validateAmount,
  validateBuilderConfig,
  type AllowedCalldataBuilderConfig,
} from "./calldataEnforcement.js";

// ============================================================================
// Byte Offset Constants
// ============================================================================

export {
  ERC20_APPROVE_OFFSETS,
  MONORAIL_AGGREGATE_OFFSETS,
  ERC20_TRANSFER_OFFSETS,
  NATIVE_TRANSFER_OFFSETS,
  ERC721_SETAPPROVALFORALL_OFFSETS,
  getMonorailOffset,
  getERC20Offset,
  getNativeOffset,
  validateOffset,
  type MonorailAggregateOffset,
  type ERC20TransferOffset,
  type NativeTransferOffset,
  type ERC721SetApprovalForAllOffset,
} from "./offsets.js";
