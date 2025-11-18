'use client'

import { useState } from 'react'
import { Copy, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface WalletCardProps {
  balance: number
  change24h: number
  address: string
}

/**
 * WalletCard - Fixed Top Section
 *
 * Displays wallet balance, 24h change, and address
 * Always visible, never scrolls away
 * Clean, minimal design with perfect typography hierarchy
 */
export function WalletCard({ balance, change24h, address }: WalletCardProps) {
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [copied, setCopied] = useState(false)

  const formatAddress = (addr: string) => {
    // Handle zero address or invalid address
    if (!addr || addr === '0x0000000000000000000000000000000000000000') {
      return 'Not connected'
    }
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const formatBalance = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount)
  }

  const handleCopyAddress = () => {
    // Only copy if we have a valid address
    if (address && address !== '0x0000000000000000000000000000000000000000') {
      navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Address Row */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleCopyAddress}
          className={cn(
            "flex items-center gap-2",
            "px-3 py-1.5 rounded-[16px]",
            "transition-all duration-200",
            "text-xs font-mono",
            "bg-black/5 dark:bg-white/5",
            "hover:bg-black/10 dark:hover:bg-white/10",
            "text-black/60 dark:text-white/60"
          )}
        >
          <span>{formatAddress(address)}</span>
          {copied ? (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-green-500"
            >
              ✓
            </motion.span>
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>

        {/* Network Indicator */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-black/40 dark:text-white/40">
            MONAD
          </span>
        </div>
      </div>

      {/* Balance Display */}
      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <h2 className="text-3xl font-semibold tabular-nums text-black dark:text-white">
            {balanceVisible ? formatBalance(balance) : '••••••'}
          </h2>
          <button
            onClick={() => setBalanceVisible(!balanceVisible)}
            className={cn(
              "p-1.5 rounded-lg",
              "transition-colors duration-200",
              "hover:bg-black/5 dark:hover:bg-white/10",
              "text-black/40 dark:text-white/40",
              "hover:text-black/60 dark:hover:text-white/60"
            )}
            aria-label={balanceVisible ? "Hide balance" : "Show balance"}
          >
            {balanceVisible ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* 24h Change */}
        {balanceVisible && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2"
          >
            <span className={cn(
              "text-sm font-medium",
              change24h >= 0 ? "text-green-500" : "text-red-500"
            )}>
              {change24h >= 0 ? '+' : ''}{change24h}%
            </span>
            <span className="text-xs text-black/40 dark:text-white/40">
              24h
            </span>
          </motion.div>
        )}
      </div>

      {/* Simplified Stats - Only MON */}
      <div className="pt-4 mt-4 border-t border-black/5 dark:border-white/10">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider mb-1 text-black/40 dark:text-white/40">
              MON Balance
            </div>
            <div className="text-lg font-mono font-semibold text-black dark:text-white">
              124.5 MON
            </div>
          </div>
          <div className="text-xs text-black/30 dark:text-white/30">
            ≈ $312.50
          </div>
        </div>
      </div>
    </div>
  )
}