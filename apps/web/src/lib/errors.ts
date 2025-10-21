/**
 * Shared Error Handling Utility
 *
 * Provides consistent, user-friendly error messages across the entire app.
 * Handles contract errors, infrastructure errors, and provides helpful guidance.
 */

/**
 * Parse an error into a user-friendly message with actionable guidance
 *
 * @param error - The error to parse (can be Error, object with message, or any value)
 * @returns User-friendly error message string
 *
 * @example
 * ```ts
 * try {
 *   await someOperation();
 * } catch (error) {
 *   const message = parseUserFriendlyError(error);
 *   setErrorState(message);
 * }
 * ```
 */
export const parseUserFriendlyError = (error: unknown): string => {
  // Extract raw error message
  let rawMessage = "";
  if (error instanceof Error && error.message) {
    rawMessage = error.message;
  } else if (typeof error === "object" && error !== null && "message" in error) {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === "string" && candidate.length > 0) {
      rawMessage = candidate;
    }
  } else {
    rawMessage = String(error);
  }

  // Transform specific contract revert errors into user-friendly messages
  if (rawMessage.includes("LimitedCallsEnforcer:limit-exceeded")) {
    return "Your delegation has run out of calls. Please open the Connected Account modal and reissue a new delegation with more calls or enable unlimited calls.";
  }

  if (rawMessage.includes("NonceEnforcer:invalid-nonce")) {
    return "Delegation nonce mismatch. This may happen if you've recently revoked delegations. Please try reissuing your delegation.";
  }

  if (rawMessage.includes("AllowedTargetsEnforcer:target-not-allowed")) {
    return "This transaction target is not allowed by your delegation. Please reissue with broader permissions.";
  }

  if (rawMessage.includes("AllowedMethodsEnforcer:method-not-allowed")) {
    return "This method is not allowed by your delegation. Please reissue your delegation with the required permissions.";
  }

  if (rawMessage.includes("ValueLte:value-too-high")) {
    return "Transaction value exceeds the delegation limit. Please reduce the amount or reissue with higher limits.";
  }

  // Handle generic revert with extracted reason
  const revertReasonMatch = rawMessage.match(/reverted with the following reason:\s*([^\n]+)/i);
  if (revertReasonMatch && revertReasonMatch[1]) {
    const reason = revertReasonMatch[1].trim();
    // If we haven't handled it above, return cleaned up reason
    return `Transaction reverted: ${reason}`;
  }

  // Handle user operation failures
  if (rawMessage.includes("UserOperation") && rawMessage.includes("failed")) {
    return "Transaction failed to execute. This may be due to insufficient gas, invalid parameters, or delegation restrictions. Please try again or reissue your delegation.";
  }

  // Handle RPC rate limiting (Alchemy, Infura, etc.)
  if (
    rawMessage.includes("compute units") ||
    rawMessage.includes("rate limit") ||
    rawMessage.includes("429")
  ) {
    return "Network provider is temporarily rate limited. Please wait a moment and try again.";
  }

  // Handle network/connection errors
  if (
    rawMessage.toLowerCase().includes("network") ||
    rawMessage.toLowerCase().includes("connection") ||
    rawMessage.includes("ECONNREFUSED")
  ) {
    return "Network connection issue. Please check your connection and try again.";
  }

  // Handle timeout errors
  if (rawMessage.toLowerCase().includes("timeout") || rawMessage.toLowerCase().includes("timed out")) {
    return "Request timed out. The network may be congested. Please try again.";
  }

  // Handle gas errors
  if (
    rawMessage.toLowerCase().includes("insufficient funds") ||
    rawMessage.toLowerCase().includes("gas required exceeds")
  ) {
    return "Insufficient funds for gas. Please add more ETH to your account.";
  }

  // Handle nonce errors (but not NonceEnforcer which is handled above)
  if (
    !rawMessage.includes("NonceEnforcer") &&
    (rawMessage.toLowerCase().includes("nonce too low") ||
      rawMessage.toLowerCase().includes("nonce too high"))
  ) {
    return "Transaction nonce conflict. Please try again or refresh the page.";
  }

  // Handle service unavailable
  if (rawMessage.includes("503") || rawMessage.toLowerCase().includes("service unavailable")) {
    return "Service temporarily unavailable. Please try again in a few moments.";
  }

  // Return raw message as fallback (but clean up common technical prefixes)
  return (
    rawMessage
      .replace(/^Error:\s*/i, "")
      .replace(/^ContractFunctionExecutionError:\s*/i, "")
      .replace(/^TransactionExecutionError:\s*/i, "")
      .trim() || "An unknown error occurred. Please try again."
  );
};
