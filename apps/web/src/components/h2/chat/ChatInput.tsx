'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { useAgentContext } from '@/contexts/H2AgentContext'
import { useIdentity } from '@/hooks/useIdentity'
import { useVoiceRecorder, getAudioExtension } from '@/hooks/useVoiceRecorder'
import { authenticatedFetch } from '@/lib/api/authenticatedFetch'
import { ArrowUpRight, Zap, Square, Mic, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, useMotionValue, useMotionTemplate, animate, AnimatePresence } from 'framer-motion'
import { VoiceWaveform } from './VoiceWaveform'
import { VoiceNotification, useVoiceNotification } from '../notifications/VoiceNotification'

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

// Click vs hold threshold in ms
const HOLD_THRESHOLD = 200

// Drag distance to cancel recording (negative = left, in pixels)
const DRAG_CANCEL_THRESHOLD = -80

/**
 * ChatInput Component (H2/H2.5 Compatible)
 *
 * Auto-resize textarea with send button, Quick Mode toggle, and voice input.
 * Works with both H2 (server-side) and H2.5 (client-side) agents via context.
 *
 * Features:
 * - Context-aware dynamic placeholder
 * - Rotating beam effect when Quick Mode enabled (terracotta)
 * - Voice input with waveform visualization
 * - Click to toggle / hold to push-to-talk
 * - Clean, minimal design following Dieter Rams philosophy
 */
export function ChatInput({ prefillText, onPrefillApplied, className }: ChatInputProps) {
  const tokensLoading = useH2ChatStore((state) => state.tokensLoading)
  const quickMode = useH2ChatStore((state) => state.quickMode)
  const setQuickMode = useH2ChatStore((state) => state.setQuickMode)
  const messages = useH2ChatStore((state) => state.messages)
  const { sendMessage, stopMessage, isStreaming } = useAgentContext()
  const { status, wallet } = useIdentity()
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Voice recording
  const {
    isRecording,
    error: recorderError,
    analyserNode,
    duration,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError,
  } = useVoiceRecorder()

  const [isTranscribing, setIsTranscribing] = useState(false)
  const { error: notificationError, customMessage, showError, showMessage, dismiss } = useVoiceNotification()

  // Click vs hold detection
  const mouseDownTimeRef = useRef<number>(0)
  const [isHoldMode, setIsHoldMode] = useState(false)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const recordingSessionIdRef = useRef(0) // Unique ID for each recording session
  const keyboardRecordingRef = useRef(false) // Track if recording started via keyboard
  const keyboardStartTimeRef = useRef(0) // Track keyboard recording start time
  const isToggleModeRef = useRef(false) // Track if in toggle mode (for keyboard Alt+V again)

  // Drag-to-cancel for hold mode
  const [dragOffset, setDragOffset] = useState(0)
  const dragOffsetRef = useRef(0) // Ref to read in handleGlobalRelease (avoids closure issues)

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

  // Show recorder errors in notification
  useEffect(() => {
    if (recorderError) {
      showError(recorderError)
      clearError()
    }
  }, [recorderError, showError, clearError])

  // Context-aware dynamic placeholder
  const placeholder = useMemo(() => {
    if (tokensLoading) return "Loading..."
    if (!isWalletConnected) return "Connect wallet to start"
    if (isRecording) return "Listening..."
    if (isTranscribing) return "Transcribing..."
    if (messages.length > 0) return "What else?"
    return randomPrompt || "What's the play?"
  }, [tokensLoading, isWalletConnected, isRecording, isTranscribing, messages.length, randomPrompt])

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

  // Handle stop button click - aborts current stream
  const handleStop = () => {
    stopMessage?.()
  }

  /**
   * Transcribe audio blob via API
   */
  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<string | null> => {
    setIsTranscribing(true)

    try {
      const formData = new FormData()
      const extension = getAudioExtension()
      formData.append('audio', audioBlob, `recording.${extension}`)

      const response = await authenticatedFetch('/api/voice/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Transcription failed')
      }

      const result = await response.json()
      return result.text || null
    } catch (error) {
      console.error('[Voice] Transcription error:', error)
      showMessage('Transcription failed. Please try again.')
      return null
    } finally {
      setIsTranscribing(false)
    }
  }, [showMessage])

  /**
   * Handle recording stop and transcription
   */
  const handleRecordingComplete = useCallback(async () => {
    const audioBlob = await stopRecording()

    if (!audioBlob) {
      // Recording was too short or cancelled
      return
    }

    const transcribedText = await transcribeAudio(audioBlob)

    if (transcribedText && transcribedText.trim()) {
      // Send directly to agent (skip input state to avoid race condition)
      await sendMessage(transcribedText.trim())
    } else if (transcribedText === '') {
      showMessage('No speech detected. Please try again.')
    }
  }, [stopRecording, transcribeAudio, sendMessage, showMessage])


  /**
   * Handle mic button mouse/touch down
   */
  const handleMicDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    mouseDownTimeRef.current = Date.now()
    setIsHoldMode(false)
    setDragOffset(0)
    dragOffsetRef.current = 0

    // Generate unique session ID - stale listeners will have old ID and be ignored
    const sessionId = ++recordingSessionIdRef.current

    // Clear any existing hold timeout
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current)
      holdTimeoutRef.current = null
    }

    // Track start position for drag-to-cancel (both touch and mouse)
    if ('touches' in e && e.touches[0]) {
      touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    } else if ('clientX' in e) {
      touchStartPosRef.current = { x: e.clientX, y: e.clientY }
    }

    if (!isRecording) {
      startRecording()
    }

    // Set timeout to detect hold mode (after 200ms, hide X button and enable drag-to-cancel)
    holdTimeoutRef.current = setTimeout(() => {
      setIsHoldMode(true)
    }, HOLD_THRESHOLD)

    // Add global listener IMMEDIATELY to catch release regardless of React timing
    const handleGlobalRelease = () => {
      // Remove BOTH listeners immediately to prevent double execution
      document.removeEventListener('mouseup', handleGlobalRelease)
      document.removeEventListener('touchend', handleGlobalRelease)

      // ALWAYS clear hold timeout first - this must happen regardless of session validity
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current)
        holdTimeoutRef.current = null
      }

      // Check if this is a stale listener from a previous session
      if (sessionId !== recordingSessionIdRef.current) {
        return
      }

      const elapsed = Date.now() - mouseDownTimeRef.current

      if (elapsed >= HOLD_THRESHOLD) {
        // Hold mode - check drag offset to cancel or transcribe
        if (dragOffsetRef.current <= DRAG_CANCEL_THRESHOLD) {
          // Dragged past cancel threshold - cancel
          cancelRecording()
        } else {
          // Released without dragging to cancel - transcribe
          handleRecordingComplete()
        }
        setDragOffset(0)
        dragOffsetRef.current = 0
      }
      // Toggle mode (< 200ms): do nothing, recording continues with X button visible

      // Reset refs
      mouseDownTimeRef.current = 0
      touchStartPosRef.current = null
      setIsHoldMode(false) // Reset for next recording
    }

    document.addEventListener('mouseup', handleGlobalRelease)
    document.addEventListener('touchend', handleGlobalRelease)
  }, [isRecording, startRecording, cancelRecording, handleRecordingComplete])

  /**
   * Handle mic button mouse/touch up (fallback, may not fire if button unmounts)
   */
  const handleMicUp = useCallback(() => {
    // This is now mostly a fallback - the global listener handles the main logic
    // Just reset timestamp in case global listener didn't fire
    mouseDownTimeRef.current = 0
  }, [])

  /**
   * Handle stop recording button click (for toggle mode)
   */
  const handleStopRecording = useCallback(() => {
    if (isRecording) {
      handleRecordingComplete()
    }
  }, [isRecording, handleRecordingComplete])

  /**
   * Handle touch/mouse move for drag-to-cancel (hold mode only)
   */
  const handleDragMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isRecording || !touchStartPosRef.current) return

    // Only track drag if held long enough (push-to-talk mode)
    const elapsed = Date.now() - mouseDownTimeRef.current
    if (elapsed < HOLD_THRESHOLD) return

    // Get current position
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX

    // Calculate horizontal offset (negative = dragging left)
    const dx = clientX - touchStartPosRef.current.x
    const offset = Math.min(0, dx) // Only allow dragging left
    setDragOffset(offset)
    dragOffsetRef.current = offset // Also update ref for handleGlobalRelease
  }, [isRecording])

  /**
   * Handle cancel recording button click (for toggle mode X button)
   */
  const handleCancelRecording = useCallback(() => {
    if (isRecording) {
      // Clear hold timeout if pending
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current)
        holdTimeoutRef.current = null
      }
      // Increment session ID to invalidate any pending listeners
      recordingSessionIdRef.current++
      cancelRecording()
      setIsHoldMode(false)
    }
  }, [isRecording, cancelRecording])

  // Cleanup hold timeout on unmount
  useEffect(() => {
    return () => {
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current)
      }
    }
  }, [])

  /**
   * Keyboard shortcuts for voice recording (Alt + V, Esc)
   */
  useEffect(() => {
    // Helper: check if user is typing in an input
    const isInputFocused = (): boolean => {
      const active = document.activeElement
      if (!active) return false
      const tag = active.tagName.toLowerCase()
      return tag === 'input' || tag === 'textarea' ||
             active.getAttribute('contenteditable') === 'true'
    }

    // Mic disabled check (inlined to avoid declaration order issues)
    const micDisabled = !isWalletConnected || tokensLoading || isTranscribing

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to cancel recording
      if (e.code === 'Escape' && isRecording) {
        e.preventDefault()
        handleCancelRecording()
        showMessage('Recording cancelled')
        return
      }

      // Alt + V for voice recording
      if (e.code === 'KeyV' && e.altKey && !e.repeat) {
        // If already recording in toggle mode, stop and transcribe
        if (isRecording && isToggleModeRef.current) {
          e.preventDefault()
          keyboardRecordingRef.current = false
          isToggleModeRef.current = false
          handleRecordingComplete()
          return
        }

        // Skip if disabled, already recording, or input is focused
        if (micDisabled || isRecording || isTranscribing) return
        if (isInputFocused()) return

        e.preventDefault()
        keyboardRecordingRef.current = true
        keyboardStartTimeRef.current = Date.now()
        isToggleModeRef.current = false

        // Start recording
        startRecording()
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      // V key released - check if this was a keyboard-initiated recording
      if (e.code === 'KeyV' && keyboardRecordingRef.current && isRecording) {
        e.preventDefault()

        const elapsed = Date.now() - keyboardStartTimeRef.current

        if (elapsed < HOLD_THRESHOLD) {
          // Quick press (< 200ms) → toggle mode - recording continues
          isToggleModeRef.current = true
          // User will press Alt+V again to stop
        } else {
          // Hold mode (>= 200ms) → stop and transcribe now
          keyboardRecordingRef.current = false
          isToggleModeRef.current = false
          handleRecordingComplete()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [isRecording, isTranscribing, isWalletConnected, tokensLoading, startRecording, handleRecordingComplete, handleCancelRecording, showMessage])

  // Determine which button to show
  const hasText = !!input.trim()
  const showUnifiedButton = !isStreaming && !isRecording && !isTranscribing
  const isMicDisabled = !isWalletConnected || tokensLoading || isTranscribing
  // Unified button disabled state depends on mode
  const isUnifiedButtonDisabled = hasText ? tokensLoading : isMicDisabled
  const showStopRecording = isRecording
  const showStopStreaming = isStreaming

  return (
    <div
      className={cn("px-4 pt-4 pb-4 flex justify-center overflow-x-hidden", className)}
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Voice notification toast */}
      <VoiceNotification
        error={notificationError}
        customMessage={customMessage}
        onDismiss={dismiss}
      />

      <div className="w-full max-w-4xl">
        {/* Input container with beam wrapper */}
        <div className="relative">
          {/* Main input container */}
          <div
            onTouchMove={handleDragMove}
            onMouseMove={handleDragMove}
            className={cn(
              "rounded-[32px] p-3 flex items-center gap-2 bg-white dark:bg-zinc-800 border transition-all duration-300 relative overflow-hidden",
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

            {/* Textarea or Waveform */}
            <AnimatePresence mode="wait">
              {isRecording ? (
                <motion.div
                  key="waveform"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 min-w-0 flex items-center justify-center min-h-[24px] relative overflow-hidden"
                >
                  {/* Waveform - fades out as user drags */}
                  <div
                    className="flex items-center justify-center transition-all"
                    style={{
                      transform: `translateX(${dragOffset * 0.3}px)`,
                      opacity: dragOffset < 0 ? Math.max(0, 1 - Math.abs(dragOffset) / 60) : 1
                    }}
                  >
                    <VoiceWaveform
                      analyserNode={analyserNode}
                      isRecording={isRecording}
                    />
                    {duration > 0 && (
                      <span className="ml-2 text-xs text-gray-400 dark:text-white/40 tabular-nums">
                        {Math.floor(duration / 1000)}s
                      </span>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.textarea
                  key="textarea"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  id="chat-input"
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  disabled={tokensLoading || isTranscribing}
                  rows={1}
                  className="flex-1 bg-transparent resize-none outline-none text-base h-6 max-h-[200px] leading-6 py-0 m-0 self-center placeholder:opacity-50 disabled:opacity-50"
                  style={{ overflowY: 'auto' }}
                />
              )}
            </AnimatePresence>

            {/* Action Buttons - Mic / Send / Stop */}
            <AnimatePresence mode="wait">
              {showStopStreaming && (
                <motion.button
                  key="stop-streaming"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={handleStop}
                  className="group relative flex-shrink-0 flex items-center justify-center p-3 rounded-full active:scale-[0.985] hover:scale-[1.05] transition-all duration-150 bg-black dark:bg-white text-white dark:text-black hover:shadow-md"
                  aria-label="Stop generation"
                >
                  <Square className="w-3.5 h-3.5 fill-current group-hover:scale-110 transition-transform duration-150" />
                </motion.button>
              )}

              {showStopRecording && (
                <motion.div
                  key="recording-buttons"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex items-center gap-2"
                  style={{ transform: `translateX(${dragOffset * 0.3}px)` }}
                >
                  {/* Cancel button (X) - only in toggle mode (not dragging) */}
                  {!isHoldMode && dragOffset === 0 && (
                    <button
                      onClick={handleCancelRecording}
                      className="flex-shrink-0 flex items-center justify-center p-3 rounded-full active:scale-[0.985] hover:scale-[1.05] transition-all duration-150 bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-zinc-600"
                      aria-label="Cancel recording"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {/* Slide to cancel hint - only in hold mode */}
                  {isHoldMode && (
                    <span className={cn(
                      "text-xs font-medium transition-colors",
                      dragOffset <= DRAG_CANCEL_THRESHOLD
                        ? "text-red-500"
                        : "text-gray-400 dark:text-gray-500"
                    )}>
                      {dragOffset <= DRAG_CANCEL_THRESHOLD ? "Release to Cancel" : "← Slide to Cancel"}
                    </span>
                  )}
                  {/* Stop recording button */}
                  <button
                    onClick={handleStopRecording}
                    className="group flex-shrink-0 flex items-center justify-center p-3 rounded-full active:scale-[0.985] hover:scale-[1.05] transition-all duration-150 bg-black dark:bg-white text-white dark:text-black hover:shadow-md"
                    aria-label="Stop recording"
                  >
                    <Square className="w-3.5 h-3.5 fill-current group-hover:scale-110 transition-transform duration-150" />
                  </button>
                </motion.div>
              )}

              {/* Unified Mic/Send Button */}
              {showUnifiedButton && (
                <motion.button
                  key="unified"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={hasText ? handleSend : undefined}
                  onMouseDown={hasText ? undefined : (isUnifiedButtonDisabled ? undefined : handleMicDown)}
                  onMouseUp={hasText ? undefined : (isUnifiedButtonDisabled ? undefined : handleMicUp)}
                  onTouchStart={hasText ? undefined : (isUnifiedButtonDisabled ? undefined : handleMicDown)}
                  onTouchEnd={hasText ? undefined : (isUnifiedButtonDisabled ? undefined : handleMicUp)}
                  disabled={isUnifiedButtonDisabled}
                  className={cn(
                    "group relative flex-shrink-0 flex items-center justify-center p-3 rounded-full transition-all duration-150",
                    "bg-black dark:bg-white text-white dark:text-black",
                    isUnifiedButtonDisabled
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:scale-[1.05] hover:shadow-md active:scale-[0.985]"
                  )}
                  aria-label={
                    hasText
                      ? "Send message"
                      : isUnifiedButtonDisabled
                        ? "Connect wallet to use voice input"
                        : "Voice input - click or hold to speak"
                  }
                  title={
                    hasText
                      ? "Send message"
                      : isUnifiedButtonDisabled
                        ? "Connect wallet to use voice input"
                        : "Click to start/stop, or hold to speak (drag left to cancel)"
                  }
                >
                  {/* Animated icon swap - icon only */}
                  <AnimatePresence mode="wait" initial={false}>
                    {hasText ? (
                      <motion.div
                        key="send-icon"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.15 }}
                      >
                        <ArrowUpRight className="w-4 h-4 group-active:-rotate-45 transition-transform duration-200" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="mic-icon"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Mic className="w-4 h-4" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              )}

              {/* Loading state during transcription */}
              {isTranscribing && (
                <motion.div
                  key="transcribing"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex-shrink-0 flex items-center justify-center p-3 rounded-full bg-gray-200 dark:bg-zinc-700"
                >
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                </motion.div>
              )}
            </AnimatePresence>
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

        {/* Beta disclaimer - fade in when messages exist, always in DOM to prevent layout shift */}
        <p
          className={cn(
            "text-[10px] sm:text-xs text-center text-gray-400 dark:text-white/40 mt-2 transition-opacity duration-300",
            messages.length > 0 ? "opacity-100" : "opacity-0"
          )}
        >
          <span className="sm:hidden">Pragma may make mistakes. Always DYOR.</span>
          <span className="hidden sm:inline">Pragma is in beta and may make mistakes. Always DYOR and verify independently.</span>
        </p>
      </div>
    </div>
  )
}
