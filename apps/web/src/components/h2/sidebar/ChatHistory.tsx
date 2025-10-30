'use client'

import { MessageSquare, Clock } from 'lucide-react'

/**
 * Chat History accordion section
 * Shows list of past conversations with AI-generated summaries
 * Placeholder for Phase 1 - will integrate with localStorage in Phase 2+
 */

interface ConversationItem {
  id: string
  summary: string
  timestamp: string
  preview: string
}

const mockConversations: ConversationItem[] = [
  {
    id: '1',
    summary: 'Swap ETH to USDC',
    timestamp: '2 hours ago',
    preview: 'Swapped 0.5 ETH to 1,245 USDC via Monorail',
  },
  {
    id: '2',
    summary: 'Stake MON tokens',
    timestamp: '5 hours ago',
    preview: 'Staked 1,000 MON on aPriori for liquid staking',
  },
  {
    id: '3',
    summary: 'NFT Purchase',
    timestamp: 'Yesterday',
    preview: 'Bought Genesis Ape #1337 from Poply marketplace',
  },
  {
    id: '4',
    summary: 'Transfer to 0x42...',
    timestamp: '2 days ago',
    preview: 'Sent 500 USDC to 0x42a8...9f3d',
  },
  {
    id: '5',
    summary: 'Wrap MON',
    timestamp: '3 days ago',
    preview: 'Wrapped 2,500 MON to WMON for trading',
  },
]

export function ChatHistory() {
  return (
    <div className="space-y-2">
      {mockConversations.map((conversation) => (
        <button
          key={conversation.id}
          className="w-full text-left p-3 rounded-lg hover:bg-white/5 transition-colors group"
        >
          <div className="flex items-start gap-3">
            <MessageSquare className="w-4 h-4 mt-1 opacity-40 group-hover:opacity-60 transition-opacity flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm mb-1 truncate">
                {conversation.summary}
              </div>
              <div className="text-xs opacity-60 line-clamp-2">
                {conversation.preview}
              </div>
              <div className="flex items-center gap-1 mt-2 text-xs opacity-40">
                <Clock className="w-3 h-3" />
                <span>{conversation.timestamp}</span>
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}
