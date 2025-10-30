'use client'

import { useEffect, useRef } from 'react'
import { useChatStore } from '@/stores/useChatStore'
import { UserMessage } from './UserMessage'
import { AIMessage } from './AIMessage'
import { SystemMessage } from './SystemMessage'
import { ThinkingIndicator } from './ThinkingIndicator'
import { MessageSquare } from 'lucide-react'

/**
 * MessageList Component
 *
 * Renders all messages in the active conversation.
 * Features: Auto-scroll, Lenis smooth scrolling, loading state.
 */
export function MessageList() {
  const { conversations, activeConversationId, isThinking } = useChatStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Get active conversation
  const activeConversation = conversations.find((c) => c.id === activeConversationId)
  const messages = activeConversation?.messages || []

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, isThinking])

  // Empty state: No active conversation
  if (!activeConversationId || messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto px-4">
        <div className="text-center opacity-60 max-w-md">
          <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-40" />
          <h2 className="text-2xl font-semibold mb-2">Start a conversation</h2>
          <p className="text-sm opacity-80">
            Ask me anything about Monad - swaps, staking, NFTs, and more
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 lg:px-8 py-6">
      <div className="max-w-4xl mx-auto">
        {messages.map((message) => {
          switch (message.role) {
            case 'user':
              return <UserMessage key={message.id} message={message} />
            case 'ai':
              return <AIMessage key={message.id} message={message} />
            case 'system':
              return <SystemMessage key={message.id} message={message} />
            default:
              return null
          }
        })}

        {isThinking && <ThinkingIndicator />}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
