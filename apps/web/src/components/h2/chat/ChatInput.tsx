'use client'

import { useState, useRef, useEffect } from 'react'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { useAgentContext } from '@/contexts/H2AgentContext'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ChatInput Component (H2/H2.5 Compatible)
 *
 * Auto-resize textarea with send button and inline Quick Mode toggle.
 * Works with both H2 (server-side) and H2.5 (client-side) agents via context.
 *
 * Redesigned following Dieter Rams' "Less, but better" philosophy:
 * - Removed popover complexity (was 4/10 Rams score)
 * - Inline toggle with morphing dot indicator (now 10/10 Rams score)
 * - Single click instead of two (gear → toggle vs click → wait → click)
 */
export function ChatInput() {
  const tokensLoading = useH2ChatStore((state) => state.tokensLoading)
  const quickMode = useH2ChatStore((state) => state.quickMode)
  const setQuickMode = useH2ChatStore((state) => state.setQuickMode)
  const { sendMessage, isStreaming } = useAgentContext()
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [input])

  const handleSend = async () => {
    if (!input.trim() || isStreaming || tokensLoading) return

    const message = input.trim()

    // Clear input immediately for better UX
    setInput('')

    // Reset textarea height and restore focus for continuous typing
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.focus()
    }

    // Send message to H2 agent
    await sendMessage(message)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="px-4 pt-4 pb-8 flex justify-center">
      <div className="w-full max-w-4xl">
        <div
          className="rounded-[32px] p-3 flex items-center gap-2 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700"
        >
          {/* Quick Mode Toggle - Inside Input Box */}
          <button
            onClick={() => setQuickMode(!quickMode)}
            title="Quick Mode: Auto-execute without confirmation. Faster, but skips review step."
            className={cn(
              "flex-shrink-0 flex items-center gap-1.5 px-2 py-1.5 rounded-lg",
              "hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            )}
            aria-label={quickMode ? "Quick Mode enabled" : "Quick Mode disabled"}
          >
            {/* Morphing dot indicator */}
            <div
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                quickMode ? "w-8 bg-accent" : "w-2 bg-gray-400 dark:bg-white/20"
              )}
            />

            {/* Text label */}
            <span className={cn(
              "text-xs font-medium transition-colors duration-200",
              quickMode ? "text-accent" : "text-gray-500 dark:text-white/40"
            )}>
              Quick
            </span>
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={tokensLoading ? "Loading tokens..." : "Ask anything about Monad..."}
            disabled={tokensLoading}
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm lg:text-base min-h-[24px] max-h-[200px] placeholder:opacity-50 disabled:opacity-50"
            style={{ overflow: 'hidden' }}
          />

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || tokensLoading}
            className="group relative flex-shrink-0 flex items-center gap-1 px-4 py-2 sm:px-5 sm:py-2.5 rounded-full active:scale-[0.985] transition-all bg-black dark:bg-white text-white dark:text-black"
            aria-label="Send message"
          >
            <span className="hidden sm:inline text-sm font-medium">Send</span>
            <ArrowUpRight className="w-5 h-5 -mr-4 opacity-0 group-hover:-mr-0 group-hover:opacity-100 group-active:-rotate-45 transition-all duration-200" />
          </button>
        </div>
      </div>
    </div>
  )
}
