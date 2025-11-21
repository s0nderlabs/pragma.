/**
 * H2 Execution Layer
 *
 * Export all execution-related functionality
 */

// Types
export type {
  SessionKeyBalance,
  SessionKeyFundingConfig,
  SessionKeyFundingResult,
  SwapQuoteData,
  TransferQuoteData,
  WrapQuoteData,
  UnwrapQuoteData,
  H2ExecutionContext,
  ExecutionResult,
} from "./types.js";

// Errors
export {
  QuoteExpiredError,
  QuoteNotFoundError,
  InsufficientBalanceError,
  SessionKeyFundingError,
} from "./types.js";

// Session Key Manager
export {
  checkSessionKeyBalance,
  fundSessionKey,
  formatSessionKeyBalance,
  getSessionKeyFundingMessage,
  shouldFundForBatch,
  estimateGasForBatch,
  MIN_SESSION_KEY_BALANCE,
  SESSION_KEY_FUNDING_AMOUNT,
  AVG_GAS_PER_OPERATION,
  BATCH_SAFETY_BUFFER,
} from "./sessionKeyManager.js";

// Quote Store
export {
  generateQuoteId,
  storeSwapQuote,
  getSwapQuote,
  deleteSwapQuote,
  storeTransferQuote,
  getTransferQuote,
  deleteTransferQuote,
  storeWrapQuote,
  getWrapQuote,
  deleteWrapQuote,
  storeUnwrapQuote,
  getUnwrapQuote,
  deleteUnwrapQuote,
  clearAllQuotes,
  getQuoteStoreStats,
} from "./quoteStore.js";

// Execution Services
export { executeSwap } from "./executeSwap.js";
export { executeTransfer } from "./executeTransfer.js";
export { executeWrap } from "./executeWrap.js";
export { executeUnwrap } from "./executeUnwrap.js";

// Session Key Funding
export { fundSessionKeyViaUserOp } from "./sessionKeyFundingUserOp.js";
