/**
 * Unit tests for PragmaFeeEnforcer wrapper functions
 */

import test from "node:test";
import assert from "node:assert/strict";

const { addPragmaFeeEnforcer, calculateProtocolFee, requiresFee } = await import(
  "../dist/h2/delegation/withFeeEnforcer.js"
);
const { parseEther, encodePacked } = await import("viem");
const { PROTOCOL_FEES, PRAGMA_FEE_ENFORCER_ADDRESS, ARGS_EQUALITY_CHECK_ENFORCER_ADDRESS, ROOT_AUTHORITY } =
  await import("../dist/h2/config.js");

// ============================================================================
// Test Fixtures
// ============================================================================

const MON_ADDRESS = "0x0000000000000000000000000000000000000000";
const SESSION_KEY = "0x0000000000000000000000000000000000000001";
const DELEGATOR = "0x0000000000000000000000000000000000000002";

function createMockDelegation() {
  return {
    delegation: {
      delegate: SESSION_KEY,
      delegator: DELEGATOR,
      authority: "0x0000000000000000000000000000000000000000000000000000000000000000",
      caveats: [],
      salt: 0n,
      signature: "0x",
    },
    typedData: {
      domain: {},
      types: {},
      primaryType: "Delegation",
      message: {},
    },
  };
}

// ============================================================================
// calculateProtocolFee() Tests
// ============================================================================

test("calculateProtocolFee: 0.5% of 1 MON = 0.005 MON", () => {
  const amount = parseEther("1.0");
  const fee = calculateProtocolFee(amount, 0.005);
  assert.equal(fee, parseEther("0.005"));
});

test("calculateProtocolFee: 0.5% of 0.1 MON = 0.0005 MON", () => {
  const amount = parseEther("0.1");
  const fee = calculateProtocolFee(amount, 0.005);
  assert.equal(fee, parseEther("0.0005"));
});

test("calculateProtocolFee: 0% fee returns 0", () => {
  const amount = parseEther("1.0");
  const fee = calculateProtocolFee(amount, 0);
  assert.equal(fee, 0n);
});

test("calculateProtocolFee: handles very small amounts correctly", () => {
  const amount = 1000n; // 1000 wei
  const fee = calculateProtocolFee(amount, 0.005); // 0.5%
  assert.equal(fee, 5n); // 5 wei
});

test("calculateProtocolFee: handles large amounts correctly", () => {
  const amount = parseEther("1000.0"); // 1000 MON
  const fee = calculateProtocolFee(amount, 0.005); // 0.5%
  assert.equal(fee, parseEther("5.0")); // 5 MON
});

test("calculateProtocolFee: different fee rates", () => {
  const amount = parseEther("1.0");

  const fee1 = calculateProtocolFee(amount, 0.001); // 0.1%
  assert.equal(fee1, parseEther("0.001"));

  const fee2 = calculateProtocolFee(amount, 0.01); // 1%
  assert.equal(fee2, parseEther("0.01"));

  const fee3 = calculateProtocolFee(amount, 0.1); // 10%
  assert.equal(fee3, parseEther("0.1"));
});

// ============================================================================
// requiresFee() Tests
// ============================================================================

test("requiresFee: returns true for operations with fees", () => {
  assert.equal(requiresFee("swap", PROTOCOL_FEES), true);
  assert.equal(requiresFee("nftBuy", PROTOCOL_FEES), true);
});

test("requiresFee: returns false for free operations", () => {
  assert.equal(requiresFee("stake", PROTOCOL_FEES), false);  // No fee on staking (to be decided)
  assert.equal(requiresFee("transfer", PROTOCOL_FEES), false);
  assert.equal(requiresFee("wrap", PROTOCOL_FEES), false);
  assert.equal(requiresFee("unwrap", PROTOCOL_FEES), false);
  assert.equal(requiresFee("nftSell", PROTOCOL_FEES), false);
  assert.equal(requiresFee("unstake", PROTOCOL_FEES), false);
});

test("requiresFee: handles unknown operation types", () => {
  assert.equal(requiresFee("unknown", PROTOCOL_FEES), false);
});

// ============================================================================
// addPragmaFeeEnforcer() Tests
// ============================================================================

test("addPragmaFeeEnforcer: adds caveat to delegation", () => {
  const mockDelegation = createMockDelegation();
  const feeAmount = parseEther("0.0005");

  const result = addPragmaFeeEnforcer(mockDelegation, {
    feeAmount,
    tokenAddress: MON_ADDRESS,
    isNative: true,
    sessionKey: SESSION_KEY,
  });

  // Check that caveat was added
  assert.equal(result.mainDelegation.delegation.caveats.length, 1);

  // Check caveat structure
  const caveat = result.mainDelegation.delegation.caveats[0];
  assert.equal(caveat.enforcer, PRAGMA_FEE_ENFORCER_ADDRESS);
  assert.equal(caveat.args, "0x"); // Initially empty

  // Check terms encoding (1 byte + 20 bytes + 32 bytes = 53 bytes)
  const expectedTerms = encodePacked(["uint8", "address", "uint256"], [1, MON_ADDRESS, feeAmount]);
  assert.equal(caveat.terms, expectedTerms);
});

test("addPragmaFeeEnforcer: returns correct caveat index", () => {
  const mockDelegation = createMockDelegation();

  // Add existing caveats
  mockDelegation.delegation.caveats.push({
    enforcer: "0x0000000000000000000000000000000000000003",
    terms: "0x",
    args: "0x",
  });

  const result = addPragmaFeeEnforcer(mockDelegation, {
    feeAmount: 100n,
    tokenAddress: MON_ADDRESS,
    isNative: true,
    sessionKey: SESSION_KEY,
  });

  // Fee enforcer should be at index 1 (after existing caveat)
  assert.equal(result.feeEnforcerCaveatIndex, 1);
  assert.equal(result.mainDelegation.delegation.caveats.length, 2);
});

test("addPragmaFeeEnforcer: createFeeAllowanceDelegation returns correct structure", () => {
  const mockDelegation = createMockDelegation();
  const feeAmount = parseEther("0.0005");

  const result = addPragmaFeeEnforcer(mockDelegation, {
    feeAmount,
    tokenAddress: MON_ADDRESS,
    isNative: true,
    sessionKey: SESSION_KEY,
  });

  // Create fee allowance delegation with mock hash
  const mockHash = "0x1234567890123456789012345678901234567890123456789012345678901234";
  const feeAllowance = result.createFeeAllowanceDelegation(mockHash);

  // Check structure
  assert.equal(feeAllowance.delegate, PRAGMA_FEE_ENFORCER_ADDRESS);
  assert.equal(feeAllowance.delegator, DELEGATOR);
  assert.equal(feeAllowance.authority, ROOT_AUTHORITY);
  assert.equal(feeAllowance.salt, "0x0000000000000000000000000000000000000000000000000000000000000000");
  assert.equal(feeAllowance.signature, "0x");

  // Check caveat
  assert.equal(feeAllowance.caveats.length, 1);
  assert.equal(feeAllowance.caveats[0].enforcer, ARGS_EQUALITY_CHECK_ENFORCER_ADDRESS);
  assert.equal(feeAllowance.caveats[0].args, "0x");

  // Check terms (delegationHash + sessionKey)
  const expectedTerms = encodePacked(["bytes32", "address"], [mockHash, SESSION_KEY]);
  assert.equal(feeAllowance.caveats[0].terms, expectedTerms);
});

test("addPragmaFeeEnforcer: updateMainDelegationArgs updates correct caveat", () => {
  const mockDelegation = createMockDelegation();
  const feeAmount = parseEther("0.0005");

  const result = addPragmaFeeEnforcer(mockDelegation, {
    feeAmount,
    tokenAddress: MON_ADDRESS,
    isNative: true,
    sessionKey: SESSION_KEY,
  });

  // Create and update with mock fee allowance
  const mockFeeAllowance = {
    delegate: PRAGMA_FEE_ENFORCER_ADDRESS,
    delegator: DELEGATOR,
    authority: ROOT_AUTHORITY,
    caveats: [],
    salt: "0x0000000000000000000000000000000000000000000000000000000000000000",
    signature: "0xabcd",
  };

  const initialArgs = result.mainDelegation.delegation.caveats[result.feeEnforcerCaveatIndex].args;
  assert.equal(initialArgs, "0x"); // Initially empty

  result.updateMainDelegationArgs(mockFeeAllowance);

  const updatedArgs = result.mainDelegation.delegation.caveats[result.feeEnforcerCaveatIndex].args;
  assert.notEqual(updatedArgs, "0x"); // Now populated
  assert.ok(updatedArgs.length > 10); // Has actual encoded data
});

test("addPragmaFeeEnforcer: handles ERC20 fees correctly", () => {
  const mockDelegation = createMockDelegation();
  const tokenAddress = "0x0000000000000000000000000000000000001234";
  const feeAmount = parseEther("0.01");

  const result = addPragmaFeeEnforcer(mockDelegation, {
    feeAmount,
    tokenAddress,
    isNative: false, // ERC20
    sessionKey: SESSION_KEY,
  });

  const caveat = result.mainDelegation.delegation.caveats[0];

  // Check terms encoding for ERC20 (isNative = 0)
  const expectedTerms = encodePacked(["uint8", "address", "uint256"], [0, tokenAddress, feeAmount]);
  assert.equal(caveat.terms, expectedTerms);
});

test("addPragmaFeeEnforcer: preserves original delegation properties", () => {
  const mockDelegation = createMockDelegation();
  const originalDelegate = mockDelegation.delegation.delegate;
  const originalDelegator = mockDelegation.delegation.delegator;

  addPragmaFeeEnforcer(mockDelegation, {
    feeAmount: 100n,
    tokenAddress: MON_ADDRESS,
    isNative: true,
    sessionKey: SESSION_KEY,
  });

  // Check original properties unchanged
  assert.equal(mockDelegation.delegation.delegate, originalDelegate);
  assert.equal(mockDelegation.delegation.delegator, originalDelegator);
});

// ============================================================================
// Edge Cases
// ============================================================================

test("calculateProtocolFee: handles zero amount", () => {
  const fee = calculateProtocolFee(0n, 0.005);
  assert.equal(fee, 0n);
});

test("calculateProtocolFee: precision test - no rounding errors", () => {
  // Test that 0.5% of various amounts doesn't lose precision
  const testCases = [
    { amount: 100n, expected: 0n }, // Too small - truncates to 0
    { amount: 1000n, expected: 5n }, // 0.5% of 1000 = 5
    { amount: 10000n, expected: 50n }, // 0.5% of 10000 = 50
    { amount: 100000n, expected: 500n }, // 0.5% of 100000 = 500
  ];

  testCases.forEach(({ amount, expected }) => {
    const fee = calculateProtocolFee(amount, 0.005);
    assert.equal(fee, expected);
  });
});
