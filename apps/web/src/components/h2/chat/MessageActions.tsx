'use client'

import { useState, useCallback, useMemo } from 'react'
import { Copy, Check, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useH2ChatStore, selectHasActiveTools } from '@/stores/useH2ChatStore'
import { useAgentContext } from '@/contexts/H2AgentContext'
import { useIdentity } from '@/hooks/useIdentity'
import { submitFeedback, deleteFeedback } from '@/lib/analytics/feedback'

interface MessageActionsProps {
  /** Message ID for feedback tracking */
  messageId: string
  /** Message content for copy functionality */
  content: string
  /** Whether the message is currently streaming */
  isStreaming?: boolean
  /** Additional class names */
  className?: string
}

type FeedbackType = 'positive' | 'negative' | null

/**
 * MessageActions Component
 *
 * Action buttons for AI message responses:
 * - Copy: Copy message content to clipboard
 * - Thumbs Up/Down: Send feedback (analytics + context injection for negative)
 * - Retry: Re-send the last user message with reminder prompt
 *
 * Shows on hover, hidden during streaming.
 * IMPORTANT: Only shows when agent is FULLY done (not between tool calls).
 */
export function MessageActions({
  messageId,
  content,
  isStreaming,
  className,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackType>(null)

  const { sendMessage } = useAgentContext()
  const { wallet } = useIdentity()
  // BUG FIX: Check multiple indicators to prevent showing between tool calls
  // 1. globalIsStreaming - overall streaming state
  // 2. hasActiveTools - tools are actively running (most reliable during tool execution)
  // 3. isLastAssistantMessage - only show on the FINAL assistant message
  const globalIsStreaming = useH2ChatStore((state) => state.isStreaming)
  const hasActiveTools = useH2ChatStore(selectHasActiveTools)
  const messages = useH2ChatStore((state) => state.messages)

  // CRITICAL FIX: Only show on the LAST ASSISTANT message IN EACH TURN
  // When tools are called, the assistant message is "split" into multiple messages.
  // A "turn" = user message + all assistant/tool messages until the next user message.
  // We only check for subsequent assistant messages, not tool messages (tools don't have buttons).
  const isLastAssistantInTurn = useMemo(() => {
    // Find this message's index
    const thisIndex = messages.findIndex(m => m.id === messageId)
    if (thisIndex === -1) return false

    // Find the next user message after this one (or end of array)
    let nextUserIndex = messages.length
    for (let i = thisIndex + 1; i < messages.length; i++) {
      if (messages[i].role === 'user') {
        nextUserIndex = i
        break
      }
    }

    // Check if there's another ASSISTANT message between this and the next user message
    // Only check for assistant messages - tool messages don't have MessageActions
    // This ensures buttons show on the last assistant of each turn, regardless of trailing tools
    for (let i = thisIndex + 1; i < nextUserIndex; i++) {
      if (messages[i].role === 'assistant') {
        return false // Another assistant exists after this one in the same turn
      }
    }

    return true // This is the last assistant in this turn
  }, [messages, messageId])

  // BUG FIX: Determine if this message is in the CURRENT (streaming) turn
  // Only apply streaming checks to messages in the current turn.
  // Previous turns should always show MessageActions when they're the last assistant in their turn.
  const isInCurrentTurn = useMemo(() => {
    // Find the last user message index (start of current turn)
    let lastUserIndex = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIndex = i
        break
      }
    }

    // Find this message's index
    const thisIndex = messages.findIndex(m => m.id === messageId)

    // This message is in current turn if it comes AFTER the last user message
    return thisIndex > lastUserIndex
  }, [messages, messageId])

  // BUG FIX: Find the user message that started THIS turn (for retry)
  // This allows retrying a specific turn instead of always the last turn
  const thisTurnUserMessage = useMemo(() => {
    const thisIndex = messages.findIndex(m => m.id === messageId)
    if (thisIndex === -1) return null

    // Walk backwards from this message to find the user message that started this turn
    for (let i = thisIndex - 1; i >= 0; i--) {
      const msg = messages[i]
      // Only user messages have content property we need
      if (msg.role === 'user') {
        // Cast to access content - user messages always have content
        const userMsg = msg as { role: 'user'; content: string }
        return { index: i, content: userMsg.content }
      }
    }
    return null
  }, [messages, messageId])

  // BUG FIX: Collect ALL assistant content from this turn for copy/feedback
  // When tools are called, the response is split into multiple messages.
  // We need to concatenate all assistant content from this turn.
  const fullTurnContent = useMemo(() => {
    if (!thisTurnUserMessage) return content // Fallback to prop content

    const thisIndex = messages.findIndex(m => m.id === messageId)
    if (thisIndex === -1) return content

    // Find the next user message (end of this turn)
    let nextUserIndex = messages.length
    for (let i = thisTurnUserMessage.index + 1; i < messages.length; i++) {
      if (messages[i].role === 'user') {
        nextUserIndex = i
        break
      }
    }

    // Collect all assistant content between this turn's user and next user
    const assistantContents: string[] = []
    for (let i = thisTurnUserMessage.index + 1; i < nextUserIndex; i++) {
      const msg = messages[i]
      if (msg.role === 'assistant' && 'content' in msg && msg.content) {
        assistantContents.push(msg.content as string)
      }
    }

    return assistantContents.join('\n\n') || content
  }, [messages, messageId, thisTurnUserMessage, content])

  // Handle copy to clipboard
  // BUG FIX: Use fullTurnContent to copy entire turn's response, not just this split message
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullTurnContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [fullTurnContent])

  // Handle feedback (thumbs up/down)
  // BUG FIX: Use thisTurnUserMessage for correct user question
  // BUG FIX: Use fullTurnContent for entire turn's response, not just this split message
  // BUG FIX: Handle switching between thumbs up/down (delete old before submitting new)
  const handleFeedback = useCallback(async (type: 'positive' | 'negative') => {
    // Toggle feedback if clicking same button (undo)
    if (feedback === type) {
      setFeedback(null)
      // Delete the feedback record from database
      await deleteFeedback(messageId)
      return
    }

    // If switching from one to another (e.g., thumbs up → thumbs down)
    // Delete old feedback first to avoid duplicate records
    if (feedback !== null) {
      await deleteFeedback(messageId)
    }

    setFeedback(type)

    // Submit feedback to analytics (Supabase)
    // Stores both user's question and AI's response for full context (2 turns)
    // Use fullTurnContent to include entire response (all split messages)
    await submitFeedback({
      messageId,
      type,
      content: fullTurnContent,
      userMessage: thisTurnUserMessage?.content || undefined,
      userAddress: wallet?.address,
    })

    // For negative feedback, inject context for next message
    // This helps the agent understand the previous response was unhelpful
    if (type === 'negative') {
      useH2ChatStore.getState().setNegativeFeedbackContext(
        '[User indicated previous response was unhelpful. Please provide a different approach.]'
      )
    }
  }, [feedback, messageId, fullTurnContent, thisTurnUserMessage, wallet?.address])

  // Handle retry - re-send THIS turn's user message with hidden reminder
  // BUG FIX: Use "Branch/Revert" approach - delete from THIS turn onwards, then retry
  // This ensures retrying Turn 1 doesn't accidentally retry Turn 3
  const handleRetry = useCallback(async () => {
    if (!thisTurnUserMessage) return

    // Delete from this turn's user message onwards (Branch/Revert)
    // This removes this turn + all subsequent turns, then retries
    useH2ChatStore.getState().deleteMessagesFromIndex(thisTurnUserMessage.index)

    // Retry with this turn's original question
    // skipAddMessage: false because we deleted the user message too
    await sendMessage(thisTurnUserMessage.content, {
      isRetry: true,
      skipAddMessage: false,
    })
  }, [thisTurnUserMessage, sendMessage])

  // Don't show actions while agent is working
  // Defense-in-depth: check multiple indicators to prevent showing between tool calls
  // - isLastAssistantInTurn: MUST be the LAST assistant message of THIS turn
  // - For CURRENT turn only: also check streaming state and active tools
  // - Previous turns: only need isLastAssistantInTurn check (always show buttons)
  //
  // BUG FIX: Previous turns should ALWAYS show MessageActions, not be hidden by globalIsStreaming
  // BUG FIX: Only check for assistant messages after (not tool) - tools don't have MessageActions
  if (!isLastAssistantInTurn) return null
  if (isInCurrentTurn && (isStreaming || globalIsStreaming || hasActiveTools)) return null

  return (
    <div
      className={cn(
        'flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200',
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
        disabled={!thisTurnUserMessage}
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Retry this turn"
        aria-label="Retry"
      >
        <RotateCcw className="w-3.5 h-3.5 text-gray-400 dark:text-white/30" />
      </button>
    </div>
  )
}
