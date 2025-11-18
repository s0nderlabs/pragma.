'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/useThemeStore'
import { MessageSquare, Play, Bookmark } from 'lucide-react'

/**
 * SessionsTab - Chat History
 *
 * Previous conversation summaries with quick resume
 * Clean cards with timestamps and action buttons
 * Minimal design focused on content
 */
export function SessionsTab() {
  const { theme } = useThemeStore()
  const isDark = theme === 'pragma-dark'

  // Sample sessions - will be replaced with real data
  const sessions = [
    {
      id: 1,
      preview: 'Swap 0.5 ETH to USDC at best rate',
      timestamp: 'Just now',
      status: 'active',
      bookmarked: false,
    },
    {
      id: 2,
      preview: 'Check APR for staking 100 MON',
      timestamp: '10 min ago',
      status: 'completed',
      bookmarked: true,
    },
    {
      id: 3,
      preview: 'Bridge USDC from Ethereum to Monad',
      timestamp: '1 hour ago',
      status: 'completed',
      bookmarked: false,
    },
    {
      id: 4,
      preview: 'Multi-step: Swap USDC to MON then stake',
      timestamp: '3 hours ago',
      status: 'completed',
      bookmarked: true,
    },
    {
      id: 5,
      preview: 'Check portfolio balance and recent activity',
      timestamp: 'Yesterday',
      status: 'completed',
      bookmarked: false,
    },
  ]

  return (
    <div className="space-y-2">
      {sessions.map((session, index) => (
        <motion.div
          key={session.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className={cn(
            "p-4 rounded-[24px]",
            "transition-all duration-200",
            "group cursor-pointer border",
            session.status === 'active' && isDark && "bg-terracotta/10 border-terracotta/20",
            session.status === 'active' && !isDark && "bg-terracotta/5 border-terracotta/10",
            session.status !== 'active' && isDark && "bg-black/40 hover:bg-black/50 border-white/10",
            session.status !== 'active' && !isDark && "bg-white hover:bg-gray-50 border-black/5"
          )}
        >
          {/* Session Header */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-start gap-2 flex-1">
              <MessageSquare className={cn(
                "w-4 h-4 mt-0.5 flex-shrink-0",
                session.status === 'active'
                  ? "text-terracotta"
                  : isDark
                  ? "text-white/40"
                  : "text-black/40"
              )} />
              <p className={cn(
                "text-sm line-clamp-2",
                isDark ? "text-white/80" : "text-black/80"
              )}>
                {session.preview}
              </p>
            </div>
            <button
              className={cn(
                "p-1 rounded-lg opacity-0 group-hover:opacity-100",
                "transition-all duration-200",
                session.bookmarked
                  ? "text-terracotta"
                  : isDark
                  ? "text-white/40 hover:text-white/60"
                  : "text-black/40 hover:text-black/60"
              )}
              onClick={(e) => {
                e.stopPropagation()
                // Toggle bookmark
              }}
            >
              <Bookmark className={cn(
                "w-3.5 h-3.5",
                session.bookmarked && "fill-current"
              )} />
            </button>
          </div>

          {/* Session Footer */}
          <div className="flex items-center justify-between">
            <span className={cn(
              "text-xs",
              isDark ? "text-white/40" : "text-black/40"
            )}>
              {session.timestamp}
            </span>

            {/* Resume Button */}
            <button
              className={cn(
                "flex items-center gap-1",
                "px-2 py-1 rounded-[12px]",
                "text-xs font-medium",
                "transition-all duration-200",
                "opacity-0 group-hover:opacity-100 border",
                isDark
                  ? "bg-white/10 hover:bg-white/15 text-white/60 border-white/10"
                  : "bg-black/5 hover:bg-black/10 text-black/60 border-black/10"
              )}
            >
              <Play className="w-3 h-3" />
              Resume
            </button>
          </div>

          {/* Active Indicator */}
          {session.status === 'active' && (
            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-terracotta/20">
              <div className="w-1.5 h-1.5 rounded-full bg-terracotta animate-pulse" />
              <span className="text-xs text-terracotta font-medium">
                Current Session
              </span>
            </div>
          )}
        </motion.div>
      ))}

      {/* New Session Button */}
      <button
        className={cn(
          "w-full py-3 rounded-[24px]",
          "text-sm font-medium",
          "transition-colors duration-200",
          "border-2 border-dashed",
          isDark
            ? "border-white/20 text-white/40 hover:border-white/30 hover:text-white/60"
            : "border-black/20 text-black/40 hover:border-black/30 hover:text-black/60"
        )}
      >
        Start New Session
      </button>
    </div>
  )
}