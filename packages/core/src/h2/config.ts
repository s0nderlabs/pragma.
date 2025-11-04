/**
 * H2 Configuration Constants
 *
 * Centralized configuration for H2 execution, including:
 * - Contract addresses (DelegationManager, enforcers)
 * - RPC endpoints
 * - Network configuration
 *
 * All addresses use deterministic CREATE2 deployment (same across all networks).
 * See: packages/contracts/lib/delegation-framework/documents/Deployments.md
 */

import type { Address } from "viem";

// ============================================================================
// Network Configuration
// ============================================================================

/**
 * Monad RPC URL
 * @default https://testnet.monad.xyz/
 */
export const MONAD_RPC_URL =
  (process.env.MONAD_EXECUTION_RPC_URL as string) || "https://testnet.monad.xyz/";

/**
 * Monad Chain ID
 * @default 10143 (Monad testnet)
 */
export const MONAD_CHAIN_ID = 10143;

// ============================================================================
// Core Contract Addresses
// ============================================================================

/**
 * DelegationManager contract address
 * Manages all delegations and redemptions
 *
 * @address 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
 * @version v1.3.0
 */
export const DELEGATION_MANAGER_ADDRESS =
  (process.env.DELEGATION_MANAGER_ADDRESS as Address) ||
  ("0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" as Address);

/**
 * Native MON token address (0x0 sentinel)
 * Used for native token operations
 *
 * @address 0x0000000000000000000000000000000000000000
 */
export const MON_ADDRESS =
  (process.env.MON_ADDRESS as Address) ||
  ("0x0000000000000000000000000000000000000000" as Address);

// ============================================================================
// Caveat Enforcer Addresses
// ============================================================================

/**
 * NonceEnforcer - Enforces delegation nonce uniqueness
 *
 * Used in all delegations to prevent replay attacks.
 * Each delegation must use the next sequential nonce.
 *
 * @address 0xDE4f2FAC4B3D87A1d9953Ca5FC09FCa7F366254f
 * @version v1.3.0
 */
export const NONCE_ENFORCER_ADDRESS =
  (process.env.NONCE_ENFORCER_ADDRESS as Address) ||
  ("0xDE4f2FAC4B3D87A1d9953Ca5FC09FCa7F366254f" as Address);

/**
 * TimestampEnforcer - Enforces time-based expiry
 *
 * Used in all delegations to set expiration times.
 * Ephemeral delegations typically expire after 5 minutes.
 *
 * @address 0x1046bb45C8d673d4ea75321280DB34899413c069
 * @version v1.3.0
 */
export const TIMESTAMP_ENFORCER_ADDRESS =
  (process.env.TIMESTAMP_ENFORCER_ADDRESS as Address) ||
  ("0x1046bb45C8d673d4ea75321280DB34899413c069" as Address);

/**
 * LimitedCallsEnforcer - Enforces max call count
 *
 * Used in ephemeral delegations to limit number of executions.
 * Swap delegations typically allow 1-3 calls (depending on ERC20 approve needs).
 *
 * @address 0x04658B29F6b82ed55274221a06Fc97D318E25416
 * @version v1.3.0
 */
export const LIMITED_CALLS_ENFORCER_ADDRESS =
  (process.env.LIMITED_CALLS_ENFORCER_ADDRESS as Address) ||
  ("0x04658B29F6b82ed55274221a06Fc97D318E25416" as Address);

/**
 * AllowedMethodsEnforcer - Enforces allowed function selectors
 *
 * Used in functionCall scopes to whitelist specific functions.
 * Prevents session key from calling arbitrary functions.
 *
 * @address 0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5
 * @version v1.3.0
 */
export const ALLOWED_METHODS_ENFORCER_ADDRESS =
  (process.env.ALLOWED_METHODS_ENFORCER_ADDRESS as Address) ||
  ("0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5" as Address);

/**
 * AllowedCalldataEnforcer - Enforces specific calldata parameters
 *
 * ⚠️ CRITICAL FOR SECURITY
 *
 * Validates specific byte ranges in calldata to prevent parameter manipulation.
 * Used for:
 * - Swap destination enforcement (offset 132 in Monorail aggregate())
 * - ERC20 transfer recipient + amount enforcement (offsets 4, 36)
 *
 * NOTE: Cannot be used for native transfers (they have empty calldata).
 * Use ExactExecutionEnforcer for native transfer recipient enforcement instead.
 *
 * See: packages/core/src/h2/delegation/offsets.ts for byte offset constants
 *
 * @address 0xc2b0d624c1c4319760C96503BA27C347F3260f55
 * @version v1.3.0
 */
export const ALLOWED_CALLDATA_ENFORCER_ADDRESS =
  (process.env.ALLOWED_CALLDATA_ENFORCER_ADDRESS as Address) ||
  ("0xc2b0d624c1c4319760C96503BA27C347F3260f55" as Address);

/**
 * NativeTokenTransferAmountEnforcer - Enforces native transfer amount limits
 *
 * Used in nativeTokenTransferAmount scopes to limit MON transfer amounts.
 * Prevents session key from draining account with large transfers.
 *
 * NOTE: This enforcer validates AMOUNT ONLY, not recipient. While recipient substitution
 * is theoretically possible, the amount cap provides critical protection against unlimited
 * fund drain. This is a pragmatic security trade-off.
 *
 * @address 0xF71af580b9c3078fbc2BBF16FbB8EEd82b330320
 * @version v1.3.0
 */
export const NATIVE_TOKEN_TRANSFER_AMOUNT_ENFORCER_ADDRESS =
  (process.env.NATIVE_TOKEN_TRANSFER_AMOUNT_ENFORCER_ADDRESS as Address) ||
  ("0xF71af580b9c3078fbc2BBF16FbB8EEd82b330320" as Address);

// ============================================================================
// Enforcer ABIs
// ============================================================================

/**
 * NonceEnforcer contract ABI (minimal - only currentNonce function)
 * Used to fetch the current nonce before creating delegations
 */
export const NONCE_ENFORCER_ABI = [
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

// ============================================================================
// Deployment Info
// ============================================================================

/**
 * All addresses deployed using CREATE2 with salt "GATOR"
 * Ensures consistent addresses across all networks including Monad
 *
 * Deployment script:
 * packages/contracts/lib/delegation-framework/script/DeployCaveatEnforcers.s.sol
 *
 * Full deployment list:
 * packages/contracts/lib/delegation-framework/documents/Deployments.md
 */
