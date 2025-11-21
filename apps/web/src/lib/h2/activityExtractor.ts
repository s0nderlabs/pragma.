import type { AnyMessage } from '@/lib/h2/types'

export interface ActivityRecord {
  id: string
  type: 'swap' | 'transfer' | 'wrap' | 'unwrap' | 'stake' | 'unstake' | 'unstakeClaim' | 'funding'
  timestamp: number
  status: 'success' | 'failed' | 'pending'

  // Display (for list view)
  displayText?: string // "Swapped 0.41 USDC → Received 3.50 MON"

  // Transaction data (for modal)
  txHash?: string
  blockNumber?: string
  gasUsed?: string

  // Operation details
  description: string
  fromToken?: string
  toToken?: string
  fromAmount?: string  // Input amount ("0.41")
  toAmount?: string    // Output amount ("3.50")
  amount?: string      // Legacy field
  recipientAddress?: string  // Recipient address (for transfers)

  // Delegation metadata (for modal)
  delegator?: string           // Smart account address
  sessionKey?: string          // Session key address
  nonce?: string               // Delegation nonce
  delegationCount?: number     // Number of delegations (1-4)
  delegationTypes?: string[]   // ["approve", "swap"]
  expiresAt?: number           // Unix timestamp
  feeEnforced?: boolean        // Protocol fee collected

  // Detailed per-delegation breakdown (for transparency)
  delegations?: Array<{
    type: string              // "approve", "swap", "transfer"
    target: string            // Contract address
    functionSelector: string  // "0x095ea7b3"
    value: string             // "0" (ETH value)
    enforcers: string[]       // Enforcer contract addresses
  }>

  // Metadata
  toolName: string
  signature?: string
  fundingMethod?: 'userOp' | 'delegation'
  fromAddress?: string
}

export const EXECUTION_TOOLS = [
  'executeSwap',
  'transfer',
  'wrap',
  'unwrap',
  'stake',
  'unstakeRequest',
  'unstakeClaim',
  'fundSessionKey',
] as const

function parseOperationType(toolName: string): ActivityRecord['type'] {
  if (toolName === 'executeSwap') return 'swap'
  if (toolName === 'transfer') return 'transfer'
  if (toolName === 'wrap') return 'wrap'
  if (toolName === 'unwrap') return 'unwrap'
  if (toolName === 'stake') return 'stake'
  if (toolName === 'unstakeRequest') return 'unstake'
  if (toolName === 'unstakeClaim') return 'unstakeClaim'
  if (toolName === 'fundSessionKey') return 'funding'
  return 'swap' // fallback
}

function parseStatus(
  toolStatus: string,
  outputStatus?: string,
  actualOutput?: string,
  txHash?: string
): ActivityRecord['status'] {
  if (toolStatus === 'running') return 'pending'
  if (toolStatus === 'error') return 'failed'
  if (toolStatus === 'completed') {
    // CRITICAL: If no txHash, execution failed before sending transaction
    // This catches quote expired, funding failed, and other pre-execution errors
    if (!txHash) return 'failed'

    // Check execution result status if available
    if (outputStatus === 'reverted' || outputStatus === 'failed') return 'failed'

    // FALLBACK: Check if swap succeeded but received zero output (for backwards compatibility)
    // This catches cases where executeSwap didn't detect the failure
    if (actualOutput) {
      try {
        const outputNum = parseFloat(actualOutput)
        if (!isNaN(outputNum) && outputNum === 0) {
          return 'failed'
        }
      } catch {
        // Ignore parsing errors, fall through to success
      }
    }

    return 'success'
  }
  return 'pending'
}

/**
 * Parse amounts and tokens from description
 * Examples:
 * - "Swap 0.41 USDC to MON" → {fromAmount: "0.41", from Token: "USDC", toToken: "MON"}
 * - "Transfer 100.0 USDC" → {fromAmount: "100.0", fromToken: "USDC"}
 */
function parseAmountsFromDescription(description: string, type: ActivityRecord['type']) {
  // Swap: "Swap X TOKEN to TOKEN" or "Swapping X TOKEN to TOKEN"
  const swapMatch = description.match(/([\d.]+)\s+(\w+)\s+(?:to|→)\s+(\w+)/i)
  if (swapMatch && type === 'swap') {
    return {
      fromAmount: swapMatch[1],
      fromToken: swapMatch[2],
      toToken: swapMatch[3],
    }
  }

  // Transfer: "Transfer X TOKEN" or "Transferring X TOKEN"
  const transferMatch = description.match(/(?:Transfer|Transferring)\s+([\d.]+)\s+(\w+)/i)
  if (transferMatch && type === 'transfer') {
    return {
      fromAmount: transferMatch[1],
      fromToken: transferMatch[2],
    }
  }

  // Wrap/Unwrap: "Wrap X TOKEN" or "Wrapping X MON"
  const wrapMatch = description.match(/(?:Wrap|Wrapping|Unwrap|Unwrapping)\s+([\d.]+)\s+(\w+)/i)
  if (wrapMatch && (type === 'wrap' || type === 'unwrap')) {
    return {
      fromAmount: wrapMatch[1],
      fromToken: wrapMatch[2],
    }
  }

  // Stake: "Stake X TOKEN" or "Staking X MON"
  const stakeMatch = description.match(/(?:Stak(?:e|ing))\s+([\d.]+)\s+(\w+)/i)
  if (stakeMatch && type === 'stake') {
    return {
      fromAmount: stakeMatch[1],
      fromToken: stakeMatch[2],
    }
  }

  return {}
}

/**
 * Truncate amount for display (max 6 significant digits)
 * Examples: "0.000123" → "0.000123", "1234.56789" → "1234.57", "0.5" → "0.5"
 */
export function truncateAmount(amount: string): string {
  try {
    const num = parseFloat(amount)
    if (isNaN(num)) return amount

    // For very small numbers (< 0.0001), show up to 6 decimal places
    if (num < 0.0001 && num > 0) {
      return num.toFixed(6).replace(/\.?0+$/, '') // Remove trailing zeros
    }

    // For numbers < 1, show up to 4 decimal places
    if (num < 1) {
      return num.toFixed(4).replace(/\.?0+$/, '')
    }

    // For numbers >= 1, show up to 2 decimal places
    return num.toFixed(2).replace(/\.?0+$/, '')
  } catch {
    return amount
  }
}

/**
 * Format amount for activity list display - uses shorthand for dust
 * Examples: "0.00000039" → "< 0.00", "0.041" → "0.041", "123.456" → "123.46"
 */
export function formatAmountForDisplay(amount: string): string {
  try {
    const num = parseFloat(amount)
    if (isNaN(num)) return amount

    // Dust threshold: show "< 0.00" for very small amounts
    if (num < 0.001 && num > 0) {
      return '< 0.00'
    }

    // Otherwise use standard truncation
    return truncateAmount(amount)
  } catch {
    return amount
  }
}

/**
 * Generate display text with amounts (for activity list)
 * Uses formatAmountForDisplay() for clean shorthand (including "< 0.00" for dust)
 */
function generateDisplayText(
  type: ActivityRecord['type'],
  fromAmount?: string,
  fromToken?: string,
  toAmount?: string,
  toToken?: string,
  fundingMethod?: string
): string {
  if (type === 'swap' && fromAmount && fromToken && toAmount && toToken) {
    return `Swapped ${formatAmountForDisplay(fromAmount)} ${fromToken} → Received ${formatAmountForDisplay(toAmount)} ${toToken}`
  }

  if (type === 'transfer' && fromAmount && fromToken) {
    return `Sent ${formatAmountForDisplay(fromAmount)} ${fromToken}`
  }

  if (type === 'wrap' && fromAmount && fromToken) {
    return `Wrapped ${formatAmountForDisplay(fromAmount)} ${fromToken} to W${fromToken}`
  }

  if (type === 'unwrap' && fromAmount && fromToken) {
    return `Unwrapped ${formatAmountForDisplay(fromAmount)} ${fromToken} to ${fromToken.replace(/^W/, '')}`
  }

  if (type === 'stake' && fromAmount && fromToken) {
    return `Staked ${formatAmountForDisplay(fromAmount)} ${fromToken}`
  }

  if (type === 'unstake' && fromAmount && fromToken) {
    return `Requested unstake ${formatAmountForDisplay(fromAmount)} ${fromToken}`
  }

  if (type === 'unstakeClaim' && toAmount && toToken) {
    return `Claimed ${formatAmountForDisplay(toAmount)} ${toToken}`
  }

  if (type === 'funding' && fromAmount && fromToken) {
    const method = fundingMethod === 'userOp' ? 'UserOp' : fundingMethod === 'delegation' ? 'Delegation' : ''
    const methodSuffix = method ? ` (${method})` : ''
    return `Funded ${formatAmountForDisplay(fromAmount)} ${fromToken}${methodSuffix}`
  }

  // Fallback
  return type.charAt(0).toUpperCase() + type.slice(1)
}

/**
 * Extract activity record from a single tool message
 * Handles both parent tools with children and standalone tools
 */
function extractFromToolMessage(msg: Extract<AnyMessage, { role: 'tool' }>): ActivityRecord[] {
  // If this is a parent tool with children, recursively extract from each child
  if (msg.isParent && Array.isArray(msg.children)) {
    return msg.children.flatMap((child) =>
      child.role === 'tool' ? extractFromToolMessage(child) : []
    )
  }

  // Extract from standalone tool (existing logic)
  {
      // Extract metadata from tool output (multiple formats supported)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: Record<string, any> = {}

      // Extract string content from LangChain ToolMessage object or plain string
      let outputString: string | undefined
      if (typeof msg.output === 'string') {
        outputString = msg.output
      } else if (msg.output && typeof msg.output === 'object') {
        // LangChain ToolMessage format: output.kwargs.content or output.content
        const outputObj = msg.output as { kwargs?: { content?: string }; content?: string }
        outputString = outputObj.kwargs?.content || outputObj.content
      }

      // Debug: Log tool message being processed
      console.log('[ActivityExtractor] Processing tool:', {
        id: msg.id,
        toolName: msg.toolName,
        hasOutput: !!msg.output,
        outputType: typeof msg.output,
        extractedString: !!outputString,
        stringPreview: outputString?.substring(0, 300),
        hasHTMLComment: outputString?.includes('<!--PRAGMA_METADATA:') || false
      })

      if (outputString && typeof outputString === 'string') {
        // Strategy 1: Try to extract embedded metadata from HTML comment
        const metadataMatch = outputString.match(/<!--PRAGMA_METADATA:(.+?)-->/s)

        // Debug: Log metadata extraction result
        if (metadataMatch) {
          console.log('[ActivityExtractor] ✓ Metadata found:', {
            toolName: msg.toolName,
            metadataPreview: metadataMatch[1].substring(0, 200) + '...'
          })
          try {
            data = JSON.parse(metadataMatch[1])
          } catch (e) {
            console.warn('[ActivityExtractor] Failed to parse embedded metadata:', e)
          }
        } else {
          console.warn('[ActivityExtractor] ✗ No metadata match in output for:', msg.toolName)
        }

        if (!metadataMatch) {
          // Strategy 2: Try direct JSON.parse (old structured format attempt)
          try {
            const parsed = JSON.parse(outputString)
            data = parsed.data || parsed
          } catch {
            // Strategy 3: Plain string - extract via regex (legacy tool format)
            const txHashMatch = outputString.match(/Tx Hash:\s*(0x[a-fA-F0-9]{64})/i)
            const blockMatch = outputString.match(/Block:\s*(\d+)/i)
            const gasMatch = outputString.match(/Gas Used:\s*([\d.]+)/i)

            data = {
              txHash: txHashMatch?.[1],
              blockNumber: blockMatch?.[1],
              gasUsed: gasMatch?.[1] ? (parseFloat(gasMatch[1]) * 1e18).toString() : undefined,
            }
          }
        }
      } else {
        data = msg.output || {}
      }

      const type = parseOperationType(msg.toolName)
      const description = msg.description || msg.toolName

      // Parse amounts from description (fallback if data missing)
      const parsed = parseAmountsFromDescription(description, type)

      // Prefer structured data over parsed description
      const fromAmount = data.fromAmount || parsed.fromAmount
      const fromToken = data.fromToken || parsed.fromToken
      const toToken = data.toToken || parsed.toToken
      const toAmount = data.toAmount || data.actualOutputFormatted

      // Generate display text
      const displayText = generateDisplayText(
        type,
        fromAmount,
        fromToken,
        toAmount,
        toToken,
        data.fundingMethod
      )

      // Extract delegation metadata
      const delegationMeta = data.delegationMetadata

      return [{
        id: msg.id,
        type,
        timestamp: msg.timestamp,
        status: parseStatus(msg.status, data.status, toAmount, data.txHash),
        displayText,

        // Transaction details
        txHash: data.txHash,
        blockNumber: data.blockNumber,
        gasUsed: data.gasUsed,

        // Operation details
        description,
        fromAmount,
        fromToken,
        toAmount,
        toToken,
        recipientAddress: data.recipientAddress,

        // Delegation metadata
        delegator: delegationMeta?.delegator,
        sessionKey: delegationMeta?.sessionKey,
        nonce: delegationMeta?.nonce?.toString(),
        delegationCount: delegationMeta?.delegationCount,
        delegationTypes: delegationMeta?.delegationTypes,
        expiresAt: delegationMeta?.expiresAt,
        feeEnforced: delegationMeta?.feeEnforced,
        delegations: delegationMeta?.delegations,

        // Metadata
        toolName: msg.toolName,
        signature: msg.signature,
      }]
    }
}

/**
 * Extract activity records from H2ChatStore messages
 * Filters for completed tool executions and extracts transaction data
 * IMPORTANT: Only includes activities with valid txHash (filters out pre-execution failures)
 */
export function extractActivityRecords(messages: AnyMessage[]): ActivityRecord[] {
  return messages
    .filter((msg): msg is Extract<AnyMessage, { role: 'tool' }> =>
      msg.role === 'tool' &&
      EXECUTION_TOOLS.includes(msg.toolName as (typeof EXECUTION_TOOLS)[number])
    )
    .flatMap(msg => extractFromToolMessage(msg))
    .filter(activity => activity.txHash !== undefined) // Exclude activities without transactions
    .sort((a, b) => b.timestamp - a.timestamp) // Newest first
}

/**
 * Format gas used to human-readable MON amount
 */
export function formatGasUsed(gasUsedWei?: string): string {
  if (!gasUsedWei) return '—'

  try {
    const gasUsed = BigInt(gasUsedWei)
    const gasInMon = Number(gasUsed) / 1e18

    if (gasInMon < 0.0001) {
      return '<0.0001 MON'
    }

    return `${gasInMon.toFixed(5)} MON`
  } catch {
    return '—'
  }
}

/**
 * Format block number to shortened string
 */
export function formatBlockNumber(blockNumber?: string): string {
  if (!blockNumber) return '—'

  try {
    const num = BigInt(blockNumber)
    return num.toLocaleString()
  } catch {
    return blockNumber
  }
}

/**
 * Get relative time string (shortened Uniswap style)
 */
export function getRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return `${seconds}s`
  if (minutes < 60) return `${minutes}m`
  if (hours < 24) return `${hours}h`
  return `${days}d`
}

/**
 * Shorten transaction hash for display
 */
export function shortenTxHash(txHash?: string): string {
  if (!txHash) return '—'
  return `${txHash.slice(0, 6)}...${txHash.slice(-4)}`
}

/**
 * Get Monad testnet block explorer URL
 */
export function getExplorerUrl(txHash?: string): string | null {
  if (!txHash) return null
  return `https://testnet.monadexplorer.com/tx/${txHash}`
}
