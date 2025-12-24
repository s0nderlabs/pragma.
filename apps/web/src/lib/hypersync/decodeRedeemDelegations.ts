/**
 * redeemDelegations Decoder
 *
 * Properly decodes ALL Pragma transaction types from on-chain calldata.
 * Since Pragma creates these transactions, we know exactly how they're encoded.
 *
 * Key Structures:
 * - redeemDelegations(bytes[] _permissionContexts, bytes32[] _modes, bytes[] _executionCallDatas)
 * - Each permissionContext contains a Delegation[] array (ABI encoded)
 * - Each executionCallData is ERC7579 packed: target(20bytes) + value(32bytes) + callData
 */

import { formatUnits } from "viem";

// ============================================================================
// Known Enforcer Addresses (from packages/core/src/h2/config.ts)
// ============================================================================

const ENFORCERS: Record<string, string> = {
  "0x99f2e9bf15ce5ec84685604836f71ab835dbbded": "IdEnforcer",
  "0xf71af580b9c3078fbc2bbf16fbb8eed82b330320": "NativeTokenTransferAmountEnforcer",
  "0x1046bb45c8d673d4ea75321280db34899413c069": "TimestampEnforcer",
  "0xde4f2fac4b3d87a1d9953ca5fc09fca7f366254f": "NonceEnforcer",
  "0x04658b29f6b82ed55274221a06fc97d318e25416": "LimitedCallsEnforcer",
  "0x2c21fd0cb9dc8445cb3fb0dc5e7bb0aca01842b5": "AllowedMethodsEnforcer",
  "0xc2b0d624c1c4319760c96503ba27c347f3260f55": "AllowedCalldataEnforcer",
  "0x44b8c6ae3c304213c3e298495e12497ed3e56e41": "ArgsEqualityCheckEnforcer",
  "0xc0060a7411b5a66fff4285bef32e02ecd1ba9d92": "PragmaFeeEnforcer",
  "0x19bd2a9af2d56d9b97b04bf9ed52a0d3c3a3a09c": "AllowedTargetsEnforcer",
  "0x7f20f61b1f09b08d970938f6fa563634d65c4eeb": "AllowedTargetsEnforcer", // DTK deployment
};

// ============================================================================
// Known Contract Addresses
// ============================================================================

const CONTRACTS: Record<string, string> = {
  "0xdb9b1e94b5b69df7e401ddbede43491141047db3": "DelegationManager",
  "0xa68a7f0601effdc65c64d9c47ca1b18d96b4352c": "MonorailRouter",
  "0x0c65a0bc65a5d819235b71f554d210d3f80e0852": "aPriori",
  "0x3bd359c1119da7da1d913d1c4d2b7c461115433a": "WMON",
  "0x0000000000000068f116a894984e2db1123eb395": "Seaport",
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0xExchange",
};

// ============================================================================
// Function Selectors
// ============================================================================

const SELECTORS: Record<string, string> = {
  "0xcef6d209": "redeemDelegations",
  "0xa9059cbb": "transfer(address,uint256)",
  "0x095ea7b3": "approve(address,uint256)",
  "0x23b872dd": "transferFrom(address,address,uint256)",
  "0x2e1a7d4d": "withdraw(uint256)", // WMON unwrap
  "0xd0e30db0": "deposit()", // WMON wrap
  "0x6e553f65": "deposit(uint256,address)", // aPriori stake
  "0x7d41c86e": "requestRedeem(uint256,address,address)", // aPriori unstake request (ERC-7540)
  "0xba087652": "redeem(uint256,address,address)", // ERC-4626 redeem (sync)
  "0x492e47d2": "claimWithdrawal(uint256,address)", // aPriori claim unstake
};

const REDEEM_DELEGATIONS_SELECTOR = "0xcef6d209";

// ============================================================================
// Enforcer Term Decoders
// ============================================================================

/**
 * Decoded parameters for each enforcer type.
 * These match the Solidity struct encodings from DTK enforcers.
 */
export interface DecodedCaveatParams {
  // TimestampEnforcer: 32 bytes = [uint128 after, uint128 before]
  timestampAfter?: number;      // Unix timestamp - earliest valid time
  timestampBefore?: number;     // Unix timestamp - latest valid time

  // NonceEnforcer: 32 bytes = uint256 nonce
  nonce?: string;               // Nonce value (as string for large numbers)

  // LimitedCallsEnforcer: 32 bytes = uint256 limit
  callLimit?: number;           // Max number of calls allowed

  // NativeTokenTransferAmountEnforcer: 32 bytes = uint256 allowance
  nativeAllowance?: string;     // Max native MON transfer (wei)
  nativeAllowanceFormatted?: string; // Human-readable MON amount

  // ERC20TransferAmountEnforcer: 52 bytes = [address token, uint256 amount]
  erc20Token?: string;          // Token address
  erc20MaxAmount?: string;      // Max transfer amount (raw)
  erc20MaxAmountFormatted?: string; // Human-readable amount

  // AllowedTargetsEnforcer: dynamic = address[]
  allowedTargets?: string[];    // List of allowed contract addresses
  allowedTargetNames?: string[]; // Contract names if known

  // AllowedMethodsEnforcer: dynamic = bytes4[]
  allowedMethods?: string[];    // List of allowed function selectors
  allowedMethodNames?: string[]; // Function names if known

  // AllowedCalldataEnforcer: dynamic = (uint256 startIndex, bytes value)[]
  calldataConstraints?: Array<{
    startIndex: number;
    value: string;
    description?: string;
  }>;

  // ArgsEqualityCheckEnforcer: dynamic bytes
  expectedArgs?: string;

  // IdEnforcer: 20 bytes = address
  expectedCaller?: string;

  // Generic fallback for unknown enforcers
  rawTerms?: string;
  rawArgs?: string;
}

/**
 * Decode TimestampEnforcer terms
 * Format: 32 bytes = [uint128 timestampAfter (16 bytes), uint128 timestampBefore (16 bytes)]
 */
function decodeTimestampTerms(terms: string): Partial<DecodedCaveatParams> {
  const hex = terms.startsWith("0x") ? terms.slice(2) : terms;
  if (hex.length < 64) return { rawTerms: terms };

  try {
    // First 16 bytes (32 hex chars) = timestampAfter
    const afterHex = hex.slice(0, 32);
    // Next 16 bytes = timestampBefore
    const beforeHex = hex.slice(32, 64);

    const timestampAfter = parseInt(afterHex, 16);
    const timestampBefore = parseInt(beforeHex, 16);

    return {
      timestampAfter: timestampAfter > 0 ? timestampAfter : undefined,
      timestampBefore: timestampBefore > 0 && timestampBefore < Number.MAX_SAFE_INTEGER
        ? timestampBefore
        : undefined,
    };
  } catch {
    return { rawTerms: terms };
  }
}

/**
 * Decode NonceEnforcer terms
 * Format: 32 bytes = uint256 nonce
 */
function decodeNonceTerms(terms: string): Partial<DecodedCaveatParams> {
  const hex = terms.startsWith("0x") ? terms.slice(2) : terms;
  if (hex.length < 64) return { rawTerms: terms };

  try {
    const nonce = BigInt("0x" + hex.slice(0, 64));
    return { nonce: nonce.toString() };
  } catch {
    return { rawTerms: terms };
  }
}

/**
 * Decode LimitedCallsEnforcer terms
 * Format: 32 bytes = uint256 limit
 */
function decodeLimitedCallsTerms(terms: string): Partial<DecodedCaveatParams> {
  const hex = terms.startsWith("0x") ? terms.slice(2) : terms;
  if (hex.length < 64) return { rawTerms: terms };

  try {
    const limit = BigInt("0x" + hex.slice(0, 64));
    return { callLimit: Number(limit) };
  } catch {
    return { rawTerms: terms };
  }
}

/**
 * Decode NativeTokenTransferAmountEnforcer terms
 * Format: 32 bytes = uint256 allowance (in wei)
 */
function decodeNativeTransferTerms(terms: string): Partial<DecodedCaveatParams> {
  const hex = terms.startsWith("0x") ? terms.slice(2) : terms;
  if (hex.length < 64) return { rawTerms: terms };

  try {
    const allowance = BigInt("0x" + hex.slice(0, 64));
    const formatted = formatUnits(allowance, 18);
    return {
      nativeAllowance: allowance.toString(),
      nativeAllowanceFormatted: formatted + " MON",
    };
  } catch {
    return { rawTerms: terms };
  }
}

/**
 * Decode ERC20TransferAmountEnforcer terms
 * Format: 52 bytes = [address token (20 bytes), uint256 amount (32 bytes)]
 */
function decodeERC20TransferTerms(terms: string): Partial<DecodedCaveatParams> {
  const hex = terms.startsWith("0x") ? terms.slice(2) : terms;
  if (hex.length < 104) return { rawTerms: terms }; // 52 bytes = 104 hex chars

  try {
    const tokenAddr = "0x" + hex.slice(0, 40);
    const amount = BigInt("0x" + hex.slice(40, 104));
    // Default to 18 decimals, can be enhanced with token lookup
    const formatted = formatUnits(amount, 18);
    return {
      erc20Token: tokenAddr.toLowerCase(),
      erc20MaxAmount: amount.toString(),
      erc20MaxAmountFormatted: formatted,
    };
  } catch {
    return { rawTerms: terms };
  }
}

/**
 * Decode AllowedTargetsEnforcer terms
 * Format: ABI-encoded address[]
 */
function decodeAllowedTargetsTerms(terms: string): Partial<DecodedCaveatParams> {
  const hex = terms.startsWith("0x") ? terms.slice(2) : terms;
  if (hex.length < 64) return { rawTerms: terms };

  try {
    // ABI-encoded array: offset (32) + length (32) + addresses (32 each, right-padded)
    const offset = parseInt(hex.slice(0, 64), 16) * 2;
    const length = parseInt(hex.slice(offset, offset + 64), 16);

    const targets: string[] = [];
    const targetNames: string[] = [];

    for (let i = 0; i < length; i++) {
      const addrStart = offset + 64 + i * 64;
      const addr = "0x" + hex.slice(addrStart + 24, addrStart + 64);
      targets.push(addr.toLowerCase());
      const name = CONTRACTS[addr.toLowerCase()];
      targetNames.push(name || "Unknown");
    }

    return {
      allowedTargets: targets,
      allowedTargetNames: targetNames,
    };
  } catch {
    return { rawTerms: terms };
  }
}

/**
 * Decode AllowedMethodsEnforcer terms
 * Format: ABI-encoded bytes4[]
 */
function decodeAllowedMethodsTerms(terms: string): Partial<DecodedCaveatParams> {
  const hex = terms.startsWith("0x") ? terms.slice(2) : terms;
  if (hex.length < 64) return { rawTerms: terms };

  try {
    // ABI-encoded array of bytes4
    const offset = parseInt(hex.slice(0, 64), 16) * 2;
    const length = parseInt(hex.slice(offset, offset + 64), 16);

    const methods: string[] = [];
    const methodNames: string[] = [];

    for (let i = 0; i < length; i++) {
      const selectorStart = offset + 64 + i * 64;
      const selector = "0x" + hex.slice(selectorStart, selectorStart + 8);
      methods.push(selector.toLowerCase());
      const name = SELECTORS[selector.toLowerCase()];
      methodNames.push(name || "unknown");
    }

    return {
      allowedMethods: methods,
      allowedMethodNames: methodNames,
    };
  } catch {
    return { rawTerms: terms };
  }
}

/**
 * Decode AllowedCalldataEnforcer terms
 * Format: ABI-encoded (uint256 startIndex, bytes value)[]
 */
function decodeAllowedCalldataTerms(terms: string): Partial<DecodedCaveatParams> {
  const hex = terms.startsWith("0x") ? terms.slice(2) : terms;
  if (hex.length < 64) return { rawTerms: terms };

  try {
    // This is complex nested ABI encoding, simplified extraction
    const constraints: Array<{ startIndex: number; value: string; description?: string }> = [];

    // For common patterns, try to extract meaningful info
    // Pattern: offset to array -> array length -> tuples
    const offset = parseInt(hex.slice(0, 64), 16) * 2;
    const length = parseInt(hex.slice(offset, offset + 64), 16);

    if (length > 0 && length < 10) {
      // Try to parse each constraint
      let pos = offset + 64;
      for (let i = 0; i < length && pos < hex.length; i++) {
        // Each element has: offset to tuple -> startIndex (32) + offset to bytes -> bytes length + bytes data
        const tupleOffset = parseInt(hex.slice(pos, pos + 64), 16) * 2;
        const actualPos = offset + 64 + tupleOffset;

        if (actualPos + 64 <= hex.length) {
          const startIndex = parseInt(hex.slice(actualPos, actualPos + 64), 16);
          constraints.push({
            startIndex,
            value: "0x" + hex.slice(actualPos + 64, Math.min(actualPos + 128, hex.length)),
            description: describeCalldataOffset(startIndex),
          });
        }
        pos += 64;
      }
    }

    return constraints.length > 0
      ? { calldataConstraints: constraints }
      : { rawTerms: terms };
  } catch {
    return { rawTerms: terms };
  }
}

/**
 * Describe what a calldata offset typically means
 */
function describeCalldataOffset(offset: number): string {
  const descriptions: Record<number, string> = {
    0: "Function selector",
    4: "First parameter (e.g., recipient/spender)",
    36: "Second parameter (e.g., amount)",
    68: "Third parameter",
    100: "Fourth parameter",
    132: "Fifth parameter (e.g., swap destination)",
  };
  return descriptions[offset] || `Offset ${offset}`;
}

/**
 * Decode IdEnforcer terms
 * Format: 20 bytes = address
 */
function decodeIdEnforcerTerms(terms: string): Partial<DecodedCaveatParams> {
  const hex = terms.startsWith("0x") ? terms.slice(2) : terms;
  if (hex.length < 40) return { rawTerms: terms };

  try {
    const expectedCaller = "0x" + hex.slice(0, 40);
    return { expectedCaller: expectedCaller.toLowerCase() };
  } catch {
    return { rawTerms: terms };
  }
}

/**
 * Master function to decode caveat terms based on enforcer type
 */
function decodeCaveatTerms(enforcerName: string, terms: string, args: string): DecodedCaveatParams {
  let params: DecodedCaveatParams = {};

  // Always include raw values for reference
  if (terms && terms !== "0x") params.rawTerms = terms;
  if (args && args !== "0x") params.rawArgs = args;

  // Decode based on enforcer type
  switch (enforcerName) {
    case "TimestampEnforcer":
      params = { ...params, ...decodeTimestampTerms(terms) };
      break;
    case "NonceEnforcer":
      params = { ...params, ...decodeNonceTerms(terms) };
      break;
    case "LimitedCallsEnforcer":
      params = { ...params, ...decodeLimitedCallsTerms(terms) };
      break;
    case "NativeTokenTransferAmountEnforcer":
      params = { ...params, ...decodeNativeTransferTerms(terms) };
      break;
    case "ERC20TransferAmountEnforcer":
      params = { ...params, ...decodeERC20TransferTerms(terms) };
      break;
    case "AllowedTargetsEnforcer":
      params = { ...params, ...decodeAllowedTargetsTerms(terms) };
      break;
    case "AllowedMethodsEnforcer":
      params = { ...params, ...decodeAllowedMethodsTerms(terms) };
      break;
    case "AllowedCalldataEnforcer":
      params = { ...params, ...decodeAllowedCalldataTerms(terms) };
      break;
    case "IdEnforcer":
      params = { ...params, ...decodeIdEnforcerTerms(terms) };
      break;
    case "ArgsEqualityCheckEnforcer":
      params.expectedArgs = terms;
      break;
    case "PragmaFeeEnforcer":
      // PragmaFeeEnforcer doesn't have terms - it's a fixed 1% fee
      break;
    default:
      // Unknown enforcer - keep raw terms
      break;
  }

  return params;
}

// ============================================================================
// Types
// ============================================================================

export interface Caveat {
  enforcer: string;
  enforcerName: string;
  terms: string;
  args: string;
  /** Decoded human-readable parameters */
  decodedParams: DecodedCaveatParams;
}

export interface Delegation {
  delegate: string;
  delegator: string;
  authority: string;
  caveats: Caveat[];
  salt: string;
  signatureLength: number;
}

export interface Execution {
  target: string;
  targetName: string | null;
  value: bigint;
  valueFormatted: string;
  callData: string;
  selector: string | null;
  selectorName: string;
}

export type TxType =
  | "swap"
  | "stake"
  | "unstake_request"
  | "unstake_claim"
  | "nft_buy"
  | "wrap"
  | "unwrap"
  | "approve"
  | "transfer"
  | "transferFrom"
  | "native_transfer"
  | "unknown";

export interface DecodedRedeemDelegation {
  // Primary delegation info (first delegation in first chain)
  primaryDelegate: string | null; // Session key
  primaryDelegator: string | null; // Smart account

  // Full delegation chains
  delegationChains: Array<{
    chainIndex: number;
    delegations: Delegation[];
  }>;

  // Modes (ERC7579)
  modes: string[];

  // Decoded executions
  executions: Array<{
    index: number;
    target: string;
    targetName: string | null;
    value: string;
    valueFormatted: string;
    callDataLength: number;
    selector: string | null;
    selectorName: string;
    txType: TxType;
  }>;
}

export interface FallbackResult {
  target: string;
  method: "fallback_marker";
}

// ============================================================================
// Helpers
// ============================================================================

function getEnforcerName(addr: string): string {
  return ENFORCERS[addr.toLowerCase()] || "Unknown";
}

function getContractName(addr: string): string | null {
  return CONTRACTS[addr.toLowerCase()] || null;
}

function getSelectorName(selector: string | null): string {
  if (!selector) return "unknown";
  return SELECTORS[selector.toLowerCase()] || "unknown";
}

function formatWei(wei: bigint): string {
  return formatUnits(wei, 18);
}

// ============================================================================
// ABI Parameter Decoder
// ============================================================================

/**
 * Simple ABI parameter decoder for bytes[] and bytes32[] arrays
 * Handles the specific encoding used by redeemDelegations
 */
function decodeAbiParameters(
  params: Array<{ type: string }>,
  data: string
): Array<string[]> {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  let offset = 0;
  const results: Array<string[]> = [];

  for (const param of params) {
    if (param.type === "bytes[]") {
      // Read offset to array data
      const arrayOffset = parseInt(hex.slice(offset, offset + 64), 16) * 2;

      // Read array length from offset
      const arrayLength = parseInt(hex.slice(arrayOffset, arrayOffset + 64), 16);

      // Read each bytes element
      const bytesArray: string[] = [];
      for (let i = 0; i < arrayLength; i++) {
        const elementOffsetPos = arrayOffset + 64 + i * 64;
        const elementOffset =
          parseInt(hex.slice(elementOffsetPos, elementOffsetPos + 64), 16) * 2;
        const actualElementOffset = arrayOffset + 64 + elementOffset;

        // Read bytes length
        const bytesLength = parseInt(
          hex.slice(actualElementOffset, actualElementOffset + 64),
          16
        );

        // Read bytes data
        const bytesData =
          "0x" +
          hex.slice(
            actualElementOffset + 64,
            actualElementOffset + 64 + bytesLength * 2
          );
        bytesArray.push(bytesData);
      }

      results.push(bytesArray);
      offset += 64;
    } else if (param.type === "bytes32[]") {
      // Read offset to array data
      const arrayOffset = parseInt(hex.slice(offset, offset + 64), 16) * 2;

      // Read array length
      const arrayLength = parseInt(hex.slice(arrayOffset, arrayOffset + 64), 16);

      // Read each bytes32 element
      const bytes32Array: string[] = [];
      for (let i = 0; i < arrayLength; i++) {
        const elementPos = arrayOffset + 64 + i * 64;
        bytes32Array.push("0x" + hex.slice(elementPos, elementPos + 64));
      }

      results.push(bytes32Array);
      offset += 64;
    }
  }

  return results;
}

// ============================================================================
// Delegation Array Decoder
// ============================================================================

interface RawDelegation {
  delegate: string;
  delegator: string;
  authority: string;
  caveats: Array<{ enforcer: string; terms: string; args: string }>;
  salt: bigint;
  signature: string;
}

/**
 * Decode a Delegation[] array from ABI-encoded bytes
 */
function decodeDelegationArray(bytes: string): RawDelegation[] {
  const hex = bytes.startsWith("0x") ? bytes.slice(2) : bytes;

  // Array offset (first 32 bytes)
  const arrayOffset = parseInt(hex.slice(0, 64), 16) * 2;

  // Array length
  const arrayLength = parseInt(hex.slice(arrayOffset, arrayOffset + 64), 16);

  const delegations: RawDelegation[] = [];

  for (let i = 0; i < arrayLength; i++) {
    // Each delegation tuple offset
    const delegationOffsetPos = arrayOffset + 64 + i * 64;
    const delegationOffset =
      parseInt(hex.slice(delegationOffsetPos, delegationOffsetPos + 64), 16) * 2;
    const actualOffset = arrayOffset + 64 + delegationOffset;

    // Delegation tuple structure:
    // - address delegate (32 bytes, right-padded)
    // - address delegator (32 bytes, right-padded)
    // - bytes32 authority (32 bytes)
    // - offset to caveats array (32 bytes)
    // - uint256 salt (32 bytes)
    // - offset to signature bytes (32 bytes)

    const delegate = "0x" + hex.slice(actualOffset + 24, actualOffset + 64);
    const delegator = "0x" + hex.slice(actualOffset + 64 + 24, actualOffset + 128);
    const authority = "0x" + hex.slice(actualOffset + 128, actualOffset + 192);

    const caveatsOffsetRaw =
      parseInt(hex.slice(actualOffset + 192, actualOffset + 256), 16) * 2;
    const salt = BigInt(
      "0x" + hex.slice(actualOffset + 256, actualOffset + 320)
    );
    const signatureOffsetRaw =
      parseInt(hex.slice(actualOffset + 320, actualOffset + 384), 16) * 2;

    // Decode caveats
    const caveatsOffset = actualOffset + caveatsOffsetRaw;
    const caveatsLength = parseInt(
      hex.slice(caveatsOffset, caveatsOffset + 64),
      16
    );

    const caveats: Array<{ enforcer: string; terms: string; args: string }> = [];
    for (let j = 0; j < caveatsLength; j++) {
      const caveatOffsetPos = caveatsOffset + 64 + j * 64;
      const caveatOffset =
        parseInt(hex.slice(caveatOffsetPos, caveatOffsetPos + 64), 16) * 2;
      const actualCaveatOffset = caveatsOffset + 64 + caveatOffset;

      // Caveat: (address enforcer, bytes terms, bytes args)
      const enforcer =
        "0x" + hex.slice(actualCaveatOffset + 24, actualCaveatOffset + 64);

      const termsOffsetRaw =
        parseInt(
          hex.slice(actualCaveatOffset + 64, actualCaveatOffset + 128),
          16
        ) * 2;
      const argsOffsetRaw =
        parseInt(
          hex.slice(actualCaveatOffset + 128, actualCaveatOffset + 192),
          16
        ) * 2;

      // Decode terms bytes
      const termsOffset = actualCaveatOffset + termsOffsetRaw;
      const termsLength = parseInt(hex.slice(termsOffset, termsOffset + 64), 16);
      const terms =
        termsLength > 0
          ? "0x" + hex.slice(termsOffset + 64, termsOffset + 64 + termsLength * 2)
          : "0x";

      // Decode args bytes
      const argsOffset = actualCaveatOffset + argsOffsetRaw;
      const argsLength = parseInt(hex.slice(argsOffset, argsOffset + 64), 16);
      const args =
        argsLength > 0
          ? "0x" + hex.slice(argsOffset + 64, argsOffset + 64 + argsLength * 2)
          : "0x";

      caveats.push({ enforcer, terms, args });
    }

    // Decode signature bytes
    const signatureOffset = actualOffset + signatureOffsetRaw;
    const signatureLength = parseInt(
      hex.slice(signatureOffset, signatureOffset + 64),
      16
    );
    const signature =
      signatureLength > 0
        ? "0x" +
          hex.slice(
            signatureOffset + 64,
            signatureOffset + 64 + signatureLength * 2
          )
        : "0x";

    delegations.push({
      delegate,
      delegator,
      authority,
      caveats,
      salt,
      signature,
    });
  }

  return delegations;
}

// ============================================================================
// Execution Decoder
// ============================================================================

interface RawExecution {
  target: string;
  value: bigint;
  callData: string;
}

/**
 * Decode execution from executionCallData bytes
 * ERC7579 SingleDefault mode uses packed encoding: target(20bytes) + value(32bytes) + callData
 *
 * NOTE: This is NOT standard ABI encoding - it's packed!
 */
function decodeExecution(bytes: string): RawExecution {
  const hex = bytes.startsWith("0x") ? bytes.slice(2) : bytes;

  // 20 bytes target + 32 bytes value + callData
  const target = "0x" + hex.slice(0, 40);
  const value = BigInt("0x" + (hex.slice(40, 104) || "0"));
  const callData = hex.length > 104 ? "0x" + hex.slice(104) : "0x";

  return { target, value, callData };
}

// ============================================================================
// Transaction Type Classification
// ============================================================================

/**
 * Classify transaction type based on decoded execution and caveats
 */
function classifyTxType(
  execution: RawExecution,
  caveats: Array<{ enforcer: string; terms: string; args: string }>
): TxType {
  const target = execution.target.toLowerCase();
  const value = execution.value;
  const callData = execution.callData;
  const selector =
    callData.length >= 10 ? callData.slice(0, 10).toLowerCase() : null;

  const contractName = getContractName(target);
  const hasNativeTransferEnforcer = caveats.some(
    (c) =>
      c.enforcer.toLowerCase() === "0xf71af580b9c3078fbc2bbf16fbb8eed82b330320"
  );

  // Native transfer: value > 0, empty calldata, NativeTokenTransferAmountEnforcer
  if (
    value > 0n &&
    (callData === "0x" || callData.length <= 2) &&
    hasNativeTransferEnforcer
  ) {
    return "native_transfer";
  }

  // Swap: target is MonorailRouter or 0x
  if (contractName === "MonorailRouter" || contractName === "0xExchange") {
    return "swap";
  }

  // aPriori operations
  if (contractName === "aPriori") {
    if (selector === "0x6e553f65") return "stake";
    // ERC-7540 requestRedeem or ERC-4626 redeem
    if (selector === "0x7d41c86e" || selector === "0xba087652") return "unstake_request";
    // claimWithdrawal after unstake waiting period
    if (selector === "0x492e47d2") return "unstake_claim";
  }

  // WMON operations
  if (contractName === "WMON") {
    if (selector === "0xd0e30db0" || (value > 0n && callData.length <= 10))
      return "wrap";
    if (selector === "0x2e1a7d4d") return "unwrap";
  }

  // Seaport = NFT buy
  if (contractName === "Seaport") {
    return "nft_buy";
  }

  // ERC20 operations
  if (selector === "0x095ea7b3") return "approve";
  if (selector === "0xa9059cbb") return "transfer";
  if (selector === "0x23b872dd") return "transferFrom";

  return "unknown";
}

// ============================================================================
// Main Decoder Functions
// ============================================================================

/**
 * PRIMARY: Decode redeemDelegations calldata using proper ABI decoding
 *
 * @param input - Transaction input data (hex string starting with 0x)
 * @returns Decoded delegation info or null if decoding fails
 */
export function decodeRedeemDelegations(
  input: string
): DecodedRedeemDelegation | null {
  if (!input.startsWith(REDEEM_DELEGATIONS_SELECTOR)) {
    return null;
  }

  const data = input.slice(10); // Remove function selector

  try {
    // Step 1: Decode the three top-level parameters
    const [permissionContexts, modes, executionCallDatas] = decodeAbiParameters(
      [{ type: "bytes[]" }, { type: "bytes32[]" }, { type: "bytes[]" }],
      data
    );

    // Step 2: Decode each permission context (delegation chain)
    const delegationChains = permissionContexts.map((ctx) =>
      decodeDelegationArray(ctx)
    );

    // Step 3: Decode each execution
    const executions = executionCallDatas.map((execData) =>
      decodeExecution(execData)
    );

    // Build result
    const result: DecodedRedeemDelegation = {
      primaryDelegate: null,
      primaryDelegator: null,
      delegationChains: delegationChains.map((chain, idx) => ({
        chainIndex: idx,
        delegations: chain.map((d) => ({
          delegate: d.delegate,
          delegator: d.delegator,
          authority: d.authority,
          salt: d.salt.toString(),
          signatureLength: d.signature.length,
          caveats: d.caveats.map((c) => {
            const enforcerName = getEnforcerName(c.enforcer);
            return {
              enforcer: c.enforcer,
              enforcerName,
              terms: c.terms,
              args: c.args,
              decodedParams: decodeCaveatTerms(enforcerName, c.terms, c.args),
            };
          }),
        })),
      })),
      modes: modes,
      executions: executions.map((exec, idx) => {
        const selector =
          exec.callData.length >= 10 ? exec.callData.slice(0, 10) : null;

        // Get caveats from corresponding delegation chain
        const delegationCaveats = delegationChains[idx]?.[0]?.caveats || [];
        const txType = classifyTxType(exec, delegationCaveats);

        return {
          index: idx,
          target: exec.target,
          targetName: getContractName(exec.target),
          value: exec.value.toString(),
          valueFormatted: formatWei(exec.value) + " MON",
          callDataLength: exec.callData.length,
          selector,
          selectorName: getSelectorName(selector),
          txType,
        };
      }),
    };

    // Extract primary delegation info (first delegation in first chain)
    if (delegationChains.length > 0 && delegationChains[0].length > 0) {
      const primaryDelegation = delegationChains[0][0];
      result.primaryDelegate = primaryDelegation.delegate;
      result.primaryDelegator = primaryDelegation.delegator;
    }

    return result;
  } catch (error) {
    console.warn("[decodeRedeemDelegations] ABI decode failed:", error);
    return null;
  }
}

/**
 * FALLBACK: Extract execution target using marker-based approach
 *
 * This works for native_transfer (session key funding) transactions
 * where execution data is packed at the END with format:
 * ...00000034<address:40hex><value:64hex><padding>...
 *
 * 0x34 = 52 bytes = 20 (address) + 32 (value)
 *
 * Used when ABI decoding fails (shouldn't happen for Pragma txs)
 */
export function extractExecutionTargetFallback(
  input: string | undefined
): FallbackResult | null {
  if (!input || !input.startsWith(REDEEM_DELEGATIONS_SELECTOR)) {
    return null;
  }

  const hex = input.slice(2); // Remove 0x prefix
  const marker = "00000034";
  const markerIndex = hex.lastIndexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const afterMarker = hex.slice(markerIndex + marker.length);
  if (afterMarker.length < 40) {
    return null;
  }

  const address = afterMarker.slice(0, 40).toLowerCase();
  if (address === "0".repeat(40)) {
    return null;
  }

  return {
    target: "0x" + address,
    method: "fallback_marker",
  };
}

/**
 * Extract execution target from redeemDelegations calldata
 *
 * Tries proper ABI decoding first, falls back to marker-based extraction.
 *
 * @param input - Transaction input data
 * @param expectedValue - Expected MON value (unused, kept for backward compatibility)
 * @returns Target address or null if extraction fails
 */
export function extractExecutionTarget(
  input: string | undefined,
  _expectedValue?: bigint
): string | null {
  if (!input) return null;

  // PRIMARY: Try proper ABI decoding
  const decoded = decodeRedeemDelegations(input);
  if (decoded && decoded.executions.length > 0) {
    // Return the first execution target
    return decoded.executions[0].target;
  }

  // FALLBACK: Use marker-based extraction
  const fallback = extractExecutionTargetFallback(input);
  if (fallback) {
    return fallback.target;
  }

  return null;
}

/**
 * Get decoded execution details for activity display
 *
 * @param input - Transaction input data
 * @returns Execution details including target, value, and txType
 */
export function getExecutionDetails(input: string | undefined): {
  target: string | null;
  targetName: string | null;
  value: bigint;
  valueFormatted: string;
  txType: TxType;
  delegator: string | null;
  delegate: string | null;
} | null {
  if (!input) return null;

  const decoded = decodeRedeemDelegations(input);
  if (!decoded || decoded.executions.length === 0) {
    // Fallback for extracting just the target
    const fallback = extractExecutionTargetFallback(input);
    if (fallback) {
      return {
        target: fallback.target,
        targetName: getContractName(fallback.target),
        value: 0n,
        valueFormatted: "0 MON",
        txType: "unknown",
        delegator: null,
        delegate: null,
      };
    }
    return null;
  }

  const exec = decoded.executions[0];
  return {
    target: exec.target,
    targetName: exec.targetName,
    value: BigInt(exec.value),
    valueFormatted: exec.valueFormatted,
    txType: exec.txType,
    delegator: decoded.primaryDelegator,
    delegate: decoded.primaryDelegate,
  };
}

// Re-export types and constants for external use
export { ENFORCERS, CONTRACTS, SELECTORS, REDEEM_DELEGATIONS_SELECTOR };
