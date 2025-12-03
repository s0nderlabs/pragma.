'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ReasoningSegment } from '@/lib/h2/types'

interface ThinkingBubbleProps {
  /** Array of reasoning segments (preferred) */
  segments?: ReasoningSegment[]
  /** Legacy: Single reasoning content string (fallback) */
  content?: string
  /** Legacy: Time spent on reasoning phase in milliseconds */
  duration?: number
  /** Whether content is still being streamed */
  isStreaming?: boolean
}

/**
 * Single segment component (collapsible)
 * Note: expanded state is lifted to parent to prevent reset on re-render
 */
function ThinkingSegment({
  index,
  content,
  duration,
  isStreaming,
  isOnly,
  expanded,
  onToggle,
}: {
  index: number
  content: string
  duration?: number
  isStreaming?: boolean
  isOnly?: boolean
  expanded: boolean
  onToggle: () => void
}) {
  // Format duration as seconds with 1 decimal
  const formattedDuration = duration ? `${(duration / 1000).toFixed(1)}s` : null

  // Skip initial animation if we mounted already expanded (remount case)
  // Reset after first collapse to allow normal animations on re-expand
  const [skipInitial, setSkipInitial] = useState(expanded)

  useEffect(() => {
    if (!expanded) {
      setSkipInitial(false)
    }
  }, [expanded])

  return (
    <div className="mb-2">

      {/* Header (clickable) */}
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-300 transition-colors group"
      >
        {/* Expand/Collapse indicator */}
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="text-xs text-neutral-500 group-hover:text-neutral-400"
        >
          {'\u25B6'}
        </motion.span>

        {/* Label */}
        <span className="flex items-center gap-1.5">
          <span className="text-neutral-500">
            {isOnly ? 'Thinking' : `Thinking ${index + 1}`}
          </span>

          {/* Streaming indicator */}
          {isStreaming && (
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="inline-block w-1.5 h-1.5 rounded-full bg-[#E07A5F]"
            />
          )}

          {/* Duration badge */}
          {formattedDuration && !isStreaming && (
            <span className="text-xs text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded">
              {formattedDuration}
            </span>
          )}
        </span>
      </button>

      {/* Expandable content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={skipInitial ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 pl-4 border-l-2 border-neutral-700">
              <p className="text-sm text-neutral-400 whitespace-pre-wrap leading-relaxed">
                {content}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * ThinkingBubble Component
 *
 * Displays DeepSeek's chain-of-thought reasoning.
 * Supports multiple segments for multi-turn tool calling conversations.
 *
 * Design:
 * - Each segment is collapsible independently
 * - Expanded state is lifted to this component to prevent reset when child re-renders
 * - Shows "Thinking 1", "Thinking 2", etc. for multiple segments
 * - Shows duration per segment when complete
 */
export function ThinkingBubble({ segments, content, duration, isStreaming }: ThinkingBubbleProps) {
  // Lifted state: track which segments are expanded by index
  // Using Set for O(1) lookup and to persist across re-renders
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set())

  const toggleExpanded = useCallback((index: number) => {
    setExpandedIndices(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  // Normalize to always use segments array for consistent React tree structure
  const normalizedSegments = segments && segments.length > 0 ? segments : []
  const hasStreamingContent = isStreaming && content
  const hasLegacyContent = !segments?.length && content && !isStreaming

  // Nothing to show
  if (normalizedSegments.length === 0 && !hasStreamingContent && !hasLegacyContent) {
    return null
  }

  // Calculate isOnly based on total segments (finalized + streaming/legacy)
  const totalCount = normalizedSegments.length + (hasStreamingContent || hasLegacyContent ? 1 : 0)
  const isOnly = totalCount === 1

  return (
    <div className="mb-3">
      {/* Render finalized segments */}
      {normalizedSegments.map((segment, index) => (
        <ThinkingSegment
          key={segment.id}
          index={index}
          content={segment.content}
          duration={segment.duration}
          isStreaming={false}
          isOnly={isOnly}
          expanded={expandedIndices.has(index)}
          onToggle={() => toggleExpanded(index)}
        />
      ))}
      {/* Show live streaming content */}
      {hasStreamingContent && (
        <ThinkingSegment
          key="streaming"
          index={normalizedSegments.length}
          content={content}
          isStreaming={true}
          isOnly={isOnly}
          expanded={expandedIndices.has(normalizedSegments.length)}
          onToggle={() => toggleExpanded(normalizedSegments.length)}
        />
      )}
      {/* Legacy single content (backward compat) */}
      {hasLegacyContent && (
        <ThinkingSegment
          key="legacy"
          index={0}
          content={content}
          duration={duration}
          isStreaming={false}
          isOnly={true}
          expanded={expandedIndices.has(0)}
          onToggle={() => toggleExpanded(0)}
        />
      )}
    </div>
  )
}
