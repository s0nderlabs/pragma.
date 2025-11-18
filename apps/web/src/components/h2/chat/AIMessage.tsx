'use client'

import { motion } from 'framer-motion'
import type { ChatMessage } from '@/lib/h2/types'
import { useStreamingMessage } from '@/hooks/useStreamingMessage'
import { MarkdownRenderer } from './MarkdownRenderer'

interface AIMessageProps {
  message: ChatMessage
}

/**
 * AIMessage Component (H2 Enabled)
 *
 * AI messages with rich markdown support, syntax highlighting, and streaming.
 * Now integrated with H2 streaming via useStreamingMessage hook.
 * Features: Smooth token-by-token streaming, code blocks, tables, lists.
 */
export function AIMessage({ message }: AIMessageProps) {
  const { displayedContent, isBuffering } = useStreamingMessage({
    message,
    enabled: message.isStreaming ?? false,
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6"
    >
      <div className="text-sm lg:text-base">
        <MarkdownRenderer content={displayedContent} />
        {(message.isStreaming || isBuffering) && (
          <motion.span
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="inline-block w-1 h-4 bg-[#F2A694] ml-1 align-middle rounded-sm"
          />
        )}
      </div>
    </motion.div>
  )
}
