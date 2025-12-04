'use client'

import { useEffect, useRef, useLayoutEffect } from 'react'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { useThemeStore } from '@/stores/useThemeStore'
import { UserMessage } from './UserMessage'
import { AIMessage } from './AIMessage'
import { SystemMessage } from './SystemMessage'
import { ToolMessage } from './ToolMessage'
import { ThinkingIndicator } from './ThinkingIndicator'
import type { ToolMessage as ToolMessageType } from '@/lib/h2/types'

/**
 * MessageList Component (H2 Enabled)
 *
 * Renders all messages from H2 agent with real-time streaming.
 * Features: Auto-scroll, streaming support, progress indicators.
 */
export function MessageList() {
  const messages = useH2ChatStore((state) => state.messages)
  const isStreaming = useH2ChatStore((state) => state.isStreaming)
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Theme-based scroll preservation
  const { theme } = useThemeStore()
  const scrollPositionRef = useRef<number>(0)
  const prevThemeRef = useRef(theme)

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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, isStreaming])

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-4 lg:px-8 pt-6 pb-32">
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
  )
}
