'use client'

import { useEffect, useRef, useLayoutEffect, useState, useCallback, useMemo } from 'react'
import { useH2ChatStore, selectWasStoppedWithInFlightTx } from '@/stores/useH2ChatStore'
import { useThemeStore } from '@/stores/useThemeStore'
import { UserMessage } from './UserMessage'
import { AIMessage } from './AIMessage'
import { SystemMessage } from './SystemMessage'
import { ToolMessage } from './ToolMessage'
import { ThinkingIndicator } from './ThinkingIndicator'
import { TurnMessageActions } from './TurnMessageActions'
import { ChevronDown } from 'lucide-react'
import { useAgentContext } from '@/contexts/H2AgentContext'
import type { ToolMessage as ToolMessageType } from '@/lib/h2/types'

/** Red color for error states (matches AIMessage.tsx) */
const ERROR_COLOR = '#DC2626'

/**
 * Unicode star spinner frames (same as ThinkingBubble)
 */
const SPINNER_FRAMES = ['✦', '✧', '✶', '✷', '✸', '✹', '✺', '✻']

type StopType = 'early' | 'normal' | 'transaction'

/**
 * Stopped Indicator Component (matches ThinkingBubble style)
 * - Animates star through all frames ONCE then stops
 * - Shimmer effect on text that fades out
 */
function StoppedIndicator({ type }: { type: StopType }) {
  const [frameIndex, setFrameIndex] = useState(0)
  const [animationComplete, setAnimationComplete] = useState(false)
  const cycleCountRef = useRef(0)

  // Animate the star through all frames 3 times at normal speed
  useEffect(() => {
    if (animationComplete) return

    const interval = setInterval(() => {
      setFrameIndex((prev) => {
        const next = prev + 1
        if (next >= SPINNER_FRAMES.length) {
          cycleCountRef.current += 1
          if (cycleCountRef.current >= 3) {
            setAnimationComplete(true)
            return 0 // Reset to first frame when done
          }
          return 0 // Start next cycle
        }
        return next
      })
    }, 100) // Normal speed like ThinkingBubble

    return () => clearInterval(interval)
  }, [animationComplete])

  // Color and message based on stop type
  const config = {
    early: {
      color: '#E07A5F', // Terracotta (matches ThinkingBubble)
      message: "Changed your mind? No worries",
    },
    normal: {
      color: '#E07A5F', // Terracotta (matches ThinkingBubble)
      message: "Got it, stopping here",
    },
    transaction: {
      color: '#F59E0B', // Amber
      message: "Heads up — your transaction might still go through",
    },
  }[type]

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 text-sm">
        {/* Animated spinner - animates once then stops */}
        <span className="text-2xl font-mono flex-shrink-0" style={{ color: config.color }}>
          {SPINNER_FRAMES[frameIndex]}
        </span>

        {/* Message text - solid color, no shimmer */}
        <span
          className="text-sm font-medium"
          style={{ color: config.color, opacity: 0.9 }}
        >
          {config.message}
        </span>
      </div>
    </div>
  )
}

/**
 * ExhaustedBanner Component
 *
 * Shows when auto-retries are exhausted.
 * Uses animated star that cycles 3 times then stops.
 * Rendered at turn end (after all messages including tools).
 */
function ExhaustedBanner({ onRetry, disabled }: { onRetry: () => void; disabled: boolean }) {
  const [frameIndex, setFrameIndex] = useState(0)
  const [animationComplete, setAnimationComplete] = useState(false)
  const cycleCountRef = useRef(0)

  // Animate star 3 times then stop
  useEffect(() => {
    if (animationComplete) return

    const interval = setInterval(() => {
      setFrameIndex((prev) => {
        const next = prev + 1
        if (next >= SPINNER_FRAMES.length) {
          cycleCountRef.current += 1
          if (cycleCountRef.current >= 3) {
            setAnimationComplete(true)
            return 0
          }
          return 0
        }
        return next
      })
    }, 100)

    return () => clearInterval(interval)
  }, [animationComplete])

  return (
    <div className="mt-3 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-2xl font-mono flex-shrink-0" style={{ color: ERROR_COLOR }}>
            {SPINNER_FRAMES[frameIndex]}
          </span>
          <span className="text-sm font-medium" style={{ color: ERROR_COLOR, opacity: 0.9 }}>
            Something went wrong
          </span>
        </div>
        <button
          onClick={onRetry}
          disabled={disabled}
          className="text-sm font-medium hover:underline disabled:opacity-50"
          style={{ color: ERROR_COLOR }}
        >
          Retry
        </button>
      </div>
    </div>
  )
}

/**
 * MessageList Component (H2 Enabled)
 *
 * Renders all messages from H2 agent with real-time streaming.
 * Features: Auto-scroll (ChatGPT/Claude-style), streaming support, progress indicators.
 */
export function MessageList() {
  const messages = useH2ChatStore((state) => state.messages)
  const isStreaming = useH2ChatStore((state) => state.isStreaming)
  const isAutoRetrying = useH2ChatStore((state) => state.isAutoRetrying)
  const stoppedMessageIds = useH2ChatStore((state) => state.stoppedMessageIds)
  const earlyStopUserMessageId = useH2ChatStore((state) => state.earlyStopUserMessageId)
  const exhaustedRetryMessageId = useH2ChatStore((state) => state.exhaustedRetryMessageId)
  const lastUserMessageContent = useH2ChatStore((state) => state.lastUserMessageContent)

  // Get sendMessage from agent context
  const { sendMessage } = useAgentContext()

  // Handle manual retry after auto-retry exhausted
  const handleManualRetry = useCallback(async () => {
    if (isStreaming || !lastUserMessageContent) return

    // Reset exhausted state and retry
    useH2ChatStore.getState().setExhaustedRetryMessageId(null)

    // Use isRetry: true to inject instruction hidden (not visible in chat)
    // Use skipAddMessage: true to avoid duplicate user message
    await sendMessage(lastUserMessageContent, { isRetry: true, skipAddMessage: true })
  }, [sendMessage, isStreaming, lastUserMessageContent])

  // Check if the last turn was stopped (find the last assistant message that was stopped)
  const lastTurnStoppedInfo = useMemo(() => {
    if (messages.length === 0) return null

    // Find the last user message (start of current/last turn)
    let lastUserIndex = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIndex = i
        break
      }
    }

    // Check if any assistant message in the last turn was stopped
    for (let i = lastUserIndex + 1; i < messages.length; i++) {
      const msg = messages[i]
      if (msg.role === 'assistant' && stoppedMessageIds.has(msg.id)) {
        return { messageId: msg.id }
      }
    }

    return null
  }, [messages, stoppedMessageIds])

  // Check if stopped with in-flight transaction
  const wasStoppedWithTx = useH2ChatStore((state) =>
    lastTurnStoppedInfo ? selectWasStoppedWithInFlightTx(state, lastTurnStoppedInfo.messageId) : false
  )

  // Determine stop type for the indicator
  const stopType: StopType | null = useMemo(() => {
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()

    // Early stop - user stopped before agent responded
    if (earlyStopUserMessageId) {
      // Check if this is the last user message (to show indicator after it)
      if (lastUserMessage?.id === earlyStopUserMessageId) {
        return 'early'
      }
    }

    // Normal or transaction stop - agent was responding
    if (lastTurnStoppedInfo) {
      return wasStoppedWithTx ? 'transaction' : 'normal'
    }

    return null
  }, [earlyStopUserMessageId, lastTurnStoppedInfo, wasStoppedWithTx, messages, isStreaming])
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
        className="h-full overflow-y-auto overflow-x-hidden px-4 lg:px-8 pt-6 pb-32 scroll-smooth"
      >
        <div className="max-w-4xl mx-auto group">
          {messages.map((message, index) => {
            // Render the message
            let messageElement: React.ReactNode = null
            switch (message.role) {
              case 'user':
                messageElement = <UserMessage key={message.id} message={message} />
                break
              case 'assistant':
                messageElement = <AIMessage key={message.id} message={message} />
                break
              case 'system':
                messageElement = <SystemMessage key={message.id} message={message} />
                break
              case 'tool':
                messageElement = <ToolMessage key={message.id} message={message as ToolMessageType} />
                break
              default:
                return null
            }

            // Check if this is the last message before a user message (turn boundary)
            // or the last message overall
            const nextMessage = messages[index + 1]
            const isLastInTurn = !nextMessage || nextMessage.role === 'user'
            const isCurrentTurn = index >= (messages.findLastIndex(m => m.role === 'user'))

            // Find the turn start (user message) for this turn
            let turnStartIndex = -1
            for (let i = index; i >= 0; i--) {
              if (messages[i].role === 'user') {
                turnStartIndex = i
                break
              }
            }

            // Only render TurnMessageActions at turn boundaries (after last message in turn)
            // and only if there's assistant content in the turn
            const hasAssistantInTurn = turnStartIndex >= 0 &&
              messages.slice(turnStartIndex + 1, index + 1).some(m => m.role === 'assistant')

            return (
              <div key={message.id}>
                {messageElement}
                {isLastInTurn && hasAssistantInTurn && (
                  <TurnMessageActions
                    turnStartIndex={turnStartIndex}
                    turnEndIndex={index}
                    isCurrentTurn={isCurrentTurn}
                  />
                )}
              </div>
            )
          })}

          {/* Thinking Indicator - shows before AI starts responding, or retry message when retrying */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(isStreaming || isAutoRetrying) && messages.length > 0 && !(messages[messages.length - 1] as any)?.isStreaming && (
            <ThinkingIndicator isRetrying={isAutoRetrying} />
          )}

          {/* Stopped Indicator - shows after all messages when turn was stopped */}
          {/* Only show for 'early' (stop before agent responds) and 'transaction' (stop mid-tx) */}
          {(stopType === 'early' || stopType === 'transaction') && !isStreaming && (
            <StoppedIndicator type={stopType} />
          )}

          {/* Exhausted Banner - shows after all messages when auto-retry exhausted */}
          {exhaustedRetryMessageId && !isStreaming && (
            <ExhaustedBanner onRetry={handleManualRetry} disabled={isStreaming} />
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
          className="absolute bottom-36 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-all shadow-lg"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
