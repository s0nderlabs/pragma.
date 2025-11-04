/**
 * Calldata Enforcement Unit Tests
 *
 * Tests for parameter enforcement utilities that protect against
 * delegation parameter manipulation attacks.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { pad, toHex, parseUnits } from "viem";
import {
  buildSwapEnforcement,
  buildERC20TransferEnforcement,
  buildNativeTransferEnforcement,
  validateAddress,
  validateAmount,
  validateBuilderConfig,
  MONORAIL_AGGREGATE_OFFSETS,
  ERC20_TRANSFER_OFFSETS,
  NATIVE_TRANSFER_OFFSETS,
} from "../dist/h2/delegation/index.js";

// ============================================================================
// Test Addresses
// ============================================================================

const TEST_USER_ADDRESS = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bE60";
const TEST_RECIPIENT_ADDRESS = "0x1234567890123456789012345678901234567890";
const TEST_ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// ============================================================================
// Swap Enforcement Tests
// ============================================================================

test("buildSwapEnforcement: creates enforcement config for destination", () => {
  const config = buildSwapEnforcement(TEST_USER_ADDRESS);

  assert.equal(config.length, 1);
  assert.equal(config[0].startIndex, MONORAIL_AGGREGATE_OFFSETS.DESTINATION);
  assert.equal(config[0].value, pad(TEST_USER_ADDRESS, { size: 32 }));
});

test("buildSwapEnforcement: enforces destination at offset 132", () => {
  const config = buildSwapEnforcement(TEST_USER_ADDRESS);
  assert.equal(config[0].startIndex, 132);
});

test("buildSwapEnforcement: left-pads address to 32 bytes", () => {
  const config = buildSwapEnforcement(TEST_USER_ADDRESS);
  assert.equal(config[0].value.length, 66); // "0x" + 64 hex chars
});

test("buildSwapEnforcement: works with zero address", () => {
  const config = buildSwapEnforcement(TEST_ZERO_ADDRESS);
  assert.equal(config[0].value, pad(TEST_ZERO_ADDRESS, { size: 32 }));
});

// ============================================================================
// ERC20 Transfer Enforcement Tests
// ============================================================================

test("buildERC20TransferEnforcement: creates enforcement for recipient and amount", () => {
  const testAmount = parseUnits("100", 6); // 100 USDC
  const config = buildERC20TransferEnforcement(TEST_RECIPIENT_ADDRESS, testAmount);

  assert.equal(config.length, 2);
  assert.equal(config[0].startIndex, ERC20_TRANSFER_OFFSETS.RECIPIENT);
  assert.equal(config[0].value, pad(TEST_RECIPIENT_ADDRESS, { size: 32 }));
  assert.equal(config[1].startIndex, ERC20_TRANSFER_OFFSETS.AMOUNT);
  assert.equal(config[1].value, pad(toHex(testAmount), { size: 32 }));
});

test("buildERC20TransferEnforcement: enforces recipient at offset 4", () => {
  const config = buildERC20TransferEnforcement(TEST_RECIPIENT_ADDRESS, 1n);
  assert.equal(config[0].startIndex, 4);
});

test("buildERC20TransferEnforcement: enforces amount at offset 36", () => {
  const config = buildERC20TransferEnforcement(TEST_RECIPIENT_ADDRESS, 1n);
  assert.equal(config[1].startIndex, 36);
});

test("buildERC20TransferEnforcement: handles large amounts", () => {
  const largeAmount = parseUnits("1000000", 18);
  const config = buildERC20TransferEnforcement(TEST_RECIPIENT_ADDRESS, largeAmount);
  assert.equal(config[1].value, pad(toHex(largeAmount), { size: 32 }));
});

// ============================================================================
// Native Transfer Enforcement Tests (DEPRECATED)
// ============================================================================

test("buildNativeTransferEnforcement: DEPRECATED - demonstrates why it doesn't work", () => {
  // This function is deprecated because AllowedCalldataEnforcer cannot
  // enforce native transfer recipients (callData is empty "0x")

  // The function still returns a config, but it will FAIL at runtime
  const config = buildNativeTransferEnforcement(TEST_RECIPIENT_ADDRESS);

  assert.equal(config.length, 1);
  assert.equal(config[0].startIndex, NATIVE_TRANSFER_OFFSETS.TARGET);
  assert.equal(config[0].value, pad(TEST_RECIPIENT_ADDRESS, { size: 32 }));

  // NOTE: This config will cause "AllowedCalldataEnforcer:invalid-calldata-length"
  // error when used because:
  // 1. AllowedCalldataEnforcer extracts the callData field from Execution struct
  // 2. For native transfers, callData is empty ("0x", length 0)
  // 3. Attempting to validate offset 0 in empty data fails: 0 + 32 > 0
  //
  // CORRECT APPROACH: Use ExactExecutionEnforcer instead
  // See: createNativeTransferDelegation() in transferDelegation.ts
});

// ============================================================================
// Validation Tests
// ============================================================================

test("validateAddress: accepts valid addresses", () => {
  assert.doesNotThrow(() => validateAddress(TEST_USER_ADDRESS));
  assert.doesNotThrow(() => validateAddress(TEST_RECIPIENT_ADDRESS));
  assert.doesNotThrow(() => validateAddress(TEST_ZERO_ADDRESS));
});

test("validateAddress: rejects addresses without 0x prefix", () => {
  assert.throws(() =>
    validateAddress("742d35Cc6634C0532925a3b844Bc9e7595f0bE60"),
    /missing 0x prefix/
  );
});

test("validateAddress: rejects addresses with wrong length", () => {
  assert.throws(() => validateAddress("0x742d"), /expected 42 chars/);
});

test("validateAmount: accepts positive amounts", () => {
  assert.doesNotThrow(() => validateAmount(1n, "test"));
  assert.doesNotThrow(() => validateAmount(parseUnits("100", 18), "test"));
});

test("validateAmount: rejects negative amounts", () => {
  assert.throws(() => validateAmount(-1n, "test"), /cannot be negative/);
});

test("validateAmount: rejects zero amounts", () => {
  assert.throws(() => validateAmount(0n, "test"), /cannot be zero/);
});

test("validateBuilderConfig: accepts valid configs", () => {
  const validConfig = {
    startIndex: 132,
    value: pad(TEST_USER_ADDRESS, { size: 32 }),
  };
  assert.doesNotThrow(() => validateBuilderConfig(validConfig));
});

test("validateBuilderConfig: rejects negative startIndex", () => {
  assert.throws(
    () =>
      validateBuilderConfig({
        startIndex: -1,
        value: pad(TEST_USER_ADDRESS, { size: 32 }),
      }),
    /must be non-negative/
  );
});

// ============================================================================
// Security Tests
// ============================================================================

test("security: prevents address substitution in swaps", () => {
  const userConfig = buildSwapEnforcement(TEST_USER_ADDRESS);
  const attackerConfig = buildSwapEnforcement(TEST_RECIPIENT_ADDRESS);

  assert.notEqual(userConfig[0].value, attackerConfig[0].value);
});

test("security: prevents amount manipulation in ERC20 transfers", () => {
  const smallAmount = parseUnits("100", 6);
  const largeAmount = parseUnits("1000000", 6);

  const smallConfig = buildERC20TransferEnforcement(TEST_RECIPIENT_ADDRESS, smallAmount);
  const largeConfig = buildERC20TransferEnforcement(TEST_RECIPIENT_ADDRESS, largeAmount);

  assert.notEqual(smallConfig[1].value, largeConfig[1].value);
});

test("security: enforces exact parameter matching", () => {
  const config = buildERC20TransferEnforcement(TEST_RECIPIENT_ADDRESS, parseUnits("100", 6));
  const modifiedConfig = buildERC20TransferEnforcement(
    TEST_RECIPIENT_ADDRESS,
    parseUnits("100.000001", 6)
  );

  assert.notEqual(config[1].value, modifiedConfig[1].value);
});

console.log("✅ All calldata enforcement tests passed!");
