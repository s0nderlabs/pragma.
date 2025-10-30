'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { type Message } from '@/stores/useChatStore'
import { MarkdownRenderer } from './MarkdownRenderer'

interface AIMessageProps {
  message: Message
  enableTyping?: boolean
}

/**
 * AIMessage Component
 *
 * AI messages with rich markdown support, syntax highlighting, and AI avatar.
 * Design: Avatar on left, markdown content on right with glass container.
 * Features: Typing animation, code blocks, tables, lists, and more.
 */
export function AIMessage({ message, enableTyping = true }: AIMessageProps) {
  const [displayedText, setDisplayedText] = useState('')
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    if (!enableTyping) {
      setDisplayedText(message.content)
      setIsComplete(true)
      return
    }

    // Character-by-character typing animation for markdown
    let currentIndex = 0
    const fullText = message.content

    const interval = setInterval(() => {
      if (currentIndex <= fullText.length) {
        setDisplayedText(fullText.substring(0, currentIndex))
        currentIndex++
      } else {
        setIsComplete(true)
        clearInterval(interval)
      }
    }, 20) // 20ms per character (smooth typing)

    return () => clearInterval(interval)
  }, [message.content, enableTyping])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6"
    >
      <div className="text-sm lg:text-base">
        <MarkdownRenderer content={displayedText} />
        {!isComplete && (
          <motion.span
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="inline-block w-1 h-4 bg-purple-400 ml-1 align-middle rounded-sm"
          />
        )}
      </div>
    </motion.div>
  )
}
