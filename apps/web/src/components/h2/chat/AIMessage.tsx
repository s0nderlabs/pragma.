'use client'

import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import type { ChatMessage } from '@/lib/h2/types'
import { useStreamingMessage } from '@/hooks/useStreamingMessage'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ThinkingBubble } from './ThinkingBubble'
import { NFTGallery } from '../nft/NFTGallery'
import { ActivityTable, type ActivityTableData } from '../activity'
import type { NFTGalleryData, NFTDisplayData } from '@pragma/core'
import { useAgentContext } from '@/contexts/H2AgentContext'
import { useH2ChatStore } from '@/stores/useH2ChatStore'

interface AIMessageProps {
  message: ChatMessage
}

/**
 * Unicode star spinner frames (same as ThinkingBubble)
 */
const SPINNER_FRAMES = ['✦', '✧', '✶', '✷', '✸', '✹', '✺', '✻']

/**
 * Reddish color for error/retry states
 */
const ERROR_COLOR = '#DC2626' // Red-600

/**
 * RetryIndicator Component
 *
 * Shows animated star spinner when auto-retrying due to hallucination.
 * Uses reddish color to indicate error state.
 */
function RetryIndicator() {
  const [frameIndex, setFrameIndex] = useState(0)

  // Continuous animation while retrying
  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length)
    }, 100)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="mt-3 mb-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-2xl font-mono flex-shrink-0" style={{ color: ERROR_COLOR }}>
          {SPINNER_FRAMES[frameIndex]}
        </span>
        <span className="text-sm font-medium" style={{ color: ERROR_COLOR, opacity: 0.9 }}>
          Retrying...
        </span>
      </div>
    </div>
  )
}

/**
 * TableLoader Component
 *
 * Shows a loading indicator while activity table or NFT gallery data is being fetched.
 * Matches ThinkingBubble design with spinner and shimmer effect.
 */
function TableLoader({ type }: { type: 'activity' | 'gallery' }) {
  const [frameIndex, setFrameIndex] = useState(0)

  // Animate spinner
  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length)
    }, 100)
    return () => clearInterval(interval)
  }, [])

  const label = type === 'activity' ? 'Loading activity...' : 'Loading gallery...'

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 text-sm">
        {/* Animated spinner */}
        <span className="text-2xl font-mono flex-shrink-0 text-[#E07A5F]">
          {SPINNER_FRAMES[frameIndex]}
        </span>

        {/* Label with shimmer effect */}
        <span className="min-w-0 shimmer-text truncate text-sm font-medium" style={{ opacity: 0.9 }}>
          {label}
        </span>
      </div>

      {/* Shimmer animation styles */}
      <style jsx>{`
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        .shimmer-text {
          background: linear-gradient(
            90deg,
            #E07A5F 0%,
            #f5b7a8 50%,
            #E07A5F 100%
          );
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 2s linear infinite;
        }
      `}</style>
    </div>
  )
}

/**
 * Strip JSON-like content and marker prefixes from streaming output
 * Used to hide raw JSON that models like Gemini echo during streaming
 * This is defensive - we strip JSON patterns regardless of markers
 *
 * Strategy: Look for JSON-like patterns specific to our tool outputs and strip
 * from the start of the JSON to the end of the string. This handles both
 * complete JSON and partial JSON (during streaming).
 */
function stripJsonContent(content: string): string {
  let result = content

  // Pattern 0: Strip marker prefixes that LLM may echo
  // These markers should never appear in the final output
  result = result.replace(/\[NFT_GALLERY_DATA\]/g, '')
  result = result.replace(/\[ACTIVITY_DATA\]/g, '')

  // Pattern 1: Activity table JSON (has "activities" array)
  // Match from first `{"activities"` or `{ "activities"` to end of string
  const activityMatch = result.match(/\{\s*"activities"\s*:/)
  if (activityMatch && activityMatch.index !== undefined) {
    return result.slice(0, activityMatch.index).trim()
  }

  // Pattern 2: NFT gallery JSON (has "__type": "nft_gallery" or "nfts" + "totalCount")
  const galleryMatch = result.match(/\{\s*"__type"\s*:\s*"nft_gallery"/)
  if (galleryMatch && galleryMatch.index !== undefined) {
    return result.slice(0, galleryMatch.index).trim()
  }

  // Pattern 3: NFT gallery alternative structure (nfts array with totalCount)
  const nftMatch = result.match(/\{\s*"title"\s*:.*"nfts"\s*:/)
  if (nftMatch && nftMatch.index !== undefined) {
    return result.slice(0, nftMatch.index).trim()
  }

  return result.trim()
}

/**
 * Parse NFT gallery data from message content
 * Format: <!--NFT_GALLERY-->\n{JSON}
 * Uses HTML comment marker to prevent markdown from stripping underscores
 */
function parseNFTGallery(content: string): { text: string; gallery: NFTGalleryData | null } {
  const marker = '<!--NFT_GALLERY-->'
  const markerIndex = content.indexOf(marker)

  if (markerIndex === -1) {
    return { text: content, gallery: null }
  }

  // Get text before marker
  const textBefore = content.slice(0, markerIndex).trim()

  // Get JSON after marker
  const afterMarker = content.slice(markerIndex + marker.length).trim()

  try {
    // Find the JSON object (starts with { and ends with })
    const jsonMatch = afterMarker.match(/^\{[\s\S]*\}/)
    if (jsonMatch) {
      const gallery = JSON.parse(jsonMatch[0]) as NFTGalleryData
      return { text: textBefore, gallery }
    }
  } catch {
    // JSON parse failed, return text only
  }

  return { text: textBefore, gallery: null }
}

/**
 * Parse activity table data from message content
 * Format: <!--ACTIVITY_TABLE-->\n{JSON}
 * Uses HTML comment marker to prevent markdown from stripping underscores
 */
function parseActivityTable(content: string): { text: string; activityData: ActivityTableData | null } {
  const marker = '<!--ACTIVITY_TABLE-->'
  const markerIndex = content.indexOf(marker)

  if (markerIndex === -1) {
    return { text: content, activityData: null }
  }

  // Get text before marker
  const textBefore = content.slice(0, markerIndex).trim()

  // Get JSON after marker
  const afterMarker = content.slice(markerIndex + marker.length).trim()

  try {
    // Find the JSON object (starts with { and ends with })
    const jsonMatch = afterMarker.match(/^\{[\s\S]*\}/)
    if (jsonMatch) {
      const activityData = JSON.parse(jsonMatch[0]) as ActivityTableData
      return { text: textBefore, activityData }
    }
  } catch {
    // JSON parse failed, return text only
  }

  return { text: textBefore, activityData: null }
}

/**
 * AIMessage Component (H2 Enabled)
 *
 * AI messages with rich markdown support, syntax highlighting, and streaming.
 * Now integrated with H2 streaming via useStreamingMessage hook.
 * Features: Smooth token-by-token streaming, code blocks, tables, lists, NFT galleries.
 */
export function AIMessage({ message }: AIMessageProps) {
  const { sendMessage, isStreaming } = useAgentContext()

  // Auto-retry state for hallucination detection
  const isAutoRetrying = useH2ChatStore((state) => state.isAutoRetrying)

  const { displayedContent } = useStreamingMessage({
    message,
    enabled: message.isStreaming ?? false,
  })

  // Handle NFT buy button click - sends purchase request to agent
  const handleBuyClick = useCallback(async (nft: NFTDisplayData) => {
    if (isStreaming) return // Don't interrupt ongoing operations

    const nftName = nft.nft.name || `#${nft.nft.identifier}`
    const collection = nft.nft.collection
    const price = nft.formattedPrice || 'the listed price'

    // Send purchase request to agent
    await sendMessage(`Buy ${nftName} from ${collection} for ${price}`)
  }, [sendMessage, isStreaming])

  // Handle activity explain button click - sends explain request to agent
  const handleExplainClick = useCallback(async (txHash: string) => {
    if (isStreaming) return // Don't interrupt ongoing operations
    await sendMessage(`explain tx ${txHash}`)
  }, [sendMessage, isStreaming])

  // Parse content for special components (NFT gallery, activity table, etc.)
  // Check rawToolOutput first for markers (has preserved markers from tool output)
  // LLM rewrites tool output, losing markers like <!--NFT_GALLERY--> and <!--ACTIVITY_TABLE-->
  // We preserve raw output in message.rawToolOutput for component detection
  //
  // DEFENSIVE JSON STRIPPING:
  // Some models (like Gemini) echo the JSON in response tokens WITHOUT the marker.
  // This causes raw JSON to appear during streaming before rawToolOutput is attached.
  // Solution: Strip JSON-like patterns from displayedContent when we detect them.
  const { text, gallery, activityData, loadingActivity, loadingGallery } = useMemo(() => {
    let finalText = displayedContent
    let galleryData: NFTGalleryData | null = null
    let activity: ActivityTableData | null = null
    let isLoadingActivity = false
    let isLoadingGallery = false

    // FIRST: Check rawToolOutput for markers (authoritative source)
    if (message.rawToolOutput) {
      // Parse activity from rawToolOutput
      if (message.rawToolOutput.includes('<!--ACTIVITY_TABLE-->')) {
        const { activityData: activityFromRaw } = parseActivityTable(message.rawToolOutput)
        if (activityFromRaw) {
          activity = activityFromRaw
          // Strip ALL JSON-like content from displayedContent
          // Model may echo JSON without marker, so we can't rely on marker parsing
          finalText = stripJsonContent(finalText)
        }
      }

      // Parse gallery from rawToolOutput
      if (message.rawToolOutput.includes('<!--NFT_GALLERY-->')) {
        const { gallery: galleryFromRaw } = parseNFTGallery(message.rawToolOutput)
        if (galleryFromRaw) {
          galleryData = galleryFromRaw
          // Strip ALL JSON-like content from displayedContent
          finalText = stripJsonContent(finalText)
        }
      }
    }

    // SECOND: During streaming, defensively strip JSON patterns
    // even if rawToolOutput isn't attached yet (timing issue)
    if (message.isStreaming && !activity && !galleryData) {
      // Check for JSON-like patterns that match our tool output structure
      const hasActivityJson = /\{[\s\S]*?"activities"[\s\S]*?\[/.test(finalText)
      const hasGalleryJson = /\{[\s\S]*?"nfts"[\s\S]*?\[/.test(finalText)

      if (hasActivityJson) {
        // Strip the JSON, show loader until rawToolOutput arrives
        finalText = stripJsonContent(finalText)
        isLoadingActivity = true
      }

      if (hasGalleryJson) {
        // Strip the JSON, show loader until rawToolOutput arrives
        finalText = stripJsonContent(finalText)
        isLoadingGallery = true
      }
    }

    // THIRD: Fall back to parsing displayedContent if not streaming
    // and not found in rawToolOutput (for non-streaming scenarios)
    if (!galleryData && !message.isStreaming) {
      const { text: textAfterGallery, gallery: galleryFromContent } = parseNFTGallery(finalText)
      if (galleryFromContent) {
        galleryData = galleryFromContent
        finalText = textAfterGallery
      }
    }

    if (!activity && !message.isStreaming) {
      const { text: textAfterActivity, activityData: activityFromContent } = parseActivityTable(finalText)
      if (activityFromContent) {
        activity = activityFromContent
        finalText = textAfterActivity
      }
    }

    return {
      text: finalText,
      gallery: galleryData,
      activityData: activity,
      loadingActivity: isLoadingActivity,
      loadingGallery: isLoadingGallery,
    }
  }, [displayedContent, message.rawToolOutput, message.id, message.isStreaming])

  // Determine if reasoning is still streaming (has reasoning but no content yet)
  const isReasoningStreaming = !!(message.isStreaming && message.reasoningContent && !displayedContent)

  // Check if we have any reasoning to display (segments or live content)
  const hasReasoning = (message.reasoningSegments && message.reasoningSegments.length > 0) || message.reasoningContent

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6 group"
    >
      <div className="text-sm lg:text-base">
        {/* Chain-of-thought reasoning bubble (DeepSeek) */}
        {hasReasoning && (
          <ThinkingBubble
            messageId={message.id}
            segments={message.reasoningSegments}
            content={message.reasoningContent}
            duration={message.reasoningDuration}
            isStreaming={isReasoningStreaming}
          />
        )}

        {/* Render text content with streaming animation */}
        {text && <MarkdownRenderer content={text} isAnimating={message.isStreaming ?? false} />}

        {/* Show loader while NFT Gallery is being fetched */}
        {loadingGallery && !gallery && (
          <div className="mt-4">
            <TableLoader type="gallery" />
          </div>
        )}

        {/* Render NFT Gallery if present */}
        {gallery && (
          <div className="mt-4">
            <NFTGallery data={gallery} onBuyClick={handleBuyClick} />
          </div>
        )}

        {/* Show loader while Activity Table is being fetched */}
        {loadingActivity && !activityData && (
          <div className="mt-4">
            <TableLoader type="activity" />
          </div>
        )}

        {/* Render Activity Table if present */}
        {activityData && (
          <div className="mt-4">
            <ActivityTable data={activityData} onExplainClick={handleExplainClick} />
          </div>
        )}

        {/* Stopped indicator moved to MessageList to appear after all messages in the turn */}
        {/* Message actions moved to TurnMessageActions in MessageList to appear after all messages (including tools) */}

        {/* Auto-retry indicator - shown when hallucination detected and retrying */}
        {isAutoRetrying && <RetryIndicator />}

        {/* Exhausted banner moved to MessageList to appear after all messages in the turn */}

      </div>
    </motion.div>
  )
}
