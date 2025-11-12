/**
 * H2 Quote Store
 *
 * In-memory storage for swap and transfer quotes.
 * Quotes are stored temporarily (5 min expiry) between quote and execution phases.
 *
 * This is a simple in-memory store for the H2 CLI REPL.
 * Quotes are automatically cleaned up after expiry.
 */

import { randomBytes } from "node:crypto";
import type { SwapQuoteData, TransferQuoteData, WrapQuoteData, UnwrapQuoteData } from "./types.js";
import { QuoteExpiredError, QuoteNotFoundError } from "./types.js";

// ============================================================================
// In-Memory Store
// ============================================================================

/**
 * In-memory quote storage
 * Key: quoteId, Value: quote data
 */
const swapQuotes = new Map<string, SwapQuoteData>();
const transferQuotes = new Map<string, TransferQuoteData>();
const wrapQuotes = new Map<string, WrapQuoteData>();
const unwrapQuotes = new Map<string, UnwrapQuoteData>();

/**
 * Quote expiry time in milliseconds (10 minutes)
 * Extended to support multi-turn confirmations in normal mode
 */
const QUOTE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// Swap Quotes
// ============================================================================

/**
 * Generate a unique quote ID
 */
export function generateQuoteId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Store a swap quote
 * @param quote - Swap quote data
 * @returns Quote ID
 */
export function storeSwapQuote(quote: SwapQuoteData): string {
  swapQuotes.set(quote.quoteId, quote);

  // Auto-cleanup after expiry
  setTimeout(() => {
    swapQuotes.delete(quote.quoteId);
  }, QUOTE_EXPIRY_MS);

  return quote.quoteId;
}

/**
 * Retrieve a swap quote
 * @param quoteId - Quote ID
 * @returns Swap quote data
 * @throws {QuoteNotFoundError} If quote not found
 * @throws {QuoteExpiredError} If quote expired
 */
export function getSwapQuote(quoteId: string): SwapQuoteData {
  const quote = swapQuotes.get(quoteId);

  if (!quote) {
    throw new QuoteNotFoundError(quoteId);
  }

  // Check expiry
  const now = Date.now();
  if (now > quote.expiresAt) {
    swapQuotes.delete(quoteId);
    throw new QuoteExpiredError(quoteId);
  }

  return quote;
}

/**
 * Delete a swap quote (after execution or cancellation)
 */
export function deleteSwapQuote(quoteId: string): void {
  swapQuotes.delete(quoteId);
}

// ============================================================================
// Transfer Quotes
// ============================================================================

/**
 * Store a transfer quote
 */
export function storeTransferQuote(quote: TransferQuoteData): string {
  transferQuotes.set(quote.quoteId, quote);

  // Auto-cleanup after expiry
  setTimeout(() => {
    transferQuotes.delete(quote.quoteId);
  }, QUOTE_EXPIRY_MS);

  return quote.quoteId;
}

/**
 * Retrieve a transfer quote
 * @throws {QuoteNotFoundError} If quote not found
 * @throws {QuoteExpiredError} If quote expired
 */
export function getTransferQuote(quoteId: string): TransferQuoteData {
  const quote = transferQuotes.get(quoteId);

  if (!quote) {
    throw new QuoteNotFoundError(quoteId);
  }

  // Check expiry
  const now = Date.now();
  if (now > quote.expiresAt) {
    transferQuotes.delete(quoteId);
    throw new QuoteExpiredError(quoteId);
  }

  return quote;
}

/**
 * Delete a transfer quote
 */
export function deleteTransferQuote(quoteId: string): void {
  transferQuotes.delete(quoteId);
}

// ============================================================================
// Wrap Quotes
// ============================================================================

/**
 * Store a wrap quote (auto-expires after 5 minutes)
 */
export function storeWrapQuote(quote: WrapQuoteData): string {
  wrapQuotes.set(quote.quoteId, quote);

  // Auto-delete after expiry
  setTimeout(() => {
    wrapQuotes.delete(quote.quoteId);
  }, QUOTE_EXPIRY_MS);

  return quote.quoteId;
}

/**
 * Retrieve a wrap quote
 * @throws {QuoteNotFoundError} If quote not found
 * @throws {QuoteExpiredError} If quote expired
 */
export function getWrapQuote(quoteId: string): WrapQuoteData {
  const quote = wrapQuotes.get(quoteId);

  if (!quote) {
    throw new QuoteNotFoundError(quoteId);
  }

  // Check expiry
  const now = Date.now();
  if (now > quote.expiresAt) {
    wrapQuotes.delete(quoteId);
    throw new QuoteExpiredError(quoteId);
  }

  return quote;
}

/**
 * Delete a wrap quote
 */
export function deleteWrapQuote(quoteId: string): void {
  wrapQuotes.delete(quoteId);
}

// ============================================================================
// Unwrap Quotes
// ============================================================================

/**
 * Store an unwrap quote (auto-expires after 5 minutes)
 */
export function storeUnwrapQuote(quote: UnwrapQuoteData): string {
  unwrapQuotes.set(quote.quoteId, quote);

  // Auto-delete after expiry
  setTimeout(() => {
    unwrapQuotes.delete(quote.quoteId);
  }, QUOTE_EXPIRY_MS);

  return quote.quoteId;
}

/**
 * Retrieve an unwrap quote
 * @throws {QuoteNotFoundError} If quote not found
 * @throws {QuoteExpiredError} If quote expired
 */
export function getUnwrapQuote(quoteId: string): UnwrapQuoteData {
  const quote = unwrapQuotes.get(quoteId);

  if (!quote) {
    throw new QuoteNotFoundError(quoteId);
  }

  // Check expiry
  const now = Date.now();
  if (now > quote.expiresAt) {
    unwrapQuotes.delete(quoteId);
    throw new QuoteExpiredError(quoteId);
  }

  return quote;
}

/**
 * Delete an unwrap quote
 */
export function deleteUnwrapQuote(quoteId: string): void {
  unwrapQuotes.delete(quoteId);
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Clear all stored quotes (for testing or session reset)
 */
export function clearAllQuotes(): void {
  swapQuotes.clear();
  transferQuotes.clear();
  wrapQuotes.clear();
  unwrapQuotes.clear();
}

/**
 * Get quote store statistics (for debugging)
 */
export function getQuoteStoreStats() {
  return {
    swapQuotes: swapQuotes.size,
    transferQuotes: transferQuotes.size,
    wrapQuotes: wrapQuotes.size,
    unwrapQuotes: unwrapQuotes.size,
    total: swapQuotes.size + transferQuotes.size + wrapQuotes.size + unwrapQuotes.size,
  };
}
