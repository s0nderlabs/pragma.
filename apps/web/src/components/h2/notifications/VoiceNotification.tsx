'use client'

/**
 * VoiceNotification - Toast notification for voice recording errors
 *
 * Design:
 * - Glass morphism pill (consistent with CopyNotification)
 * - Top-right positioning (z-40)
 * - Smooth slide-down + fade animation
 * - Auto-dismiss after 3 seconds
 */

import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, AlertTriangle } from 'lucide-react'
import type { VoiceRecorderError } from '@/hooks/useVoiceRecorder'

interface VoiceNotificationProps {
  error: VoiceRecorderError | null
  customMessage?: string | null
  onDismiss?: () => void
}

// Error messages mapping
const ERROR_MESSAGES: Record<VoiceRecorderError, string> = {
  permission_denied: 'Mic access denied. Enable in browser settings.',
  no_microphone: 'No microphone detected.',
  browser_unsupported: 'Voice input not supported in this browser.',
  recording_too_short: 'Recording too short. Hold longer.',
  unknown: 'Something went wrong. Please try again.',
}

// Error icons mapping
const ERROR_ICONS: Record<VoiceRecorderError, React.ReactNode> = {
  permission_denied: <MicOff className="w-4 h-4" />,
  no_microphone: <MicOff className="w-4 h-4" />,
  browser_unsupported: <AlertTriangle className="w-4 h-4" />,
  recording_too_short: <Mic className="w-4 h-4" />,
  unknown: <AlertTriangle className="w-4 h-4" />,
}

export function VoiceNotification({ error, customMessage, onDismiss }: VoiceNotificationProps) {
  const message = customMessage || (error ? ERROR_MESSAGES[error] : null)
  const icon = error ? ERROR_ICONS[error] : <AlertTriangle className="w-4 h-4" />

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed top-6 right-6 z-40"
          role="alert"
          aria-live="polite"
          onClick={onDismiss}
        >
          <div className="px-4 py-2 rounded-full border backdrop-blur-md bg-red-500/20 border-red-500/30 flex items-center gap-2 text-sm font-medium text-red-400 cursor-pointer hover:bg-red-500/30 transition-colors">
            {icon}
            <span>{message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Hook for managing voice notification state with auto-dismiss
 */
import { useState, useCallback, useEffect, useRef } from 'react'

interface UseVoiceNotificationReturn {
  error: VoiceRecorderError | null
  customMessage: string | null
  showError: (error: VoiceRecorderError) => void
  showMessage: (message: string) => void
  dismiss: () => void
}

export function useVoiceNotification(autoDismissMs = 3000): UseVoiceNotificationReturn {
  const [error, setError] = useState<VoiceRecorderError | null>(null)
  const [customMessage, setCustomMessage] = useState<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const clearTimeout = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const dismiss = useCallback(() => {
    clearTimeout()
    setError(null)
    setCustomMessage(null)
  }, [clearTimeout])

  const showError = useCallback((err: VoiceRecorderError) => {
    clearTimeout()
    setCustomMessage(null)
    setError(err)

    if (autoDismissMs > 0) {
      timeoutRef.current = setTimeout(dismiss, autoDismissMs)
    }
  }, [autoDismissMs, clearTimeout, dismiss])

  const showMessage = useCallback((message: string) => {
    clearTimeout()
    setError(null)
    setCustomMessage(message)

    if (autoDismissMs > 0) {
      timeoutRef.current = setTimeout(dismiss, autoDismissMs)
    }
  }, [autoDismissMs, clearTimeout, dismiss])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout()
    }
  }, [clearTimeout])

  return {
    error,
    customMessage,
    showError,
    showMessage,
    dismiss,
  }
}
