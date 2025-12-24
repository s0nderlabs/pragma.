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
  NFTListResult,
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
  // Operation-specific gas functions (new)
  getMinBalanceForOperation,
  estimateGasForOperations,
  shouldFundForOperations,
  // Constants
  GAS_PER_OPERATION,
  MIN_SESSION_KEY_BALANCE,
  SESSION_KEY_FUNDING_AMOUNT,
  AVG_GAS_PER_OPERATION,
  BATCH_SAFETY_BUFFER,
} from "./sessionKeyManager.js";

// Re-export OperationType
export type { OperationType } from "./sessionKeyManager.js";

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
export { executeNFTBuy } from "./executeNFTBuy.js";
export { executeNFTTransfer } from "./executeNFTTransfer.js";
export { executeNFTList } from "./executeNFTList.js";

// Session Key Funding
export { fundSessionKeyViaUserOp } from "./sessionKeyFundingUserOp.js";

// Sync Transaction Utilities (EIP-7966)
export { createSyncTransport } from "./syncTransport.js";
export { waitForReceiptSync, sendAndWaitSync } from "./syncReceipt.js";

// Receipt Cache (for testing and debugging)
export {
  cacheReceipt,
  getReceipt,
  getAndRemoveReceipt,  // @deprecated - use getReceipt
  hasReceipt,
  getCacheStats,
  clearCache,
} from "./receiptCache.js";
