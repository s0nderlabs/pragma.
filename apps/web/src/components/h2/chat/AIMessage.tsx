'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { type Message } from '@/stores/useChatStore'
import { MarkdownRenderer } from './MarkdownRenderer'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { useThemeStore } from '@/stores/useThemeStore'

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
  const { theme } = useThemeStore()
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
      className="mb-6 flex gap-3 items-start"
    >
      {/* AI Avatar */}
      <div className="flex-shrink-0 mt-1">
        <LiquidGlassPanel
          theme={theme}
          className="w-8 h-8 rounded-full flex items-center justify-center"
          blurAmount={4}
          displacementScale={0.2}
          stdDeviation={0.02}
        >
          <Sparkles className="w-4 h-4 text-purple-400" />
        </LiquidGlassPanel>
      </div>

      {/* Message Content */}
      <div className="flex-1 min-w-0">
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
      </div>
    </motion.div>
  )
}
