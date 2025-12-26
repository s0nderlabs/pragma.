'use client'

import { useState, useCallback, useMemo } from 'react'
import { Copy, Check, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useH2ChatStore, selectHasActiveTools } from '@/stores/useH2ChatStore'
import { useAgentContext } from '@/contexts/H2AgentContext'
import { useIdentity } from '@/hooks/useIdentity'
import { submitFeedback, deleteFeedback } from '@/lib/analytics/feedback'

interface TurnMessageActionsProps {
  /** Index of the user message that started this turn */
  turnStartIndex: number
  /** Index of the last message in this turn (before next user message or end) */
  turnEndIndex: number
  /** Whether this is the current (active) turn */
  isCurrentTurn: boolean
  /** Additional class names */
  className?: string
}

type FeedbackType = 'positive' | 'negative' | null

/**
 * TurnMessageActions Component
 *
 * Action buttons rendered at turn boundaries (after all messages in a turn).
 * This ensures buttons appear AFTER tool messages, not between assistant and tools.
 *
 * - Copy: Copy all assistant content from the turn
 * - Thumbs Up/Down: Send feedback for the turn
 * - Retry: Re-send the turn's user message
 *
 * Shows on hover, hidden during streaming/active tools in current turn.
 */
export function TurnMessageActions({
  turnStartIndex,
  turnEndIndex,
  isCurrentTurn,
  className,
}: TurnMessageActionsProps) {
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackType>(null)

  const { sendMessage } = useAgentContext()
  const { wallet } = useIdentity()

  const messages = useH2ChatStore((state) => state.messages)
  const globalIsStreaming = useH2ChatStore((state) => state.isStreaming)
  const hasActiveTools = useH2ChatStore(selectHasActiveTools)

  // Get the user message content for this turn
  const userMessage = useMemo(() => {
    const msg = messages[turnStartIndex]
    if (msg?.role === 'user' && 'content' in msg) {
      return { id: msg.id, content: msg.content as string }
    }
    return null
  }, [messages, turnStartIndex])

  // Get the last assistant message ID in this turn (for feedback tracking)
  const lastAssistantId = useMemo(() => {
    for (let i = turnEndIndex; i > turnStartIndex; i--) {
      if (messages[i]?.role === 'assistant') {
        return messages[i].id
      }
    }
    return null
  }, [messages, turnStartIndex, turnEndIndex])

  // Collect ALL assistant content from this turn for copy/feedback
  const fullTurnContent = useMemo(() => {
    const assistantContents: string[] = []
    for (let i = turnStartIndex + 1; i <= turnEndIndex; i++) {
      const msg = messages[i]
      if (msg?.role === 'assistant' && 'content' in msg && msg.content) {
        assistantContents.push(msg.content as string)
      }
    }
    return assistantContents.join('\n\n')
  }, [messages, turnStartIndex, turnEndIndex])

  // Handle copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!fullTurnContent) return
    try {
      await navigator.clipboard.writeText(fullTurnContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [fullTurnContent])

  // Handle feedback (thumbs up/down)
  const handleFeedback = useCallback(async (type: 'positive' | 'negative') => {
    if (!lastAssistantId) return

    // Toggle feedback if clicking same button (undo)
    if (feedback === type) {
      setFeedback(null)
      await deleteFeedback(lastAssistantId)
      return
    }

    // If switching from one to another, delete old feedback first
    if (feedback !== null) {
      await deleteFeedback(lastAssistantId)
    }

    setFeedback(type)

    // Submit feedback to analytics
    await submitFeedback({
      messageId: lastAssistantId,
      type,
      content: fullTurnContent,
      userMessage: userMessage?.content,
      userAddress: wallet?.address,
    })

    // For negative feedback, inject context for next message
    if (type === 'negative') {
      useH2ChatStore.getState().setNegativeFeedbackContext(
        '[User indicated previous response was unhelpful. Please provide a different approach.]'
      )
    }
  }, [feedback, lastAssistantId, fullTurnContent, userMessage, wallet?.address])

  // Handle retry - re-send this turn's user message
  const handleRetry = useCallback(async () => {
    if (!userMessage) return

    // Delete from this turn's user message onwards (Branch/Revert)
    useH2ChatStore.getState().deleteMessagesFromIndex(turnStartIndex)

    // Retry with this turn's original question
    await sendMessage(userMessage.content, {
      isRetry: true,
      skipAddMessage: false,
    })
  }, [userMessage, turnStartIndex, sendMessage])

  // Don't show if no assistant content in this turn
  if (!fullTurnContent || !lastAssistantId) return null

  // Don't show while agent is working (only for current turn)
  if (isCurrentTurn && (globalIsStreaming || hasActiveTools)) return null

  return (
    <div
      className={cn(
        'flex items-center gap-1 mt-3 mb-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200',
        className
      )}
    >
      {/* Copy */}
      <button
        onClick={handleCopy}
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
        title="Copy to clipboard"
        aria-label="Copy message"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <Copy className="w-3.5 h-3.5 text-gray-400 dark:text-white/30" />
        )}
      </button>

      {/* Thumbs Up */}
      <button
        onClick={() => handleFeedback('positive')}
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
        title="Good response"
        aria-label="Thumbs up"
      >
        <ThumbsUp
          className={cn(
            'w-3.5 h-3.5 transition-colors',
            feedback === 'positive'
              ? 'text-terracotta fill-terracotta'
              : 'text-gray-400 dark:text-white/30'
          )}
        />
      </button>

      {/* Thumbs Down */}
      <button
        onClick={() => handleFeedback('negative')}
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
        title="Bad response"
        aria-label="Thumbs down"
      >
        <ThumbsDown
          className={cn(
            'w-3.5 h-3.5 transition-colors',
            feedback === 'negative'
              ? 'text-terracotta fill-terracotta'
              : 'text-gray-400 dark:text-white/30'
          )}
        />
      </button>

      {/* Retry */}
      <button
        onClick={handleRetry}
        disabled={!userMessage}
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Retry this turn"
        aria-label="Retry"
      >
        <RotateCcw className="w-3.5 h-3.5 text-gray-400 dark:text-white/30" />
      </button>
    </div>
  )
}
