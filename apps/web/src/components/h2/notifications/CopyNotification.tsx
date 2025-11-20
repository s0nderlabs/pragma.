'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Check } from 'lucide-react'

interface CopyNotificationProps {
  show: boolean
}

/**
 * CopyNotification - Aesthetic toast notification for clipboard copy
 *
 * Design:
 * - Glass morphism pill with green success colors
 * - Top-right positioning (z-40)
 * - Smooth slide-down + fade animation
 * - Auto-dismiss after 2 seconds (handled by store)
 */
export function CopyNotification({ show }: CopyNotificationProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed top-6 right-6 z-40"
          role="status"
          aria-live="polite"
        >
          <div className="px-4 py-2 rounded-full border backdrop-blur-md bg-green-500/20 border-green-500/30 flex items-center gap-2 text-sm font-medium text-green-400">
            <Check className="w-4 h-4" />
            <span>Address copied to clipboard</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
