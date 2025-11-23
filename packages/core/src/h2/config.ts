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
import { ROOT_AUTHORITY } from "@metamask/delegation-toolkit";

// Re-export ROOT_AUTHORITY for fee enforcer integration
export { ROOT_AUTHORITY };

// ============================================================================
// Network Configuration
// ============================================================================

/**
 * Monad RPC URL
 * Supports both server-side (MONAD_EXECUTION_RPC_URL) and client-side (NEXT_PUBLIC_MONAD_EXECUTION_RPC_URL) environments
 * @default https://testnet.monad.xyz/
 */
export const MONAD_RPC_URL =
  (process.env.MONAD_EXECUTION_RPC_URL as string) ||
  (process.env.NEXT_PUBLIC_MONAD_EXECUTION_RPC_URL as string) ||
  "https://testnet.monad.xyz/";

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
// Protocol Integration Addresses
// ============================================================================

/**
 * Wrapped MON (WMON) contract address
 * ERC20 wrapper for native MON token
 *
 * Used in wrap/unwrap tools for converting between MON <-> WMON
 *
 * @address 0x760afe86e5de5fa0ee542fc7b7b713e1c5425701
 */
export const WMON_ADDRESS =
  (process.env.MONAD_WMON_ADDRESS as Address) ||
  ("0x760afe86e5de5fa0ee542fc7b7b713e1c5425701" as Address);

/**
 * aPriori Liquid Staking (aprMON) contract address
 * ERC4626 tokenized vault for MON staking
 *
 * Docs: https://apriori-docs.gitbook.io/apriori-docs/aprmon/smart-contract-integration
 *
 * Features:
 * - Appreciation model (not rebase) - token value increases over time
 * - Payable deposit() - MON sent as msg.value (no approval needed)
 * - Two-step unstaking with epoch-based delays (12-18 hours)
 * - Batch redeem support for gas optimization
 *
 * Fee Structure:
 * - Pragma: 0.5% on staking operations
 * - aPriori: 0.1% (10 basis points) on unstaking/claiming
 * - aPriori: 10% on rewards (protocol-level, indirect to users)
 *
 * @address 0xb2f82D0f38dc453D596Ad40A37799446Cc89274A
 */
export const APRIORI_ADDRESS =
  (process.env.APRIORI_ADDRESS as Address) ||
  ("0xb2f82D0f38dc453D596Ad40A37799446Cc89274A" as Address);

/**
 * Pragma fee rate for aPriori staking operations
 * Charged on input amount (MON → aprMON conversions)
 *
 * @value 0.005 (0.5%)
 */
export const APRIORI_FEE_RATE = 0.005;

/**
 * Protocol fee rates by operation type
 * Fees are charged on input amounts and displayed to users in quotes
 *
 * Fee Pattern: Uniswap-style input deduction
 * - When user swaps 1.0 TOKEN, fee is deducted FROM that 1.0 TOKEN
 * - Actual swap amount: 1.0 - (1.0 × 0.005) = 0.995 TOKEN
 * - User only needs exactly 1.0 TOKEN, NOT 1.005 TOKEN
 */
export const PROTOCOL_FEES = {
  swap: 0.005,      // 0.5% on DEX swaps (deducted from input)
  stake: 0.005,     // 0.5% on MON being staked (deducted from input)
  nftBuy: 0.005,    // 0.5% on NFT purchases
  nftSell: 0,       // FREE - no fee on NFT listings
  transfer: 0,      // FREE - no fee on transfers
  wrap: 0,          // FREE - no fee on MON wrapping
  unwrap: 0,        // FREE - no fee on MON unwrapping
  unstake: 0,       // FREE - no fee on unstaking
} as const;

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

/**
 * ArgsEqualityCheckEnforcer - Enforces args equality for nested delegations
 *
 * Used in allowance delegations to prevent front-running attacks.
 * Validates that the delegationHash and redeemer match the expected values.
 *
 * Critical for PragmaFeeEnforcer security: ensures fee delegation can only be
 * redeemed by the correct session key in the correct execution context.
 *
 * @address 0x44B8C6ae3C304213c3e298495e12497Ed3E56E41
 * @version v1.3.0
 */
export const ARGS_EQUALITY_CHECK_ENFORCER_ADDRESS =
  (process.env.ARGS_EQUALITY_CHECK_ENFORCER_ADDRESS as Address) ||
  ("0x44B8C6ae3C304213c3e298495e12497Ed3E56E41" as Address);

/**
 * PragmaFeeEnforcer - Enforces protocol fee collection
 *
 * Collects 0.5% fee on all Pragma operations (swaps, stakes, NFT purchases).
 * Supports both native token (MON) and ERC20 fees.
 *
 * Features:
 * - Fee-on-transfer token support (90% threshold, allows up to 10% token fee)
 * - Treasury EOA validation (no contract callbacks)
 * - Maximum fee sanity check (1000 MON)
 * - Percentage-based minimum fee (0.01% of swap amount) - works for all token decimals
 * - Enhanced event logging with actual amounts
 *
 * Security:
 * - Stateless design (no mutable storage)
 * - Requires ArgsEqualityCheckEnforcer to prevent front-running
 * - Balance-based validation (supports fee-on-transfer tokens)
 *
 * @address 0xC0060a7411b5a66ffF4285BEf32e02eCd1Ba9D92
 * @version v1.0.1
 */
export const PRAGMA_FEE_ENFORCER_ADDRESS =
  (process.env.PRAGMA_FEE_ENFORCER_ADDRESS as Address) ||
  ("0xC0060a7411b5a66ffF4285BEf32e02eCd1Ba9D92" as Address);

/**
 * Pragma treasury address
 * Receives all protocol fees from operations
 *
 * MUST be an EOA (not a contract) for security reasons.
 * Contract enforces this in constructor validation.
 *
 * @address TBD (to be configured)
 */
export const PRAGMA_TREASURY_ADDRESS =
  (process.env.PRAGMA_TREASURY_ADDRESS as Address) ||
  ("0x0f7f2dc632ce4668574249961b79d8daaf804bb9" as Address);

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

/**
 * DelegationManager contract ABI (minimal - only getDelegationHash function)
 * Used to calculate delegation hash for fee enforcer integration
 */
export const DELEGATION_MANAGER_ABI = [
  {
    type: "function",
    name: "getDelegationHash",
    stateMutability: "view",
    inputs: [
      {
        name: "delegation",
        type: "tuple",
        components: [
          { name: "delegate", type: "address" },
          { name: "delegator", type: "address" },
          { name: "authority", type: "bytes32" },
          {
            name: "caveats",
            type: "tuple[]",
            components: [
              { name: "enforcer", type: "address" },
              { name: "terms", type: "bytes" },
              { name: "args", type: "bytes" },
            ],
          },
          { name: "salt", type: "uint256" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
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
