'use client'

import { motion } from 'framer-motion'
import { Menu, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/useThemeStore'

interface FloatingTriggerProps {
  balance: number
  change24h: number
  onClick: () => void
}

/**
 * FloatingTrigger - Collapsed Sidebar Button
 *
 * Shows abbreviated balance with expand button
 * 32px radius matching chat input style
 * Fixed position with smooth animations
 */
export function FloatingTrigger({ balance, change24h, onClick }: FloatingTriggerProps) {
  const { theme } = useThemeStore()
  const isDark = theme === 'pragma-dark'

  const formatCompactBalance = (amount: number) => {
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}k`
    }
    return `$${amount.toFixed(0)}`
  }

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9, x: -20 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.9, x: -20 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 25,
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "fixed left-4 top-4 z-30",
        "flex items-center gap-2",
        "px-4 py-2.5 rounded-[32px]",
        "shadow-lg",
        "transition-colors duration-200",
        isDark
          ? "bg-gray-900/90 backdrop-blur-xl border border-white/10 text-white hover:bg-gray-900/95"
          : "bg-white/90 backdrop-blur-xl border border-black/5 text-black hover:bg-white/95"
      )}
      aria-label="Expand sidebar"
    >
      {/* Menu Icon */}
      <Menu className={cn(
        "w-4 h-4",
        isDark ? "text-white/60" : "text-black/60"
      )} />

      {/* Separator */}
      <div className={cn(
        "w-px h-4",
        isDark ? "bg-white/20" : "bg-black/10"
      )} />

      {/* Balance Info */}
      <div className="flex items-center gap-1.5">
        <span className="font-mono font-semibold text-sm">
          {formatCompactBalance(balance)}
        </span>
        <span className={cn(
          "text-xs font-medium",
          change24h >= 0 ? "text-green-500" : "text-red-500"
        )}>
          {change24h >= 0 ? '+' : ''}{change24h}%
        </span>
      </div>

      {/* Expand Arrow */}
      <ChevronRight className={cn(
        "w-3.5 h-3.5 -mr-1",
        isDark ? "text-white/40" : "text-black/40"
      )} />

      {/* Pulse indicator for attention */}
      <motion.div
        className="absolute -top-1 -right-1"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.5 }}
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-terracotta opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-terracotta" />
        </span>
      </motion.div>
    </motion.button>
  )
}