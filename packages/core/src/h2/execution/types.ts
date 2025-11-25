/**
 * H2 Execution Layer Types
 *
 * Shared types for the H2 execution pipeline:
 * - Session key management
 * - Ephemeral delegation creation
 * - Transaction execution
 */

import type { Address, Hex, PublicClient, WalletClient } from "viem";
import type { Delegation } from "@metamask/delegation-toolkit";

// ============================================================================
// Session Key Types
// ============================================================================

/**
 * Session key balance information
 */
export interface SessionKeyBalance {
  /** Current balance in wei */
  balance: bigint;
  /** Whether funding is needed (balance < threshold) */
  needsFunding: boolean;
  /** Recommended amount to fund in wei (0.5 MON) */
  recommendedFundingAmount: bigint;
}

/**
 * Configuration for session key funding
 */
export interface SessionKeyFundingConfig {
  /** Smart account address (HybridDelegator) */
  smartAccountAddress: Address;
  /** Session key public address */
  sessionKeyAddress: Address;
  /** Session key private key (required for delegation-based refills) */
  sessionKeyPrivateKey?: Hex;
  /** Owner address (required for delegation-based refills) */
  ownerAddress?: Address;
  /** Chain ID (e.g., 10207 for Monad testnet) */
  chainId: number;
  /** RPC URL for the chain */
  rpcUrl: string;
  /** DelegationManager contract address */
  delegationManager: Address;
  /** Smart account instance from DTK (required for initial funding via UserOp) */
  smartAccount?: any;
  /** Bundler client (required for initial funding via UserOp) */
  bundlerClient?: any;
  // Note: sponsorUserOperationFn removed - session key funding is now self-paid (no paymaster)
}

/**
 * Result of session key funding operation
 */
export interface SessionKeyFundingResult {
  /** Transaction hash of the funding transaction */
  txHash: Hex;
  /** New balance after funding */
  newBalance: bigint;
  /** Amount that was funded */
  fundedAmount: bigint;
}

// ============================================================================
// Quote Types
// ============================================================================

/**
 * Swap quote data (stored for execution)
 */
export interface SwapQuoteData {
  /** Unique quote identifier */
  quoteId: string;
  /** From token address */
  fromToken: Address;
  /** To token address */
  toToken: Address;
  /** From token symbol */
  fromTokenSymbol: string;
  /** To token symbol */
  toTokenSymbol: string;
  /** From token decimals */
  fromTokenDecimals: number;
  /** To token decimals */
  toTokenDecimals: number;
  /** Input amount (formatted, e.g., "1.0") */
  amount: string;
  /** Input amount in wei */
  amountWei: bigint;
  /** User's slippage tolerance in basis points (e.g., 100 = 1%, max 1500 = 15%) */
  slippageBps: number;
  /** Raw Monorail quote response (subset of fields needed for execution) */
  monorailQuote: {
    aggregator: Address;
    transactionData: Hex;
    transactionValue: bigint;
    rawOutput: bigint;
    rawInput: bigint;
    rawMinOutput: bigint;
    quoteId: string;
    gasEstimate?: bigint;
  };
  /** Protocol fee amount in wei (charged on input amount) */
  protocolFeeAmount: bigint;
  /** Net swap amount in wei (input amount minus protocol fee) */
  netSwapAmount: bigint;
  /** Expected output amount in wei (full Monorail output, no fee subtracted) */
  expectedOutputWei: bigint;
  /** Expected output amount (formatted) */
  expectedOutput: string;
  /** Quote creation timestamp */
  createdAt: number;
  /** Quote expiry timestamp (createdAt + 5 minutes) */
  expiresAt: number;
  /** User address (smart account) */
  userAddress: Address;
}

/**
 * Transfer quote data (stored for execution)
 */
export interface TransferQuoteData {
  /** Unique quote identifier */
  quoteId: string;
  /** Token address */
  token: Address;
  /** Token symbol */
  tokenSymbol: string;
  /** Token decimals */
  tokenDecimals: number;
  /** Recipient address */
  recipient: Address;
  /** Amount (formatted, e.g., "100.0") */
  amount: string;
  /** Amount in wei */
  amountWei: bigint;
  /** Gas estimate in wei */
  gasEstimate: bigint;
  /** Quote creation timestamp */
  createdAt: number;
  /** Quote expiry timestamp */
  expiresAt: number;
  /** User address (smart account) */
  userAddress: Address;
}

/**
 * Wrap quote data (MON → WMON)
 */
export interface WrapQuoteData {
  /** Unique quote identifier */
  quoteId: string;
  /** Amount (formatted, e.g., "1.0") */
  amount: string;
  /** Amount in wei */
  amountWei: bigint;
  /** WMON contract address */
  wmonAddress: Address;
  /** Gas estimate in wei */
  gasEstimate: bigint;
  /** Quote creation timestamp */
  createdAt: number;
  /** Quote expiry timestamp */
  expiresAt: number;
  /** User address (smart account) */
  userAddress: Address;
}

/**
 * Unwrap quote data (WMON → MON)
 */
export interface UnwrapQuoteData {
  /** Unique quote identifier */
  quoteId: string;
  /** Amount (formatted, e.g., "1.0") */
  amount: string;
  /** Amount in wei */
  amountWei: bigint;
  /** WMON contract address */
  wmonAddress: Address;
  /** Gas estimate in wei */
  gasEstimate: bigint;
  /** Quote creation timestamp */
  createdAt: number;
  /** Quote expiry timestamp */
  expiresAt: number;
  /** User address (smart account) */
  userAddress: Address;
}

// ============================================================================
// Execution Types
// ============================================================================

/**
 * Execution context (available to execute tools via LangChain config)
 */
export interface H2ExecutionContext {
  /** Smart account address */
  userAddress: Address;
  /** Session key address */
  sessionKeyAddress: Address;
  /** Session key private key */
  sessionKeyPrivateKey: Hex;
  /** Owner address (Web3Auth/MetaMask) */
  ownerAddress: Address;
  /** Chain ID */
  chainId: number;
  /** Public client */
  publicClient: PublicClient;
  /** Wallet client (from Web3Auth bridge) */
  walletClient?: WalletClient;
  /** DelegationManager address */
  delegationManager: Address;
  /** Native token address (MON) */
  nativeTokenAddress: Address;
}

/**
 * Delegation metadata for activity tracking
 */
export interface DelegationMetadata {
  /** Smart account address (delegator) */
  delegator: Address;
  /** Session key address (delegate/executor) */
  sessionKey: Address;
  /** Delegation nonce (shared across batch) */
  nonce: bigint;
  /** Number of delegations created (1-4 depending on operation) */
  delegationCount: number;
  /** Types of delegations created (e.g., ["approve", "swap"]) */
  delegationTypes: string[];
  /** Delegation expiry timestamp (Unix seconds) */
  expiresAt: number;
  /** Whether protocol fee enforcer was used */
  feeEnforced?: boolean;
  /** Optional: Delegation hashes from DelegationManager */
  delegationHashes?: Hex[];
}

/**
 * Result of transaction execution
 */
export interface ExecutionResult {
  /** Transaction hash */
  txHash: Hex;
  /** Block number */
  blockNumber: bigint;
  /** Gas used */
  gasUsed: bigint;
  /** Status: 'success' (tx succeeded), 'reverted' (tx reverted), or 'failed' (tx succeeded but business logic failed) */
  status: "success" | "reverted" | "failed";
  /** Actual output amount (for swaps, transfers) */
  actualOutput?: bigint;
  /** Formatted output amount */
  actualOutputFormatted?: string;

  // Token metadata (for activity display)
  /** From token symbol (e.g., "USDC") */
  fromToken?: string;
  /** To token symbol (e.g., "MON") */
  toToken?: string;
  /** From amount (formatted, e.g., "1.0") */
  fromAmount?: string;

  // Delegation metadata (for activity tracking)
  /** Delegation information for this execution */
  delegationMetadata?: DelegationMetadata;
}

// ============================================================================
// Error Types
// ============================================================================

export class QuoteExpiredError extends Error {
  constructor(quoteId: string) {
    super(`Quote ${quoteId} has expired. Please request a new quote.`);
    this.name = "QuoteExpiredError";
  }
}

export class QuoteNotFoundError extends Error {
  constructor(quoteId: string) {
    super(`Quote ${quoteId} not found. Please request a quote first.`);
    this.name = "QuoteNotFoundError";
  }
}

export class InsufficientBalanceError extends Error {
  constructor(token: string, required: string, available: string) {
    super(`Insufficient ${token} balance. Required: ${required}, Available: ${available}`);
    this.name = "InsufficientBalanceError";
  }
}

export class SessionKeyFundingError extends Error {
  constructor(message: string) {
    super(`Session key funding failed: ${message}`);
    this.name = "SessionKeyFundingError";
  }
}
