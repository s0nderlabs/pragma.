'use client'

import { MessageSquare } from 'lucide-react'

/**
 * Chat History accordion section
 * Shows list of past conversations with AI-generated summaries
 * Placeholder for Phase 1 - will integrate with localStorage in Phase 2+
 */
export function ChatHistory() {
  return (
    <div className="py-6 px-2 text-center opacity-60">
      <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p className="text-sm">No conversations yet</p>
      <p className="text-xs mt-1 opacity-60">
        Start chatting to see your history here
      </p>
    </div>
  )
}
