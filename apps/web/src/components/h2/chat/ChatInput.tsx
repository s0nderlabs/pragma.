'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { useAgentContext } from '@/contexts/H2AgentContext'
import { useIdentity } from '@/hooks/useIdentity'
import { ArrowUpRight, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, useMotionValue, useMotionTemplate, animate } from 'framer-motion'

interface ChatInputProps {
  /** Pre-fill text to insert into input */
  prefillText?: string
  /** Callback when prefill has been applied */
  onPrefillApplied?: () => void
  /** Additional class names for positioning */
  className?: string
}

// Action prompts for empty state with wallet connected
const ACTION_PROMPTS = [
  "Swap some tokens...",
  "Check my balance...",
  "Stake some MON...",
  "Send to a friend...",
  "What's the play?",
]

/**
 * ChatInput Component (H2/H2.5 Compatible)
 *
 * Auto-resize textarea with send button and Quick Mode toggle.
 * Works with both H2 (server-side) and H2.5 (client-side) agents via context.
 *
 * Features:
 * - Context-aware dynamic placeholder
 * - Rotating beam effect when Quick Mode enabled (terracotta)
 * - Clean, minimal design following Dieter Rams philosophy
 */
export function ChatInput({ prefillText, onPrefillApplied, className }: ChatInputProps) {
  const tokensLoading = useH2ChatStore((state) => state.tokensLoading)
  const quickMode = useH2ChatStore((state) => state.quickMode)
  const setQuickMode = useH2ChatStore((state) => state.setQuickMode)
  const messages = useH2ChatStore((state) => state.messages)
  const { sendMessage, isStreaming } = useAgentContext()
  const { status, wallet } = useIdentity()
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Derive wallet connection from identity hook (fixes undefined isConnected bug)
  const isWalletConnected = status === 'connected' && !!wallet?.address

  // Random action prompt - selected once on mount to avoid hydration issues
  const [randomPrompt, setRandomPrompt] = useState<string | null>(null)
  useEffect(() => {
    setRandomPrompt(ACTION_PROMPTS[Math.floor(Math.random() * ACTION_PROMPTS.length)])
  }, [])

  // Rotating beam animation for Quick Mode
  const turn = useMotionValue(0)

  useEffect(() => {
    if (quickMode) {
      const controls = animate(turn, 1, {
        ease: "linear",
        duration: 3,
        repeat: Infinity,
      })
      return () => controls.stop()
    } else {
      turn.set(0)
    }
  }, [quickMode, turn])

  const beamGradient = useMotionTemplate`conic-gradient(from ${turn}turn, #D4622A00 75%, #FF7A42 100%)`

  // Context-aware dynamic placeholder
  const placeholder = useMemo(() => {
    if (tokensLoading) return "Loading..."
    if (!isWalletConnected) return "Connect wallet to start"
    if (messages.length > 0) return "What else?"
    return randomPrompt || "What's the play?"
  }, [tokensLoading, isWalletConnected, messages.length, randomPrompt])

  // Auto-resize textarea - only apply scrollHeight when there's content
  // When empty, let CSS control height for proper centering
  useEffect(() => {
    if (textareaRef.current) {
      if (input.trim()) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
      } else {
        // Clear inline style when empty, let CSS h-6 class control height
        textareaRef.current.style.height = ''
      }
    }
  }, [input])

  // Handle prefill text from quick action chips
  useEffect(() => {
    if (prefillText) {
      setInput(prefillText)
      onPrefillApplied?.()
      // Focus and move cursor to end
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          textareaRef.current.setSelectionRange(prefillText.length, prefillText.length)
        }
      }, 0)
    }
  }, [prefillText, onPrefillApplied])

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
    <div
      className={cn("px-4 pt-4 pb-8 flex justify-center", className)}
      style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="w-full max-w-4xl relative">
        {/* Main input container */}
        <div
          className={cn(
            "rounded-[32px] p-3 flex items-center gap-2 bg-white dark:bg-zinc-800 border transition-all duration-300",
            quickMode
              ? "border-terracotta/50"
              : "border-gray-200 dark:border-zinc-700"
          )}
        >
          {/* Quick Mode Toggle - Lightning icon for both states */}
          <button
            onClick={() => setQuickMode(!quickMode)}
            title={quickMode ? "Quick Mode ON: Auto-execute enabled" : "Quick Mode OFF: Confirmation required"}
            className={cn(
              "flex-shrink-0 p-2 rounded-full transition-all duration-200",
              quickMode
                ? "text-terracotta hover:bg-terracotta/10"
                : "text-gray-400 dark:text-white/30 hover:bg-gray-100 dark:hover:bg-white/10"
            )}
            aria-label={quickMode ? "Quick Mode enabled - click to disable" : "Quick Mode disabled - click to enable"}
          >
            <Zap className={cn("w-4 h-4", quickMode && "fill-current")} />
          </button>

          {/* Textarea */}
          <textarea
            id="chat-input"
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={tokensLoading}
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-base h-6 max-h-[200px] leading-6 py-0 m-0 self-center placeholder:opacity-50 disabled:opacity-50"
            style={{ overflow: 'hidden' }}
          />

          {/* Send Button - Icon only on mobile, text+hover arrow on desktop */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || tokensLoading}
            className="group relative flex-shrink-0 flex items-center justify-center gap-1 p-2.5 lg:px-5 lg:py-2.5 rounded-full active:scale-[0.985] transition-all bg-black dark:bg-white text-white dark:text-black"
            aria-label="Send message"
          >
            <span className="hidden lg:inline text-sm font-medium">Send</span>
            <ArrowUpRight className="w-4 h-4 lg:w-0 lg:h-5 lg:overflow-hidden lg:opacity-0 lg:group-hover:w-5 lg:group-hover:opacity-100 group-active:-rotate-45 transition-all duration-200" />
          </button>
        </div>

        {/* Rotating beam overlay - only when Quick Mode ON */}
        {/* Uses negative z-index so input container acts as natural "inner cover" */}
        {quickMode && (
          <motion.div
            style={{ backgroundImage: beamGradient }}
            className="pointer-events-none absolute -inset-[1px] -z-10 rounded-[33px]"
          />
        )}
      </div>
    </div>
  )
}
