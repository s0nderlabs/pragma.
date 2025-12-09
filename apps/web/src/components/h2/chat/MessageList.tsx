'use client'

import { useEffect, useRef, useLayoutEffect, useState, useCallback } from 'react'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { useThemeStore } from '@/stores/useThemeStore'
import { UserMessage } from './UserMessage'
import { AIMessage } from './AIMessage'
import { SystemMessage } from './SystemMessage'
import { ToolMessage } from './ToolMessage'
import { ThinkingIndicator } from './ThinkingIndicator'
import { ChevronDown } from 'lucide-react'
import type { ToolMessage as ToolMessageType } from '@/lib/h2/types'

/**
 * MessageList Component (H2 Enabled)
 *
 * Renders all messages from H2 agent with real-time streaming.
 * Features: Auto-scroll (ChatGPT/Claude-style), streaming support, progress indicators.
 */
export function MessageList() {
  const messages = useH2ChatStore((state) => state.messages)
  const isStreaming = useH2ChatStore((state) => state.isStreaming)
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [userScrolledUp, setUserScrolledUp] = useState(false)

  // Track last message content for scroll trigger during streaming
  const lastMessage = messages[messages.length - 1]
  const lastMessageContent = lastMessage && 'content' in lastMessage ? lastMessage.content : ''

  // Track previous message count to detect new user messages
  const prevMessagesLengthRef = useRef(messages.length)

  // RAF-based scroll to prevent jitter with fast-streaming models
  const scrollPendingRef = useRef(false)

  // Track last scroll position to detect actual scroll direction
  const lastScrollTopRef = useRef(0)

  // Theme-based scroll preservation
  const { theme } = useThemeStore()
  const scrollPositionRef = useRef<number>(0)
  const prevThemeRef = useRef(theme)

  // Detect if user is at bottom of scroll and track manual scroll-up
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 100
    setIsAtBottom(atBottom)

    // Detect ACTUAL user scroll-up (scrollTop decreased)
    // 5px threshold ignores micro-movements from content growth
    const scrolledUp = scrollTop < lastScrollTopRef.current - 5

    // Only pause auto-scroll if user actually scrolled up during streaming
    if (scrolledUp && isStreaming) {
      setUserScrolledUp(true)
    }
    // Reset when user returns to bottom
    if (atBottom) {
      setUserScrolledUp(false)
    }

    lastScrollTopRef.current = scrollTop
  }, [isStreaming])

  // Save scroll position when theme changes
  useLayoutEffect(() => {
    if (scrollRef.current) {
      scrollPositionRef.current = scrollRef.current.scrollTop
    }
  }, [theme])

  // Restore scroll position after theme-induced re-renders
  useLayoutEffect(() => {
    if (prevThemeRef.current !== theme && scrollRef.current) {
      scrollRef.current.scrollTop = scrollPositionRef.current
      prevThemeRef.current = theme
    }
  })

  // Auto-scroll: respects user scroll intent while maintaining fast-streaming support
  // Uses RAF to coalesce rapid updates and prevent jitter with fast-streaming models
  useEffect(() => {
    const isNewMessage = messages.length > prevMessagesLengthRef.current
    const lastIsUser = lastMessage?.role === 'user'

    // Check if last message is actively streaming content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isContentStreaming = (lastMessage as any)?.isStreaming === true

    // Should scroll:
    // 1. User hasn't manually scrolled up (respects user intent)
    // 2. AND one of: content streaming, at bottom, or new user message
    const shouldScroll = !userScrolledUp && (isContentStreaming || isAtBottom || (isNewMessage && lastIsUser))

    if (messagesEndRef.current && shouldScroll && !scrollPendingRef.current) {
      scrollPendingRef.current = true
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        scrollPendingRef.current = false
      })
    }

    prevMessagesLengthRef.current = messages.length
  }, [messages.length, isStreaming, lastMessageContent, isAtBottom, lastMessage?.role, userScrolledUp, lastMessage])

  // Scroll to bottom handler (for button)
  // Don't set isAtBottom immediately - let handleScroll detect it naturally
  // This allows the button to stay visible during the smooth scroll animation
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  return (
    <div className="h-full relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 lg:px-8 pt-6 pb-32 scroll-smooth"
      >
        <div className="max-w-4xl mx-auto">
          {messages.map((message) => {
            switch (message.role) {
              case 'user':
                return <UserMessage key={message.id} message={message} />
              case 'assistant':
                return <AIMessage key={message.id} message={message} />
              case 'system':
                return <SystemMessage key={message.id} message={message} />
              case 'tool':
                return <ToolMessage key={message.id} message={message as ToolMessageType} />
              default:
                return null
            }
          })}

          {/* Thinking Indicator - shows before AI starts responding */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {isStreaming && messages.length > 0 && !(messages[messages.length - 1] as any)?.isStreaming && (
            <ThinkingIndicator />
          )}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Scroll to bottom button (ChatGPT/Claude-style) */}
      {/* Positioned relative to chat area, always centered regardless of sidebar */}
      {!isAtBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-all shadow-lg"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
