'use client'

import { useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import type { ChatMessage } from '@/lib/h2/types'
import { useStreamingMessage } from '@/hooks/useStreamingMessage'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ThinkingBubble } from './ThinkingBubble'
import { NFTGallery } from '../nft/NFTGallery'
import { ActivityTable, type ActivityTableData } from '../activity'
import type { NFTGalleryData, NFTDisplayData } from '@pragma/core'
import { useAgentContext } from '@/contexts/H2AgentContext'

interface AIMessageProps {
  message: ChatMessage
}

/**
 * Parse NFT gallery data from message content
 * Format: __nft_gallery__\n{JSON}
 */
function parseNFTGallery(content: string): { text: string; gallery: NFTGalleryData | null } {
  const marker = '__nft_gallery__'
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

  return { text: content.replace(marker, '').trim(), gallery: null }
}

/**
 * Parse activity table data from message content
 * Format: __activity_table__\n{JSON}
 */
function parseActivityTable(content: string): { text: string; activityData: ActivityTableData | null } {
  const marker = '__activity_table__'
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

  return { text: content.replace(marker, '').trim(), activityData: null }
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
  // LLM rewrites tool output, losing markers like __nft_gallery__ and __activity_table__
  // We preserve raw output in message.rawToolOutput for component detection
  const { text, gallery, activityData } = useMemo(() => {
    let finalText = displayedContent
    let galleryData: NFTGalleryData | null = null
    let activity: ActivityTableData | null = null

    // Try to extract gallery from rawToolOutput first (preserved markers)
    if (message.rawToolOutput) {
      const { gallery: galleryFromRaw } = parseNFTGallery(message.rawToolOutput)
      if (galleryFromRaw) {
        galleryData = galleryFromRaw
        // Strip marker from displayedContent in case LLM echoed tool output verbatim
        const { text: cleanedText } = parseNFTGallery(finalText)
        finalText = cleanedText
      }

      // Try to extract activity table from rawToolOutput
      const { activityData: activityFromRaw } = parseActivityTable(message.rawToolOutput)
      if (activityFromRaw) {
        activity = activityFromRaw
        // Strip marker from displayedContent in case LLM echoed tool output verbatim
        const { text: cleanedText } = parseActivityTable(finalText)
        finalText = cleanedText
      }
    }

    // Fall back to parsing displayedContent if not found in rawToolOutput
    if (!galleryData) {
      const { text: textAfterGallery, gallery: galleryFromContent } = parseNFTGallery(finalText)
      if (galleryFromContent) {
        galleryData = galleryFromContent
        finalText = textAfterGallery
      }
    }

    if (!activity) {
      const { text: textAfterActivity, activityData: activityFromContent } = parseActivityTable(finalText)
      if (activityFromContent) {
        activity = activityFromContent
        finalText = textAfterActivity
      }
    }

    return { text: finalText, gallery: galleryData, activityData: activity }
  }, [displayedContent, message.rawToolOutput, message.id])

  // Determine if reasoning is still streaming (has reasoning but no content yet)
  const isReasoningStreaming = !!(message.isStreaming && message.reasoningContent && !displayedContent)

  // Check if we have any reasoning to display (segments or live content)
  const hasReasoning = (message.reasoningSegments && message.reasoningSegments.length > 0) || message.reasoningContent

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6"
    >
      <div className="text-sm lg:text-base max-lg:min-w-0 max-lg:overflow-hidden">
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

        {/* Render NFT Gallery if present */}
        {gallery && (
          <div className="mt-4">
            <NFTGallery data={gallery} onBuyClick={handleBuyClick} />
          </div>
        )}

        {/* Render Activity Table if present */}
        {activityData && (
          <div className="mt-4">
            <ActivityTable data={activityData} onExplainClick={handleExplainClick} />
          </div>
        )}

      </div>
    </motion.div>
  )
}
