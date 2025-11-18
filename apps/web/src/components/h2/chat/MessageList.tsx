'use client'

import { useEffect, useRef } from 'react'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { UserMessage } from './UserMessage'
import { AIMessage } from './AIMessage'
import { SystemMessage } from './SystemMessage'
import { QuoteMessage } from './QuoteMessage'
import { ThinkingIndicator } from './ThinkingIndicator'
import { ProgressIndicator } from './ProgressIndicator'
import { ActiveTools } from './ActiveTools'
import { MessageSquare } from 'lucide-react'

/**
 * MessageList Component (H2 Enabled)
 *
 * Renders all messages from H2 agent with real-time streaming.
 * Features: Auto-scroll, streaming support, progress indicators.
 */
export function MessageList() {
  const messages = useH2ChatStore((state) => state.messages)
  const isStreaming = useH2ChatStore((state) => state.isStreaming)
  const progress = useH2ChatStore((state) => state.progress)
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, isStreaming])

  // Empty state: No messages yet
  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="h-full flex flex-col items-center justify-center overflow-y-auto px-4 pb-32">
        <div className="text-center opacity-60 max-w-md">
          <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-40" />
          <h2 className="text-2xl font-semibold mb-2">Start a conversation</h2>
          <p className="text-sm opacity-80">
            Ask me anything about Monad - swaps, staking, NFTs, and more
          </p>
          <div className="mt-6 text-xs opacity-60 space-y-1">
            <p>💬 Try: "what's my balance?"</p>
            <p>🔄 Try: "swap 10 USDC to MON"</p>
            <p>📊 Try: "show all my balances"</p>
          </div>
        </div>
      </div>
    )
  }

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
            case 'quote':
              return <QuoteMessage key={message.id} message={message} />
            default:
              return null
          }
        })}

        {/* Active Tools - shows running/completed/error tool states */}
        <ActiveTools />

        {/* Progress Indicator - shows during tool execution */}
        {progress?.isVisible && <ProgressIndicator />}

        {/* Thinking Indicator - shows before AI starts responding */}
        {isStreaming && messages.length > 0 && !messages[messages.length - 1]?.isStreaming && (
          <ThinkingIndicator />
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
