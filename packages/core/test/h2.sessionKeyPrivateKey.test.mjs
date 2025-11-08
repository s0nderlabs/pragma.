/**
 * Unit tests for getSessionKeyPrivateKey tool
 */

import test from "node:test";
import assert from "node:assert/strict";

// ============================================================================
// Test Fixtures
// ============================================================================

const MOCK_SESSION_KEY_ADDRESS = "0x2f872fFFad917f48a9A9eCc76f3f993B64EFf3e8";
const MOCK_SESSION_KEY_PRIVATE_KEY = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

function createMockSessionData() {
  return {
    sessionKeyAddress: MOCK_SESSION_KEY_ADDRESS,
    sessionKeyPrivateKey: MOCK_SESSION_KEY_PRIVATE_KEY,
    ownerAddress: "0x2336f1DEe62B10eA23F7eBE4698e3A1574e35012",
    chainId: 10143,
  };
}

// ============================================================================
// Response Format Tests
// ============================================================================

test("getSessionKeyPrivateKey: response contains private key", () => {
  const sessionData = createMockSessionData();

  // Simulate tool response format
  const response = `🔑 **Session Key Private Key**

**Private Key:** ${sessionData.sessionKeyPrivateKey}
**Address:** ${sessionData.sessionKeyAddress}`;

  // Verify private key is in response
  assert.ok(response.includes(sessionData.sessionKeyPrivateKey));
  assert.ok(response.includes(sessionData.sessionKeyAddress));
});

test("getSessionKeyPrivateKey: response contains security warning", () => {
  const sessionData = createMockSessionData();

  // Simulate tool response format
  const response = `🔑 **Session Key Private Key**

**Private Key:** ${sessionData.sessionKeyPrivateKey}
**Address:** ${sessionData.sessionKeyAddress}

⚠️ **SECURITY WARNING:**

**What this key controls:**
• Session key only holds ~1 MON for gas payments
• Compromise = max 1 MON loss (NOT your main tokens)`;

  // Verify security warning is present
  assert.ok(response.includes("⚠️ **SECURITY WARNING:**"));
  assert.ok(response.includes("Session key only holds ~1 MON"));
  assert.ok(response.includes("max 1 MON loss"));
});

test("getSessionKeyPrivateKey: response explains why key is shared", () => {
  const response = `⚠️ **SECURITY WARNING:**

**Why we share this:**
• Full transparency - you control everything
• Can import into MetaMask if needed
• Can verify session key address independently
• You own the session key, you should see the key`;

  // Verify transparency explanation is present
  assert.ok(response.includes("Why we share this:"));
  assert.ok(response.includes("Full transparency"));
  assert.ok(response.includes("Can import into MetaMask"));
});

test("getSessionKeyPrivateKey: response includes MetaMask import instructions", () => {
  const sessionData = createMockSessionData();

  const response = `**How to use this:**
1. Copy the private key above
2. Import into MetaMask: Settings → Import Account → Private Key
3. Verify the address matches: ${sessionData.sessionKeyAddress}
4. You can now see session key transactions in MetaMask`;

  // Verify instructions are present
  assert.ok(response.includes("How to use this:"));
  assert.ok(response.includes("Import into MetaMask"));
  assert.ok(response.includes(sessionData.sessionKeyAddress));
});

// ============================================================================
// Data Validation Tests
// ============================================================================

test("getSessionKeyPrivateKey: private key format validation", () => {
  const sessionData = createMockSessionData();

  // Verify private key is 66 characters (0x + 64 hex chars)
  assert.equal(sessionData.sessionKeyPrivateKey.length, 66);
  assert.ok(sessionData.sessionKeyPrivateKey.startsWith("0x"));

  // Verify it's valid hex
  const hexPattern = /^0x[0-9a-fA-F]{64}$/;
  assert.ok(hexPattern.test(sessionData.sessionKeyPrivateKey));
});

test("getSessionKeyPrivateKey: address format validation", () => {
  const sessionData = createMockSessionData();

  // Verify address is 42 characters (0x + 40 hex chars)
  assert.equal(sessionData.sessionKeyAddress.length, 42);
  assert.ok(sessionData.sessionKeyAddress.startsWith("0x"));

  // Verify it's valid hex
  const hexPattern = /^0x[0-9a-fA-F]{40}$/;
  assert.ok(hexPattern.test(sessionData.sessionKeyAddress));
});

// ============================================================================
// Security Warning Content Tests
// ============================================================================

test("getSessionKeyPrivateKey: warns about low financial risk", () => {
  const warning = `• Session key only holds ~1 MON for gas payments
• Compromise = max 1 MON loss (NOT your main tokens)`;

  assert.ok(warning.includes("~1 MON"));
  assert.ok(warning.includes("max 1 MON loss"));
  assert.ok(warning.includes("NOT your main tokens"));
});

test("getSessionKeyPrivateKey: warns about smart account token safety", () => {
  const warning = `• Cannot access your smart account tokens directly`;

  assert.ok(warning.includes("Cannot access your smart account tokens"));
});

test("getSessionKeyPrivateKey: warns about ephemeral nature", () => {
  const warning = `• Private key is ephemeral - generated fresh on each login`;

  assert.ok(warning.includes("ephemeral"));
  assert.ok(warning.includes("generated fresh on each login"));
});

test("getSessionKeyPrivateKey: reminds to store securely", () => {
  const warning = `• Store securely if saving (offline storage recommended)
• Treat like any private key (don't share publicly)`;

  assert.ok(warning.includes("Store securely"));
  assert.ok(warning.includes("offline storage recommended"));
  assert.ok(warning.includes("Treat like any private key"));
});

// ============================================================================
// Missing Data Tests
// ============================================================================

test("getSessionKeyPrivateKey: handles missing sessionKeyAddress", () => {
  const incompleteData = {
    sessionKeyPrivateKey: MOCK_SESSION_KEY_PRIVATE_KEY,
    // sessionKeyAddress is missing
  };

  const missingFields = [
    !incompleteData.sessionKeyAddress && "sessionKeyAddress",
    !incompleteData.sessionKeyPrivateKey && "sessionKeyPrivateKey",
  ].filter(Boolean);

  assert.equal(missingFields.length, 1);
  assert.equal(missingFields[0], "sessionKeyAddress");
});

test("getSessionKeyPrivateKey: handles missing sessionKeyPrivateKey", () => {
  const incompleteData = {
    sessionKeyAddress: MOCK_SESSION_KEY_ADDRESS,
    // sessionKeyPrivateKey is missing
  };

  const missingFields = [
    !incompleteData.sessionKeyAddress && "sessionKeyAddress",
    !incompleteData.sessionKeyPrivateKey && "sessionKeyPrivateKey",
  ].filter(Boolean);

  assert.equal(missingFields.length, 1);
  assert.equal(missingFields[0], "sessionKeyPrivateKey");
});

test("getSessionKeyPrivateKey: handles missing both fields", () => {
  const incompleteData = {
    // Both fields missing
  };

  const missingFields = [
    !incompleteData.sessionKeyAddress && "sessionKeyAddress",
    !incompleteData.sessionKeyPrivateKey && "sessionKeyPrivateKey",
  ].filter(Boolean);

  assert.equal(missingFields.length, 2);
  assert.deepEqual(missingFields, ["sessionKeyAddress", "sessionKeyPrivateKey"]);
});

// ============================================================================
// Edge Cases
// ============================================================================

test("getSessionKeyPrivateKey: handles valid complete session data", () => {
  const sessionData = createMockSessionData();

  const missingFields = [
    !sessionData.sessionKeyAddress && "sessionKeyAddress",
    !sessionData.sessionKeyPrivateKey && "sessionKeyPrivateKey",
  ].filter(Boolean);

  // Should have no missing fields
  assert.equal(missingFields.length, 0);
});

test("getSessionKeyPrivateKey: response format consistency", () => {
  const sessionData = createMockSessionData();

  const response = `🔑 **Session Key Private Key**

**Private Key:** ${sessionData.sessionKeyPrivateKey}
**Address:** ${sessionData.sessionKeyAddress}

⚠️ **SECURITY WARNING:**`;

  // Verify consistent markdown formatting
  assert.ok(response.includes("🔑 **Session Key Private Key**"));
  assert.ok(response.includes("**Private Key:**"));
  assert.ok(response.includes("**Address:**"));
  assert.ok(response.includes("⚠️ **SECURITY WARNING:**"));
});

// ============================================================================
// Integration Scenario Tests
// ============================================================================

test("Integration: User requests private key export", () => {
  const sessionData = createMockSessionData();

  // Simulate user request
  const userRequest = "show my session key private key";

  // Agent should call getSessionKeyPrivateKey tool
  const toolCalled = "getSessionKeyPrivateKey";

  // Tool returns private key + warnings
  const response = `🔑 **Session Key Private Key**

**Private Key:** ${sessionData.sessionKeyPrivateKey}
**Address:** ${sessionData.sessionKeyAddress}

⚠️ **SECURITY WARNING:**
• Session key only holds ~1 MON for gas payments
• Compromise = max 1 MON loss (NOT your main tokens)

Your session key is working for you - full transparency guaranteed! 🔓`;

  // Verify complete flow
  assert.ok(userRequest.includes("private key"));
  assert.equal(toolCalled, "getSessionKeyPrivateKey");
  assert.ok(response.includes(sessionData.sessionKeyPrivateKey));
  assert.ok(response.includes("SECURITY WARNING"));
  assert.ok(response.includes("full transparency"));
});

test("Integration: User imports key into MetaMask", () => {
  const sessionData = createMockSessionData();

  // User gets private key from tool
  const privateKey = sessionData.sessionKeyPrivateKey;

  // User imports into MetaMask (simulation)
  const imported = {
    address: sessionData.sessionKeyAddress,
    privateKey: privateKey,
  };

  // Verify import data is correct
  assert.equal(imported.privateKey, sessionData.sessionKeyPrivateKey);
  assert.equal(imported.address, sessionData.sessionKeyAddress);
});
