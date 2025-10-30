'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { type Message } from '@/stores/useChatStore'

interface AIMessageProps {
  message: Message
  enableTyping?: boolean
}

/**
 * AIMessage Component
 *
 * AI messages appear as seamless text, left-aligned (no bubble).
 * Design: Plain text with optional word-by-word typing animation.
 * Markdown support will be added in future phases.
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

    // Word-by-word typing animation
    const words = message.content.split(' ')
    let currentIndex = 0

    const interval = setInterval(() => {
      if (currentIndex < words.length) {
        setDisplayedText((prev) =>
          prev ? `${prev} ${words[currentIndex]}` : words[currentIndex]
        )
        currentIndex++
      } else {
        setIsComplete(true)
        clearInterval(interval)
      }
    }, 50) // 50ms per word (fast typing)

    return () => clearInterval(interval)
  }, [message.content, enableTyping])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-4 max-w-full lg:max-w-[85%]"
    >
      <div className="text-sm lg:text-base whitespace-pre-wrap break-words opacity-90">
        {displayedText}
        {!isComplete && (
          <motion.span
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="inline-block w-1 h-4 bg-current ml-1 align-middle"
          />
        )}
      </div>
    </motion.div>
  )
}
