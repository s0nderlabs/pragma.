'use client'

import { useState, useRef, useEffect } from 'react'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { useAgentContext } from '@/contexts/H2AgentContext'
import { Settings, ArrowUpRight } from 'lucide-react'
import { ModePopover } from './ModePopover'

/**
 * ChatInput Component (H2/H2.5 Compatible)
 *
 * Auto-resize textarea with send button and settings gear.
 * Works with both H2 (server-side) and H2.5 (client-side) agents via context.
 */
export function ChatInput() {
  const tokensLoading = useH2ChatStore((state) => state.tokensLoading)
  const { sendMessage, isStreaming } = useAgentContext()
  const [input, setInput] = useState('')
  const [modePopoverOpen, setModePopoverOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const gearButtonRef = useRef<HTMLButtonElement>(null)

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

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
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
      <div className="w-full max-w-4xl relative">
        {/* Mode Popover */}
        <ModePopover
          isOpen={modePopoverOpen}
          onClose={() => setModePopoverOpen(false)}
          anchorRef={gearButtonRef}
        />

        <div
          className="rounded-[32px] p-3 flex items-center gap-2 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700"
        >
        {/* Settings Gear - Original Style */}
        <button
          ref={gearButtonRef}
          onClick={() => setModePopoverOpen(!modePopoverOpen)}
          className="flex-shrink-0 p-2 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Mode settings"
        >
          <Settings className="w-5 h-5 opacity-60" />
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tokensLoading ? "Loading tokens..." : "Ask anything about Monad..."}
          disabled={isStreaming || tokensLoading}
          rows={1}
          className="flex-1 bg-transparent resize-none outline-none text-sm lg:text-base min-h-[24px] max-h-[200px] placeholder:opacity-50 disabled:opacity-50"
          style={{ overflow: 'hidden' }}
        />

        {/* Send Button - Original Style */}
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
