'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import type { ChatMessage } from '@/lib/h2/types'
import { useStreamingMessage } from '@/hooks/useStreamingMessage'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ThinkingBubble } from './ThinkingBubble'
import { NFTGallery } from '../nft/NFTGallery'
import type { NFTGalleryData } from '@pragma/core'

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
 * AIMessage Component (H2 Enabled)
 *
 * AI messages with rich markdown support, syntax highlighting, and streaming.
 * Now integrated with H2 streaming via useStreamingMessage hook.
 * Features: Smooth token-by-token streaming, code blocks, tables, lists, NFT galleries.
 */
export function AIMessage({ message }: AIMessageProps) {
  const { displayedContent } = useStreamingMessage({
    message,
    enabled: message.isStreaming ?? false,
  })

  // Parse content for special components (NFT gallery, etc.)
  // Check rawToolOutput first for gallery (has preserved markers from tool output)
  // LLM rewrites tool output, losing markers like __nft_gallery__
  // We preserve raw output in message.rawToolOutput for component detection
  const { text, gallery } = useMemo(() => {
    // Try to extract gallery from rawToolOutput first (preserved markers)
    if (message.rawToolOutput) {
      const { gallery: galleryFromRaw } = parseNFTGallery(message.rawToolOutput)
      if (galleryFromRaw) {
        // Use LLM's formatted text, but gallery from raw output
        return { text: displayedContent, gallery: galleryFromRaw }
      }
    }
    // Fall back to parsing displayedContent
    return parseNFTGallery(displayedContent)
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
            segments={message.reasoningSegments}
            content={message.reasoningContent}
            duration={message.reasoningDuration}
            isStreaming={isReasoningStreaming}
          />
        )}

        {/* Render text content */}
        {text && <MarkdownRenderer content={text} />}

        {/* Render NFT Gallery if present */}
        {gallery && (
          <div className="mt-4">
            <NFTGallery data={gallery} />
          </div>
        )}

      </div>
    </motion.div>
  )
}
