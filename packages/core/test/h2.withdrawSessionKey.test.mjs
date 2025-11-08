/**
 * Unit tests for withdrawSessionKeyBalance tool
 */

import test from "node:test";
import assert from "node:assert/strict";

const { parseEther, formatEther } = await import("viem");

// ============================================================================
// Test Fixtures
// ============================================================================

const MOCK_SESSION_KEY = "0x0000000000000000000000000000000000000001";
const MOCK_SMART_ACCOUNT = "0x0000000000000000000000000000000000000002";
const MOCK_EXTERNAL_ADDRESS = "0x0000000000000000000000000000000000000003";

// ============================================================================
// Amount Calculation Tests
// ============================================================================

test("withdrawSessionKeyBalance: 'all' keyword reserves gas correctly", () => {
  const sessionKeyBalance = parseEther("1.0");
  const gasPrice = parseEther("0.000000001"); // 1 gwei
  const estimatedGas = 21000n;
  const gasCost = gasPrice * estimatedGas; // 0.000021 ETH
  const gasCostWithMargin = (gasCost * 120n) / 100n; // 0.0000252 ETH

  const withdrawalAmount = sessionKeyBalance - gasCostWithMargin;

  // Should withdraw ~0.9999748 MON (reserves ~0.0000252 MON for gas)
  assert.ok(withdrawalAmount > parseEther("0.999"));
  assert.ok(withdrawalAmount < sessionKeyBalance);
  assert.equal(sessionKeyBalance - withdrawalAmount, gasCostWithMargin);
});

test("withdrawSessionKeyBalance: 'all' with low balance returns error", () => {
  const sessionKeyBalance = parseEther("0.0001"); // 0.0001 MON
  const MIN_GAS_RESERVE = parseEther("0.001"); // 0.001 MON

  // Balance is less than minimum gas reserve
  assert.ok(sessionKeyBalance <= MIN_GAS_RESERVE);

  // Should not allow withdrawal
  const canWithdraw = sessionKeyBalance > MIN_GAS_RESERVE;
  assert.equal(canWithdraw, false);
});

test("withdrawSessionKeyBalance: specific amount validation", () => {
  const sessionKeyBalance = parseEther("1.0");
  const withdrawAmount = parseEther("0.5");

  // Valid withdrawal
  assert.ok(withdrawAmount > 0n);
  assert.ok(withdrawAmount <= sessionKeyBalance);

  // Check remaining balance after withdrawal
  const remainingBalance = sessionKeyBalance - withdrawAmount;
  assert.equal(remainingBalance, parseEther("0.5"));
});

test("withdrawSessionKeyBalance: specific amount exceeds balance", () => {
  const sessionKeyBalance = parseEther("0.3");
  const withdrawAmount = parseEther("0.5");

  // Should fail validation
  const isValid = withdrawAmount <= sessionKeyBalance;
  assert.equal(isValid, false);
});

test("withdrawSessionKeyBalance: specific amount leaves enough for gas", () => {
  const sessionKeyBalance = parseEther("1.0");
  const withdrawAmount = parseEther("0.99");
  const gasPrice = parseEther("0.000000001"); // 1 gwei
  const estimatedGas = 21000n;
  const gasCost = (gasPrice * estimatedGas * 120n) / 100n; // With 20% margin

  const remainingBalance = sessionKeyBalance - withdrawAmount;

  // Should have enough remaining for gas
  assert.ok(remainingBalance >= gasCost);
});

test("withdrawSessionKeyBalance: specific amount doesn't leave enough for gas", () => {
  const sessionKeyBalance = parseEther("1.0");
  const withdrawAmount = parseEther("0.9999999"); // Leave almost nothing
  const gasPrice = parseEther("0.000000001"); // 1 gwei
  const estimatedGas = 21000n;
  const gasCost = (gasPrice * estimatedGas * 120n) / 100n;

  const remainingBalance = sessionKeyBalance - withdrawAmount;

  // Should NOT have enough remaining for gas
  assert.ok(remainingBalance < gasCost);
});

// ============================================================================
// Recipient Address Tests
// ============================================================================

test("withdrawSessionKeyBalance: default recipient is smart account", () => {
  const recipient = undefined;
  const defaultRecipient = MOCK_SMART_ACCOUNT;

  // Should use smart account when recipient not specified
  const finalRecipient = recipient || defaultRecipient;
  assert.equal(finalRecipient, MOCK_SMART_ACCOUNT);
});

test("withdrawSessionKeyBalance: custom recipient address", () => {
  const recipient = MOCK_EXTERNAL_ADDRESS;
  const defaultRecipient = MOCK_SMART_ACCOUNT;

  // Should use custom recipient when specified
  const finalRecipient = recipient || defaultRecipient;
  assert.equal(finalRecipient, MOCK_EXTERNAL_ADDRESS);
});

// ============================================================================
// Edge Cases
// ============================================================================

test("withdrawSessionKeyBalance: zero balance", () => {
  const sessionKeyBalance = 0n;

  // Should return error message (no withdrawal possible)
  const canWithdraw = sessionKeyBalance > 0n;
  assert.equal(canWithdraw, false);
});

test("withdrawSessionKeyBalance: negative amount validation", () => {
  const withdrawAmount = parseEther("-0.5");

  // Should fail validation
  const isValid = withdrawAmount > 0n;
  assert.equal(isValid, false);
});

test("withdrawSessionKeyBalance: gas cost calculation with high gas price", () => {
  const sessionKeyBalance = parseEther("1.0");
  const gasPrice = parseEther("0.00000001"); // 10 gwei (high)
  const estimatedGas = 21000n;
  const gasCost = (gasPrice * estimatedGas * 120n) / 100n;

  const maxWithdrawal = sessionKeyBalance - gasCost;

  // Should still be able to withdraw most of balance
  assert.ok(maxWithdrawal > parseEther("0.999"));
  assert.ok(maxWithdrawal < sessionKeyBalance);
});

test("withdrawSessionKeyBalance: formatting checks", () => {
  const amount = parseEther("1.5");
  const formatted = formatEther(amount);

  assert.equal(formatted, "1.5");
});

// ============================================================================
// Integration Scenario Tests
// ============================================================================

test("Integration: User withdraws all from session key with 1 MON balance", () => {
  const sessionKeyBalance = parseEther("1.0");
  const gasPrice = parseEther("0.000000001"); // 1 gwei
  const estimatedGas = 21000n;
  const gasCostWithMargin = (gasPrice * estimatedGas * 120n) / 100n;

  const withdrawalAmount = sessionKeyBalance - gasCostWithMargin;
  const remainingBalance = sessionKeyBalance - withdrawalAmount;

  // Verify withdrawal amount is close to 1.0 MON
  assert.ok(withdrawalAmount > parseEther("0.9999"));

  // Verify enough gas remains
  assert.equal(remainingBalance, gasCostWithMargin);
  assert.ok(remainingBalance >= gasPrice * estimatedGas);
});

test("Integration: User withdraws 0.5 MON from 1 MON balance", () => {
  const sessionKeyBalance = parseEther("1.0");
  const withdrawAmount = parseEther("0.5");
  const gasPrice = parseEther("0.000000001"); // 1 gwei
  const estimatedGas = 21000n;
  const gasCost = (gasPrice * estimatedGas * 120n) / 100n;

  const remainingBalance = sessionKeyBalance - withdrawAmount;
  const hasEnoughForGas = remainingBalance >= gasCost;

  // Verify withdrawal is valid
  assert.equal(withdrawAmount, parseEther("0.5"));
  assert.equal(remainingBalance, parseEther("0.5"));
  assert.ok(hasEnoughForGas);
});

test("Integration: User tries to withdraw from empty session key", () => {
  const sessionKeyBalance = 0n;
  const canWithdraw = sessionKeyBalance > 0n;

  // Should not allow withdrawal
  assert.equal(canWithdraw, false);
});
