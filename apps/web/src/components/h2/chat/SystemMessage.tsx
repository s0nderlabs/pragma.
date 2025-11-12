'use client'

import { motion } from 'framer-motion'
import type { ChatMessage } from '@/lib/h2/types'

interface SystemMessageProps {
  message: ChatMessage
}

/**
 * SystemMessage Component
 *
 * System messages appear as centered, muted, italic text.
 * Used for status updates, errors, and system notifications.
 */
export function SystemMessage({ message }: SystemMessageProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="mb-4 flex justify-center"
    >
      <div className="text-xs lg:text-sm text-center opacity-50 italic px-4 py-2 rounded-full bg-white/5 max-w-[90%]">
        {message.content}
      </div>
    </motion.div>
  )
}
