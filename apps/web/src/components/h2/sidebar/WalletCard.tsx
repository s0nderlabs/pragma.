'use client'

import { useState, useCallback } from 'react'
import { Copy, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { OdometerNumber } from '../ui/OdometerNumber'
import { useSidebarStore } from '@/stores/useSidebarStore'

interface WalletCardProps {
  balance: number
  change24h: number
  address: string
  monBalance: string
  isDeploying?: boolean
  status?: string
  connect?: () => Promise<void>
}

/**
 * WalletCard - Fixed Top Section
 *
 * Displays wallet balance, 24h change, and address
 * Always visible, never scrolls away
 * Clean, minimal design with perfect typography hierarchy
 */
export function WalletCard({ balance, change24h, address, monBalance, isDeploying, status, connect }: WalletCardProps) {
  const { balanceVisible, toggleBalance } = useSidebarStore()
  const [copied, setCopied] = useState(false)

  // Memoized format functions to prevent unnecessary re-renders in OdometerNumber
  const formatUSD = useCallback((value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)
  }, [])

  const formatPercentage = useCallback((value: number) => {
    return value.toFixed(1)
  }, [])

  const formatMON = useCallback((value: number) => {
    // Show more decimals for small values, fewer for large
    if (value < 1) return value.toFixed(4)
    if (value < 100) return value.toFixed(2)
    return value.toFixed(1)
  }, [])

  const formatAddress = (addr: string) => {
    // Show "Deploying..." only when actively deploying
    if (isDeploying) {
      return 'Deploying...'
    }
    // Show "Connect Wallet" when no wallet is connected
    if (!addr || addr === '' || addr === '0x0000000000000000000000000000000000000000') {
      return 'Connect Wallet'
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

  // Check if wallet is connected
  const isConnected = address && address !== '' && address !== '0x0000000000000000000000000000000000000000'
  const isConnecting = status === 'connecting' || status === 'initializing'

  const handleAddressClick = async () => {
    if (isConnected) {
      // Copy address if connected
      navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else if (connect && !isConnecting) {
      // Trigger wallet connect if not connected
      await connect()
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Address Row */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleAddressClick}
          disabled={isConnecting}
          className={cn(
            "flex items-center gap-2",
            "px-3 py-1.5 rounded-[16px]",
            "transition-all duration-200",
            "text-xs font-mono",
            "bg-white/10",
            "hover:bg-white/15",
            "text-white/60",
            !isConnected && "hover:bg-accent/20 hover:text-white",
            isConnecting && "opacity-50 cursor-not-allowed"
          )}
        >
          <span>{isConnecting ? 'Connecting...' : formatAddress(address)}</span>
          {isConnected ? (
            copied ? (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-green-500"
              >
                ✓
              </motion.span>
            ) : (
              <Copy className="w-3 h-3" />
            )
          ) : null}
        </button>

        {/* Network Indicator */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#6E54FF] animate-pulse" />
          <span className="text-xs text-white/40">
            MONAD
          </span>
        </div>
      </div>

      {/* Balance Display */}
      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          {balanceVisible ? (
            <OdometerNumber
              value={balance}
              format={formatUSD}
              className="text-3xl font-semibold text-white"
              duration={0.5}
            />
          ) : (
            <h2 className="text-3xl font-semibold tabular-nums text-white">
              ••••••
            </h2>
          )}
          <button
            onClick={toggleBalance}
            className={cn(
              "p-1.5 rounded-lg",
              "transition-colors duration-200",
              "hover:bg-white/10",
              "text-white/40",
              "hover:text-white/60"
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
              {change24h >= 0 ? '+' : '-'}
              <OdometerNumber
                value={Math.abs(change24h)}
                format={formatPercentage}
                duration={0.4}
              />
              %
            </span>
            <span className="text-xs text-white/40">
              24h
            </span>
          </motion.div>
        )}
      </div>

      {/* Simplified Stats - Only MON */}
      {balanceVisible && (
        <div className="pt-4 mt-4 border-t border-white/10">
          <div>
            <div className="text-xs uppercase tracking-wider mb-1 text-white/40">
              MON Balance
            </div>
            <div className="text-lg font-mono font-semibold text-white">
              <OdometerNumber
                value={parseFloat(monBalance) || 0}
                format={formatMON}
                duration={0.5}
              />
              {' '}MON
            </div>
          </div>
        </div>
      )}
    </div>
  )
}