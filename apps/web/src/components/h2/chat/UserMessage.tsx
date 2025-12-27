'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@/lib/h2/types'
import { useAgentContext } from '@/contexts/H2AgentContext'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { Copy, Check, Pencil, Info } from 'lucide-react'
import gsap from 'gsap'

interface UserMessageProps {
  message: ChatMessage
}

/**
 * Format timestamp to readable time (e.g., "8:53 AM")
 */
const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * UserMessage Component
 *
 * User messages appear as glass bubbles, right-aligned.
 * Features: Timestamp display, copy button, edit with branch/resubmit.
 */
export function UserMessage({ message }: UserMessageProps) {
  const messageRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Edit state - decoupled for smooth animation
  // isEditing: controls width style (100% vs savedWidth)
  // showEditUI: controls content rendering (textarea vs p) - delayed on cancel
  const [isEditing, setIsEditing] = useState(false)
  const [showEditUI, setShowEditUI] = useState(false)
  const [editContent, setEditContent] = useState(message.content)

  // Saved width for smooth animation (CSS can't animate to/from 'auto')
  const [savedWidth, setSavedWidth] = useState<number | null>(null)

  // Copy state
  const [copied, setCopied] = useState(false)

  // Agent context for resubmit
  const { sendMessage, isStreaming } = useAgentContext()

  // Can edit only when not streaming
  const canEdit = !isStreaming

  // Slide-in animation on mount
  useEffect(() => {
    if (!messageRef.current) return

    gsap.fromTo(
      messageRef.current,
      { x: 50, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.4, ease: 'power2.out' }
    )
  }, [])

  // Focus and auto-resize textarea when entering edit mode
  useEffect(() => {
    if (showEditUI && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      )
      // Auto-resize
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [showEditUI])

  // Auto-resize textarea on content change
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${e.target.scrollHeight}px`
  }

  // Copy handler
  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Start edit mode - capture current width for smooth animation
  const handleStartEdit = () => {
    if (!canEdit) return
    // Capture the natural width before expanding
    if (containerRef.current) {
      setSavedWidth(containerRef.current.offsetWidth)
    }
    setEditContent(message.content)
    setShowEditUI(true)  // Show edit content first
    setIsEditing(true)   // Then trigger width animation
  }

  // Cancel edit - animate width first, then swap content after animation completes
  const handleCancel = () => {
    setIsEditing(false)  // Triggers width animation, but content stays (showEditUI still true)
    setEditContent(message.content)

    const container = containerRef.current
    if (!container) {
      setShowEditUI(false)
      setSavedWidth(null)
      return
    }

    const handleTransitionEnd = (e: TransitionEvent) => {
      // Only react to width transition, not other properties
      if (e.propertyName !== 'width') return

      container.removeEventListener('transitionend', handleTransitionEnd)

      // NOW swap content - width is already settled, no shake
      setShowEditUI(false)

      // Clean up savedWidth without animation
      container.style.transition = 'none'
      setSavedWidth(null)

      // Double rAF ensures the style change is applied before re-enabling transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (containerRef.current) {
            containerRef.current.style.transition = ''
          }
        })
      })
    }

    container.addEventListener('transitionend', handleTransitionEnd)
  }

  // Save edit and resubmit (branch conversation)
  const handleSave = async () => {
    if (!editContent.trim() || editContent === message.content) {
      handleCancel()
      return
    }

    const store = useH2ChatStore.getState()
    const messages = store.messages
    const index = messages.findIndex((m) => m.id === message.id)

    if (index === -1) {
      handleCancel()
      return
    }

    // 1. Delete all messages after this one
    store.deleteMessagesFromIndex(index + 1)

    // 2. Update this message's content
    store.updateMessageContent(message.id, editContent)

    // 3. Exit edit mode (immediate swap OK - messages will be deleted anyway)
    setIsEditing(false)
    setShowEditUI(false)
    setSavedWidth(null)  // Clear so message uses auto width like normal send

    // 4. Re-send the message (skip adding since we just updated it)
    await sendMessage(editContent, { skipAddMessage: true })
  }

  // Handle keyboard shortcuts in textarea
  // Enter = send, Shift+Enter = new line, Escape = cancel
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
    // Shift + Enter allows default behavior (new line)
  }

  return (
    <div ref={messageRef} className="flex justify-end mb-4 group">
      {/* Container with CSS transition for smooth width change */}
      {/* Uses savedWidth (pixels) instead of 'auto' because CSS can't animate to/from auto */}
      <div
        ref={containerRef}
        className={`transition-[width,max-width] duration-500 ease-out ${
          isEditing ? '' : 'w-fit max-w-[80%] lg:max-w-[60%]'
        }`}
        style={{
          width: isEditing ? '100%' : (savedWidth ? `${savedWidth}px` : undefined),
          maxWidth: isEditing ? '100%' : undefined,
        }}
      >
        {/* Bubble - w-fit when not editing prevents expanding to container width when timestamp row is wider */}
        <div className={`rounded-[24px] px-5 py-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 ${showEditUI ? '' : 'w-fit'}`}>
          {showEditUI ? (
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              className="w-full p-0 m-0 block bg-transparent text-sm lg:text-base leading-normal resize-none outline-none min-h-[24px] text-gray-900 dark:text-gray-100"
              rows={1}
            />
          ) : (
            <p className="text-sm lg:text-base leading-normal whitespace-pre-wrap break-words break-all m-0">
              {message.content}
            </p>
          )}
        </div>

        {/* Bottom row - edit row only when actively editing, timestamp row otherwise */}
        {showEditUI && isEditing ? (
          <div className="flex items-center justify-between mt-3 px-1">
            <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              <Info className="w-3.5 h-3.5" />
              <span>Editing will regenerate the response</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCancel}
                className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!editContent.trim()}
                className="px-3 py-1 text-sm rounded-full bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between mt-1.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              {formatTime(message.timestamp)}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleStartEdit}
                disabled={!canEdit}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Edit message"
              >
                <Pencil className="w-3.5 h-3.5 text-gray-400 dark:text-white/30" />
              </button>
              <button
                onClick={handleCopy}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                title="Copy message"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-gray-400 dark:text-white/30" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
