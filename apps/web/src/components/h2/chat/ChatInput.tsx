'use client'

import { useState, useRef, useEffect } from 'react'
import { useThemeStore } from '@/stores/useThemeStore'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { useH2Agent } from '@/hooks/useH2Agent'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { Send, Settings } from 'lucide-react'
import { ModePopover } from './ModePopover'

/**
 * ChatInput Component (H2 Enabled)
 *
 * Auto-resize textarea with send button and settings gear.
 * Now integrated with H2 LangChain agent via SSE streaming.
 */
export function ChatInput() {
  const { theme } = useThemeStore()
  const tokensLoading = useH2ChatStore((state) => state.tokensLoading)
  const { sendMessage, isStreaming } = useH2Agent()
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

        <LiquidGlassPanel
          theme={theme}
          className="rounded-[24px] p-3 flex items-center gap-2"
          blurAmount={6}
          displacementScale={0.3}
          stdDeviation={0.03}
        >
        {/* Settings Gear */}
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

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={!input.trim() || isStreaming || tokensLoading}
          className="flex-shrink-0 p-2 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Send message"
        >
          <Send className="w-5 h-5" />
        </button>
      </LiquidGlassPanel>
      </div>
    </div>
  )
}
