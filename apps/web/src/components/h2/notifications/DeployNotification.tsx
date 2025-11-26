'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Check, Loader2 } from 'lucide-react'

interface DeployNotificationProps {
  isDeploying?: boolean
  showSuccess?: boolean
}

/**
 * DeployNotification - Toast notification for smart account deployment
 *
 * Design:
 * - Glass morphism pill
 * - Purple/blue for deploying state (with spinner)
 * - Green for success state (with checkmark)
 * - Top-right positioning (z-40)
 * - Smooth slide-down + fade animation
 * - Auto-dismiss after 3 seconds for success (handled by store)
 */
export function DeployNotification({ isDeploying, showSuccess }: DeployNotificationProps) {
  return (
    <AnimatePresence mode="wait">
      {isDeploying && (
        <motion.div
          key="deploying"
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed top-6 right-6 z-40"
          role="status"
          aria-live="polite"
        >
          <div className="px-4 py-2 rounded-full border backdrop-blur-md bg-purple-500/20 border-purple-500/30 flex items-center gap-2 text-sm font-medium text-purple-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Deploying smart account...</span>
          </div>
        </motion.div>
      )}
      {showSuccess && !isDeploying && (
        <motion.div
          key="success"
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
            <span>Smart account deployed successfully</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
