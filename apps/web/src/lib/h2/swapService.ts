/**
 * H2 Swap Service (Phase 1 - Simplified)
 *
 * Handles the swap workflow: Quote → Delegation → Execute
 *
 * Phase 1 Scope:
 * - Fetch Monorail quote
 * - Create ephemeral delegation
 * - Sign with Web3Auth
 * - Mock execution (for testing)
 *
 * Future Phases:
 * - Real DTK execution
 * - Multi-step support
 * - Real-time status updates
 */

import { Address, getAddress, formatUnits, parseEther } from 'viem'
import type { WalletClient } from 'viem'
import { getDeleGatorEnvironment } from '@metamask/delegation-toolkit'
import {
  fetchMonorailQuote,
  type QuoteRequestParams,
  type MonorailQuote,
} from '@pragma/core/monorail/pathfinder'
import {
  createEphemeralDelegation,
  type EphemeralDelegationContext,
  type EphemeralDelegationResult,
} from '@pragma/core/h2/delegation/ephemeral'
import {
  MONAD_CHAIN_ID,
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONORAIL_AGGREGATOR_ADDRESS,
} from '../config'

// Get DelegationManager address from DTK environment
const dtkEnvironment = getDeleGatorEnvironment(MONAD_CHAIN_ID)
const DELEGATION_MANAGER_ADDRESS = dtkEnvironment.DelegationManager as Address

// ============================================================================
// Types
// ============================================================================

export interface SwapQuoteRequest {
  fromToken: Address
  toToken: Address
  amount: string // Decimal string (e.g., "1.0")
  userAddress: Address
  slippageBps?: number
}

export interface SwapQuoteResponse {
  quote: MonorailQuote
  protocolFeeFormatted: string
  fromTokenSymbol: string
  toTokenSymbol: string
}

export interface DelegationCreationRequest {
  quote: MonorailQuote
  hybridDelegator: Address
  sessionKey: Address
  nonce: bigint
  fromToken: Address
  toToken: Address
  walletClient: WalletClient
}

export interface DelegationCreationResponse {
  delegation: EphemeralDelegationResult
  signature: `0x${string}`
}

export interface SwapExecutionRequest {
  quote: MonorailQuote
  delegation: EphemeralDelegationResult
  signature: `0x${string}`
  sessionKey: Address
}

export interface SwapExecutionResponse {
  txHash: `0x${string}`
  success: boolean
}

// ============================================================================
// Constants
// ============================================================================

const PROTOCOL_FEE_BPS = 50 // 0.5% = 50 basis points

const MONORAIL_CONFIG = {
  appId: process.env.NEXT_PUBLIC_MONORAIL_APP_ID || 'pragma-h2',
  pathfinderUrl: process.env.NEXT_PUBLIC_MONORAIL_PATHFINDER_URL || 'https://testnet-pathfinder.monorail.xyz/v4',
  aggregatorAddress: getAddress(MONORAIL_AGGREGATOR_ADDRESS),
  apiKey: process.env.NEXT_PUBLIC_MONORAIL_API_KEY,
}

// ============================================================================
// Quote Service
// ============================================================================

/**
 * Fetch swap quote from Monorail
 *
 * @param request - Quote request parameters
 * @returns Quote with formatted protocol fee
 */
export const fetchSwapQuote = async (
  request: SwapQuoteRequest
): Promise<SwapQuoteResponse> => {
  const { fromToken, toToken, amount, userAddress, slippageBps } = request

  const quoteParams: QuoteRequestParams = {
    fromToken,
    toToken,
    amountDecimal: amount,
    sender: userAddress,
    destination: userAddress,
    maxSlippageBps: slippageBps || 100, // Default 1% slippage
  }

  const quote = await fetchMonorailQuote(quoteParams, MONORAIL_CONFIG)

  // Calculate protocol fee (0.5% of output)
  const protocolFeeAmount = (quote.rawOutput * BigInt(PROTOCOL_FEE_BPS)) / BigInt(10000)

  // Format protocol fee for display
  // TODO: Get actual token decimals from allowlist
  const protocolFeeFormatted = formatUnits(protocolFeeAmount, 18) // Assuming 18 decimals

  return {
    quote,
    protocolFeeFormatted,
    fromTokenSymbol: 'MON', // TODO: Get from token metadata
    toTokenSymbol: 'USDC', // TODO: Get from token metadata
  }
}

// ============================================================================
// Delegation Service
// ============================================================================

/**
 * Create ephemeral delegation from quote
 *
 * @param request - Delegation creation parameters
 * @returns Signed delegation ready for execution
 */
export const createSwapDelegation = async (
  request: DelegationCreationRequest
): Promise<DelegationCreationResponse> => {
  const {
    quote,
    hybridDelegator,
    sessionKey,
    nonce,
    fromToken,
    toToken,
    walletClient,
  } = request

  // Create ephemeral delegation context
  const context: EphemeralDelegationContext = {
    quote,
    delegator: hybridDelegator,
    sessionKey,
    nonce,
    chainId: MONAD_CHAIN_ID,
    delegationManager: getAddress(DELEGATION_MANAGER_ADDRESS),
    fromToken,
    toToken,
    nativeTokenAddress: getAddress(MONAD_NATIVE_TOKEN_ADDRESS),
    currentAllowance: 0n, // TODO: Implement allowance check in web
    requiredAmount: 0n,
  }

  // Create unsigned delegation
  const delegation = createEphemeralDelegation(context)

  // Sign with Web3Auth (must include account)
  const signature = await walletClient.signTypedData({
    ...delegation.typedData,
    account: hybridDelegator,
  })

  return {
    delegation,
    signature,
  }
}

// ============================================================================
// Execution Service (Phase 1 - Mock)
// ============================================================================

/**
 * Execute swap transaction (PHASE 1 MOCK)
 *
 * Phase 1: Returns mock transaction hash for testing
 * Future: Real DTK execution with redeemDelegations
 *
 * @param request - Execution parameters
 * @returns Mock transaction result
 */
export const executeSwap = async (
  request: SwapExecutionRequest
): Promise<SwapExecutionResponse> => {
  const { quote, delegation, signature, sessionKey } = request

  console.log('[Phase 1 Mock] Would execute swap:', {
    quoteId: quote.quoteId,
    sessionKey,
    delegationExpiry: new Date(delegation.expiresAt * 1000).toISOString(),
    requiresApprove: delegation.requiresApprove,
    signature,
  })

  // Phase 1: Mock execution
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 2000))

  // Mock transaction hash
  const mockTxHash = `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}` as `0x${string}`

  console.log('[Phase 1 Mock] Transaction executed:', mockTxHash)

  return {
    txHash: mockTxHash,
    success: true,
  }
}

// ============================================================================
// Full Swap Flow (Helper)
// ============================================================================

export interface FullSwapRequest {
  fromToken: Address
  toToken: Address
  amount: string
  userAddress: Address
  hybridDelegator: Address
  sessionKey: Address
  nonce: bigint
  walletClient: WalletClient
  slippageBps?: number
}

export interface FullSwapResponse {
  quote: MonorailQuote
  txHash: `0x${string}`
}

/**
 * Execute full swap flow: Quote → Delegation → Execute
 *
 * This is a helper that combines all steps for testing.
 * In production, each step would be called separately with UI updates.
 *
 * @param request - Full swap parameters
 * @returns Quote and transaction hash
 */
export const executeFullSwap = async (
  request: FullSwapRequest
): Promise<FullSwapResponse> => {
  // Step 1: Fetch quote
  const quoteResponse = await fetchSwapQuote({
    fromToken: request.fromToken,
    toToken: request.toToken,
    amount: request.amount,
    userAddress: request.userAddress,
    slippageBps: request.slippageBps,
  })

  // Step 2: Create delegation
  const delegationResponse = await createSwapDelegation({
    quote: quoteResponse.quote,
    hybridDelegator: request.hybridDelegator,
    sessionKey: request.sessionKey,
    nonce: request.nonce,
    fromToken: request.fromToken,
    toToken: request.toToken,
    walletClient: request.walletClient,
  })

  // Step 3: Execute swap
  const executionResponse = await executeSwap({
    quote: quoteResponse.quote,
    delegation: delegationResponse.delegation,
    signature: delegationResponse.signature,
    sessionKey: request.sessionKey,
  })

  return {
    quote: quoteResponse.quote,
    txHash: executionResponse.txHash,
  }
}
