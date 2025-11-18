'use client'

import { motion } from 'framer-motion'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/useThemeStore'
import { Moon, Sun, LogOut, Loader2, Copy, Check } from 'lucide-react'
import { useState } from 'react'

interface SettingsTabProps {
  status: string
  wallet: { address?: string } | null
  connect: () => Promise<void>
  disconnect: () => Promise<void>
}

/**
 * SettingsTab - Apple × Dieter Rams Design
 *
 * "Less, but better" - Only essential settings
 * Icon-only theme switcher, no decorative elements
 * Mathematical precision in spacing and alignment
 */
export function SettingsTab({ status, wallet, connect, disconnect }: SettingsTabProps) {
  const { resolvedTheme } = useTheme()
  const { setTheme: setZustandTheme } = useThemeStore()
  const [copied, setCopied] = useState(false)

  const isDark = resolvedTheme === 'dark'

  const isConnecting = status === 'connecting' || status === 'initializing'
  const isConnected = status === 'connected' && wallet?.address

  const handleWalletAction = async () => {
    if (isConnected) {
      await disconnect()
    } else {
      await connect()
    }
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const copyAddress = async () => {
    if (wallet?.address) {
      await navigator.clipboard.writeText(wallet.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-3">
      {/* Wallet - Priority component */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className={cn(
          "p-5 rounded-[24px]",
          "transition-colors duration-200 border",
          "bg-white/10",
          "border-white/10"
        )}
      >
        <div className="text-sm font-medium text-white">
          Wallet
        </div>

        <div className="mt-4">
          {isConnected && wallet?.address ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-white/60">
                  {formatAddress(wallet.address)}
                </span>
                <button
                  onClick={copyAddress}
                  className={cn(
                    "p-1.5 rounded-lg",
                    "transition-colors duration-200",
                    "hover:bg-white/10",
                    "text-white/40",
                    "hover:text-accent"
                  )}
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <button
                onClick={handleWalletAction}
                disabled={isConnecting}
                className={cn(
                  "flex items-center gap-1.5",
                  "text-xs font-medium",
                  "text-white/40",
                  "hover:text-accent",
                  "transition-colors duration-200"
                )}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          ) : (
            <button
              onClick={handleWalletAction}
              disabled={isConnecting}
              className={cn(
                "w-full py-2.5 rounded-[12px]",
                "text-sm font-medium",
                "transition-all duration-200",
                "bg-accent text-white",
                "hover:bg-accent/90",
                isConnecting && "opacity-50 cursor-not-allowed"
              )}
            >
              {isConnecting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting...
                </span>
              ) : (
                'Connect Wallet'
              )}
            </button>
          )}
        </div>
      </motion.div>

      {/* Theme Switcher - Icon Only */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={cn(
          "p-5 rounded-[24px]",
          "transition-colors duration-200 border",
          "bg-white/10",
          "border-white/10"
        )}
      >
        <div className="text-sm font-medium text-white mb-4">
          Theme
        </div>

        {/* Icon-only theme selector */}
        <div className="flex items-center justify-center gap-8">
          <button
            onClick={() => setZustandTheme('pragma-light')}
            className={cn(
              "flex flex-col items-center gap-2",
              "transition-all duration-200"
            )}
          >
            <div className={cn(
              "w-12 h-12 rounded-full",
              "flex items-center justify-center",
              "transition-all duration-200",
              !isDark
                ? "bg-accent text-white"
                : "bg-white/10 text-white/40 hover:text-white/60"
            )}>
              <Sun className="w-5 h-5" />
            </div>
            <span className={cn(
              "text-xs transition-colors duration-200",
              !isDark
                ? "text-white font-medium"
                : "text-white/40"
            )}>
              Light
            </span>
          </button>

          <button
            onClick={() => setZustandTheme('pragma-dark')}
            className={cn(
              "flex flex-col items-center gap-2",
              "transition-all duration-200"
            )}
          >
            <div className={cn(
              "w-12 h-12 rounded-full",
              "flex items-center justify-center",
              "transition-all duration-200",
              isDark
                ? "bg-accent text-white"
                : "bg-white/10 text-white/40 hover:text-white/60"
            )}>
              <Moon className="w-5 h-5" />
            </div>
            <span className={cn(
              "text-xs transition-colors duration-200",
              isDark
                ? "text-white font-medium"
                : "text-white/40"
            )}>
              Dark
            </span>
          </button>
        </div>
      </motion.div>

      {/* Footer */}
      <div className={cn(
        "pt-6 text-center",
        "text-xs",
        "text-white/30"
      )}>
        Pragma H2.5
      </div>
    </div>
  )
}
