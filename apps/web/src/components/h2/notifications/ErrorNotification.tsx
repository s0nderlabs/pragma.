'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle } from 'lucide-react'

interface ErrorNotificationProps {
  message: string | null
}

/**
 * ErrorNotification - Toast notification for error messages
 *
 * Design:
 * - Glass morphism pill with red error colors
 * - Top-right positioning (z-40)
 * - Smooth slide-down + fade animation
 * - Auto-dismiss after 3 seconds (handled by store)
 */
export function ErrorNotification({ message }: ErrorNotificationProps) {
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
          aria-live="assertive"
        >
          <div className="px-4 py-2 rounded-full border backdrop-blur-md bg-red-500/20 border-red-500/30 flex items-center gap-2 text-sm font-medium text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span>{message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
