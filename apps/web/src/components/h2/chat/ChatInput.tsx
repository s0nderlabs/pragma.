'use client'

import { useState, useRef, useEffect } from 'react'
import { useThemeStore } from '@/stores/useThemeStore'
import { useChatStore } from '@/stores/useChatStore'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { Send, Settings } from 'lucide-react'

interface ChatInputProps {
  onSettingsClick?: () => void
}

/**
 * ChatInput Component
 *
 * Auto-resize textarea with send button and settings gear.
 * Design: Glass morphism input bar at bottom of chat.
 */
export function ChatInput({ onSettingsClick }: ChatInputProps) {
  const { theme } = useThemeStore()
  const { addMessage, isThinking, activeConversationId, createConversation } = useChatStore()
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [input])

  const handleSend = () => {
    if (!input.trim() || isThinking) return

    // Create conversation if none exists
    if (!activeConversationId) {
      createConversation()
    }

    // Add user message
    addMessage({
      role: 'user',
      content: input.trim(),
    })

    // Clear input
    setInput('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    // TODO: Trigger AI response (mock for now)
    // In production, this would call the LangChain agent
    setTimeout(() => {
      useChatStore.getState().setThinking(true)
      setTimeout(() => {
        useChatStore.getState().setThinking(false)
        addMessage({
          role: 'ai',
          content: 'This is a mock AI response. The LangChain agent integration will be added in the next phase.',
        })
      }, 2000)
    }, 500)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="p-4 flex justify-center">
      <div className="w-full max-w-4xl">
        <LiquidGlassPanel
          theme={theme}
          className="rounded-[24px] p-3 flex items-center gap-2"
          blurAmount={6}
          displacementScale={0.3}
          stdDeviation={0.03}
        >
        {/* Settings Gear */}
        <button
          onClick={onSettingsClick}
          className="flex-shrink-0 p-2 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Settings"
        >
          <Settings className="w-5 h-5 opacity-60" />
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about Monad..."
          disabled={isThinking}
          rows={1}
          className="flex-1 bg-transparent resize-none outline-none text-sm lg:text-base min-h-[24px] max-h-[200px] placeholder:opacity-50 disabled:opacity-50"
          style={{ overflow: 'hidden' }}
        />

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={!input.trim() || isThinking}
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
