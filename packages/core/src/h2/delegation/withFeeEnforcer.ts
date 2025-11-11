/**
 * PragmaFeeEnforcer Integration Wrapper
 *
 * Provides utilities for adding protocol fee collection to any delegation.
 * Uses the nested delegation pattern where:
 * 1. Main delegation includes PragmaFeeEnforcer caveat (with empty args)
 * 2. User signs main delegation
 * 3. Delegation hash is calculated
 * 4. Fee allowance delegation is created (bound to hash)
 * 5. User signs fee allowance delegation
 * 6. Main delegation's caveat args are updated (no re-signing needed!)
 * 7. Execution proceeds (enforcer collects fee in afterAllHook)
 *
 * Key Insight: Caveat args are NOT hashed, enabling runtime parameter
 * injection without invalidating signatures.
 */

import {
  type Address,
  type Hex,
  encodePacked,
  encodeAbiParameters,
} from "viem";
import type { Delegation } from "@metamask/delegation-toolkit";
import {
  PRAGMA_FEE_ENFORCER_ADDRESS,
  ARGS_EQUALITY_CHECK_ENFORCER_ADDRESS,
  ROOT_AUTHORITY,
} from "../config.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for adding fee enforcer caveat to a delegation
 */
export interface FeeConfig {
  /** Fee amount in wei (e.g., parseEther("0.0005") for 0.0005 MON) */
  feeAmount: bigint;
  /** Original swap/operation amount in wei (before fee deduction) */
  swapAmount: bigint;
  /** Token address for fee payment (use MON_ADDRESS for native MON) */
  tokenAddress: Address;
  /** Whether the fee is paid in native token (MON) or ERC20 */
  isNative: boolean;
  /** Session key address that will execute the delegation */
  sessionKey: Address;
}

/**
 * Delegation result with fee enforcer integration
 * Provides factory functions for creating fee allowance delegation
 * and updating main delegation args
 */
export interface DelegationWithFee<T> {
  /** Main delegation with fee enforcer caveat added (args initially empty) */
  mainDelegation: T;

  /**
   * Creates fee allowance delegation bound to the main delegation hash
   * Call this AFTER signing main delegation and getting its hash
   */
  createFeeAllowanceDelegation: (delegationHash: Hex) => Delegation;

  /**
   * Updates main delegation's caveat args with the fee allowance delegation
   * Call this AFTER signing fee allowance delegation
   * No re-signing needed - args are not hashed!
   */
  updateMainDelegationArgs: (feeAllowanceDelegation: Delegation) => void;

  /** Index of the fee enforcer caveat in main delegation (for reference) */
  feeEnforcerCaveatIndex: number;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Adds PragmaFeeEnforcer caveat to any delegation result
 *
 * This function modifies the delegation by adding a fee enforcer caveat
 * with empty args. The args will be populated later after signing.
 *
 * Usage Pattern:
 * ```typescript
 * // 1. Create main delegation
 * const swapDelegation = createSwapDelegation({...});
 *
 * // 2. Calculate fee
 * const feeAmount = calculateProtocolFee(swapAmount, PROTOCOL_FEES.swap);
 *
 * // 3. Add fee enforcer (if fee > 0)
 * const withFee = addPragmaFeeEnforcer(swapDelegation, {
 *   feeAmount,
 *   swapAmount, // Original swap amount (for percentage-based minimum)
 *   tokenAddress: MON_ADDRESS,
 *   isNative: true,
 *   sessionKey: sessionKeyAddress,
 * });
 *
 * // 4. Sign main delegation
 * const signature = await signTypedData(withFee.mainDelegation.typedData);
 * withFee.mainDelegation.delegation.signature = signature;
 *
 * // 5. Get delegation hash
 * const hash = await getDelegationHash(withFee.mainDelegation.delegation);
 *
 * // 6. Create + sign fee allowance delegation
 * const feeAllowance = withFee.createFeeAllowanceDelegation(hash);
 * feeAllowance.signature = await signTypedData(...);
 *
 * // 7. Update main delegation args (no re-signing!)
 * withFee.updateMainDelegationArgs(feeAllowance);
 *
 * // 8. Execute
 * await redeemDelegations([withFee.mainDelegation.delegation], ...);
 * ```
 *
 * @param delegationResult - Original delegation result from builder
 * @param config - Fee configuration (amount, token, session key)
 * @returns Delegation with fee enforcer and factory functions
 */
export function addPragmaFeeEnforcer<
  T extends { delegation: Delegation; typedData: any }
>(delegationResult: T, config: FeeConfig): DelegationWithFee<T> {
  // Build PragmaFeeEnforcer terms: isNative (1 byte) + token (20 bytes) + amount (32 bytes) + swapAmount (32 bytes)
  // Total: 85 bytes (v1.0.1 - added swapAmount for percentage-based minimum fee)
  const feeEnforcerTerms = encodePacked(
    ["uint8", "address", "uint256", "uint256"],
    [config.isNative ? 1 : 0, config.tokenAddress, config.feeAmount, config.swapAmount]
  );

  // Add caveat with empty args (will be updated after signing)
  delegationResult.delegation.caveats.push({
    enforcer: PRAGMA_FEE_ENFORCER_ADDRESS,
    terms: feeEnforcerTerms,
    args: "0x" as Hex, // Empty initially - updated after fee allowance signing
  });

  const feeEnforcerCaveatIndex = delegationResult.delegation.caveats.length - 1;

  // Return wrapper with factory functions
  return {
    mainDelegation: delegationResult,

    createFeeAllowanceDelegation: (delegationHash: Hex) => {
      // Create terms binding to specific delegation hash + session key
      const feeAllowanceTerms = encodePacked(
        ["bytes32", "address"],
        [delegationHash, config.sessionKey]
      );

      // Create fee allowance delegation
      // Delegate = PragmaFeeEnforcer (the contract that calls redeemDelegations)
      // Authority = ROOT (0xfff...fff)
      // Caveat = ArgsEqualityCheckEnforcer (validates hash + session key at runtime)
      return {
        delegate: PRAGMA_FEE_ENFORCER_ADDRESS,
        delegator: delegationResult.delegation.delegator,
        authority: ROOT_AUTHORITY as Hex,
        caveats: [
          {
            enforcer: ARGS_EQUALITY_CHECK_ENFORCER_ADDRESS,
            terms: feeAllowanceTerms,
            args: "0x" as Hex, // Empty - enforcer injects at runtime
          },
        ],
        salt: "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
        signature: "0x" as Hex, // To be filled by caller
      };
    },

    updateMainDelegationArgs: (feeAllowanceDelegation: Delegation) => {
      // Encode fee allowance delegation as caveat args
      // Note: TypeScript Delegation type has salt as Hex, but Solidity expects uint256
      // Viem's encodeAbiParameters handles this conversion automatically
      const feeEnforcerArgs = encodeAbiParameters(
        [
          {
            type: "tuple[]",
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
        [[feeAllowanceDelegation]] as any // Type assertion needed due to Hex vs bigint mismatch
      );

      // Update main delegation's caveat args
      // CRITICAL: This does NOT invalidate the signature because args are NOT hashed!
      delegationResult.delegation.caveats[feeEnforcerCaveatIndex].args =
        feeEnforcerArgs;
    },

    feeEnforcerCaveatIndex,
  };
}

/**
 * Calculate protocol fee for an operation
 *
 * Uses integer math to avoid floating point precision issues.
 * Fee rate is multiplied by 10000 for basis points precision.
 *
 * Example:
 * ```typescript
 * const swapAmount = parseEther("1.0");  // 1 MON
 * const fee = calculateProtocolFee(swapAmount, 0.005); // 0.5%
 * // Result: 0.005 MON (5000000000000000 wei)
 * ```
 *
 * @param amount - Operation amount in wei
 * @param feeRate - Fee rate as decimal (e.g., 0.005 for 0.5%)
 * @returns Fee amount in wei
 */
export function calculateProtocolFee(amount: bigint, feeRate: number): bigint {
  if (feeRate === 0) return 0n;

  // Convert rate to basis points (0.005 -> 50)
  // Then calculate: (amount * 50) / 10000
  const basisPoints = BigInt(Math.floor(feeRate * 10000));
  return (amount * basisPoints) / 10000n;
}

/**
 * Check if an operation type requires fee collection
 *
 * @param operationType - Operation type (swap, stake, transfer, etc.)
 * @param feeRates - Fee configuration object
 * @returns True if operation requires fees
 */
export function requiresFee(
  operationType: string,
  feeRates: Record<string, number>
): boolean {
  return (feeRates[operationType] ?? 0) > 0;
}
