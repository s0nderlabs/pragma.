'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ReasoningSegment } from '@/lib/h2/types'

/**
 * Unicode star spinner frames
 */
const SPINNER_FRAMES = ['✦', '✧', '✶', '✷', '✸', '✹', '✺', '✻']

interface ThinkingBubbleProps {
  /** Message ID (used for keys) */
  messageId?: string
  /** Array of reasoning segments (preferred) */
  segments?: ReasoningSegment[]
  /** Legacy: Single reasoning content string (fallback) */
  content?: string
  /** Legacy: Time spent on reasoning phase in milliseconds */
  duration?: number
  /** Whether reasoning content is still being streamed */
  isStreaming?: boolean
}

/**
 * Single segment component (collapsible)
 *
 * UI States:
 * - Streaming reasoning: "✦ Thinking" with shimmer effect
 * - Summarizing (no tokens yet): "✦ Thinking" with shimmer effect
 * - Summary streaming: "✦ Monorail offers..." (summary streams in)
 * - Complete: "✦ Monorail offers 2% better rate" (static, clickable)
 * - Expanded: "−" minus icon, full content visible
 */
function ThinkingSegment({
  segment,
  isReasoningStreaming,
  expanded,
  onToggle,
}: {
  segment: ReasoningSegment
  isReasoningStreaming?: boolean
  expanded: boolean
  onToggle: () => void
}) {
  // Format duration as seconds with 1 decimal
  const formattedDuration = segment.duration ? `${(segment.duration / 1000).toFixed(1)}s` : null

  // Spinner animation state
  const [frameIndex, setFrameIndex] = useState(0)

  // Determine if we should animate the spinner
  // Animate when: reasoning streaming OR summarizing (includes streaming summary)
  const shouldAnimate = isReasoningStreaming || segment.isSummarizing

  // Spinner animation
  useEffect(() => {
    if (!shouldAnimate) return

    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length)
    }, 100)
    return () => clearInterval(interval)
  }, [shouldAnimate])

  // Skip initial animation if we mounted already expanded
  const [skipInitial, setSkipInitial] = useState(expanded)

  useEffect(() => {
    if (!expanded) {
      setSkipInitial(false)
    }
  }, [expanded])

  // Determine display text and shimmer state
  const getDisplayState = (): { text: string; shimmer: boolean } => {
    if (isReasoningStreaming || (segment.isSummarizing && !segment.summary)) {
      // Still reasoning or just started summarizing - show "Thinking" with shimmer
      return { text: 'Thinking', shimmer: true }
    }
    if (segment.isSummarizing && segment.summary) {
      // Streaming summary - show partial (no shimmer)
      return { text: segment.summary, shimmer: false }
    }
    if (segment.summary) {
      // Complete - show full summary
      return { text: segment.summary, shimmer: false }
    }
    // Fallback (shouldn't happen normally)
    return { text: 'Thinking', shimmer: true }
  }

  const { text: displayText, shimmer } = getDisplayState()

  // Clickable only when complete (not streaming, not summarizing)
  const isClickable = !isReasoningStreaming && !segment.isSummarizing

  return (
    <div className="mb-2">
      {/* Header - clickable when complete */}
      <button
        onClick={isClickable ? onToggle : undefined}
        disabled={!isClickable}
        className={`flex items-center gap-2 text-sm transition-colors w-full text-left ${
          isClickable
            ? 'text-neutral-400 hover:text-neutral-300 cursor-pointer'
            : 'cursor-default'
        }`}
      >
        {/* Spinner as toggle indicator - always terracotta */}
        <span className="text-2xl font-mono flex-shrink-0 text-[#E07A5F]">
          {expanded ? '−' : SPINNER_FRAMES[shouldAnimate ? frameIndex : 0]}
        </span>

        {/* Text content - shimmer effect when showing "Thinking", terracotta when complete */}
        {/* min-w-0 allows flex item to shrink, enabling truncate to work properly */}
        <span
          className={`min-w-0 truncate text-sm font-medium ${
            shimmer
              ? 'shimmer-text'
              : 'text-[#E07A5F]'
          }`}
          style={{ opacity: 0.9 }}
        >
          {displayText}
        </span>

        {/* Duration badge (only when complete) */}
        {formattedDuration && !shouldAnimate && (
          <span className="text-xs text-[#E07A5F]/70 bg-[#E07A5F]/10 px-1.5 py-0.5 rounded flex-shrink-0">
            {formattedDuration}
          </span>
        )}
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
            <div className="mt-3 ml-2 pl-5 pr-4 py-3 relative">
              {/* Decorative quote mark */}
              <span className="absolute left-0 -top-1 text-2xl text-[#E07A5F]/40 font-serif select-none">{'"'}</span>
              <div className="text-[13px] text-neutral-600 dark:text-neutral-400 leading-[1.8] font-serif italic space-y-2">
                {segment.content.split(/(?<=[.!?])\s+(?=[A-Z])/).map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
              <span className="absolute right-1 -bottom-2 text-2xl text-[#E07A5F]/40 font-serif select-none">{'"'}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
 * Streaming Segment Component
 *
 * Shows "Thinking" with shimmer while reasoning is actively streaming.
 * Not expandable until finalized.
 */
function StreamingSegment({
  content,
  expanded,
  onToggle,
}: {
  content: string
  expanded: boolean
  onToggle: () => void
}) {
  const [frameIndex, setFrameIndex] = useState(0)

  // Always animate while streaming
  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length)
    }, 100)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="mb-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-sm w-full text-left cursor-pointer text-neutral-400 hover:text-neutral-300 transition-colors"
      >
        {/* Animated spinner */}
        <span className="text-2xl font-mono flex-shrink-0 text-[#E07A5F]">
          {expanded ? '−' : SPINNER_FRAMES[frameIndex]}
        </span>

        {/* "Thinking" with shimmer */}
        <span className="min-w-0 shimmer-text truncate text-sm font-medium" style={{ opacity: 0.9 }}>Thinking</span>
      </button>

      {/* Expandable content (live streaming) */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 ml-2 pl-5 pr-4 py-3 relative">
              {/* Decorative quote mark */}
              <span className="absolute left-0 -top-1 text-2xl text-[#E07A5F]/40 font-serif select-none">{'"'}</span>
              <div className="text-[13px] text-neutral-600 dark:text-neutral-400 leading-[1.8] font-serif italic space-y-2">
                {content.split(/(?<=[.!?])\s+(?=[A-Z])/).map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
              <span className="absolute right-1 -bottom-2 text-2xl text-[#E07A5F]/40 font-serif select-none">{'"'}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
 * ThinkingBubble Component
 *
 * Displays DeepSeek's chain-of-thought reasoning with streaming summaries.
 *
 * Design:
 * - Shows "Thinking" with shimmer effect while reasoning streams
 * - Streams summary in real-time when reasoning completes
 * - Spinner (✦) is the expand/collapse toggle
 * - Minus (−) shown when expanded
 * - Each segment collapsible independently
 */
export function ThinkingBubble({ messageId, segments, content, duration, isStreaming }: ThinkingBubbleProps) {
  // Lifted state: track which segments are expanded by index
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

  // Normalize to always use segments array
  const normalizedSegments = segments && segments.length > 0 ? segments : []
  const hasStreamingContent = isStreaming && content
  const hasLegacyContent = !segments?.length && content && !isStreaming

  // Nothing to show
  if (normalizedSegments.length === 0 && !hasStreamingContent && !hasLegacyContent) {
    return null
  }

  return (
    <div className="mb-3">
      {/* Render finalized segments */}
      {normalizedSegments.map((segment, index) => (
        <ThinkingSegment
          key={segment.id}
          segment={segment}
          isReasoningStreaming={false}
          expanded={expandedIndices.has(index)}
          onToggle={() => toggleExpanded(index)}
        />
      ))}

      {/* Show live streaming content */}
      {hasStreamingContent && (
        <StreamingSegment
          key={`streaming-${messageId}`}
          content={content}
          expanded={expandedIndices.has(normalizedSegments.length)}
          onToggle={() => toggleExpanded(normalizedSegments.length)}
        />
      )}

      {/* Legacy single content (backward compat) */}
      {hasLegacyContent && (
        <ThinkingSegment
          key={`legacy-${messageId}`}
          segment={{
            id: `legacy-${messageId}`,
            content: content,
            duration: duration,
          }}
          isReasoningStreaming={false}
          expanded={expandedIndices.has(0)}
          onToggle={() => toggleExpanded(0)}
        />
      )}
    </div>
  )
}
