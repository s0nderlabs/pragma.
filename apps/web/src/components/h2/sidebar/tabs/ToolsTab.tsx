'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/useThemeStore'
import { useIdentity } from '@/hooks/useIdentity'
import { Moon, Sun, Wallet, LogOut, Loader2 } from 'lucide-react'

/**
 * ToolsTab - Minimal Settings
 *
 * Only essential settings: theme toggle and wallet connection
 * Clean, grayscale design with minimal interaction
 */
export function ToolsTab() {
  const { theme, setTheme } = useThemeStore()
  const isDark = theme === 'pragma-dark'
  const { connect, disconnect, status, wallet } = useIdentity()

  const isConnecting = status === 'connecting' || status === 'initializing'
  const isConnected = status === 'connected' && wallet?.address

  const handleWalletAction = async () => {
    if (isConnected) {
      await disconnect()
    } else {
      await connect()
    }
  }

  // Format wallet address
  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  return (
    <div className="space-y-3">
      {/* Theme Toggle */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className={cn(
          "p-4 rounded-[24px]",
          "transition-colors duration-200 border",
          isDark
            ? "bg-black/40 hover:bg-black/50 border-white/10"
            : "bg-white hover:bg-gray-50 border-black/5"
        )}
      >
        <button
          onClick={() => setTheme(isDark ? 'pragma-light' : 'pragma-dark')}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-[16px]",
              "flex items-center justify-center",
              isDark ? "bg-white/10" : "bg-black/10"
            )}>
              {isDark ? (
                <Moon className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </div>
            <div className="text-left">
              <div className={cn(
                "text-sm font-medium",
                isDark ? "text-white" : "text-black"
              )}>
                Theme
              </div>
              <div className={cn(
                "text-xs",
                isDark ? "text-white/40" : "text-black/40"
              )}>
                {isDark ? 'Dark mode' : 'Light mode'}
              </div>
            </div>
          </div>

          {/* Simple Toggle Indicator */}
          <div className={cn(
            "w-12 h-7 rounded-full p-1 border",
            "transition-colors duration-200",
            isDark
              ? "bg-white/10 border-white/20"
              : "bg-black/10 border-black/20"
          )}>
            <motion.div
              className="w-5 h-5 rounded-full bg-white"
              animate={{
                x: isDark ? 20 : 0
              }}
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 30
              }}
            />
          </div>
        </button>
      </motion.div>

      {/* Wallet Connection */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={cn(
          "p-4 rounded-[24px]",
          "transition-colors duration-200 border",
          isDark
            ? "bg-black/40 hover:bg-black/50 border-white/10"
            : "bg-white hover:bg-gray-50 border-black/5"
        )}
      >
        <button
          onClick={handleWalletAction}
          disabled={isConnecting}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-[16px]",
              "flex items-center justify-center",
              isDark ? "bg-white/10" : "bg-black/10"
            )}>
              <Wallet className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className={cn(
                "text-sm font-medium",
                isDark ? "text-white" : "text-black"
              )}>
                Wallet
              </div>
              <div className={cn(
                "text-xs",
                isDark ? "text-white/40" : "text-black/40"
              )}>
                {isConnected && wallet?.address
                  ? formatAddress(wallet.address)
                  : isConnecting
                  ? 'Connecting...'
                  : 'Not connected'}
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className={cn(
            "flex items-center gap-1.5",
            "px-3 py-1.5 rounded-[12px]",
            "text-xs font-medium border",
            isConnecting && "opacity-50",
            isDark
              ? "bg-white/10 text-white/60 border-white/10"
              : "bg-black/5 text-black/60 border-black/10"
          )}>
            {isConnecting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : isConnected ? (
              <>
                <LogOut className="w-3 h-3" />
                <span>Disconnect</span>
              </>
            ) : (
              <span>Connect</span>
            )}
          </div>
        </button>
      </motion.div>

      {/* Simple Footer */}
      <div className={cn(
        "pt-6 text-center",
        "text-xs",
        isDark ? "text-white/30" : "text-black/30"
      )}>
        Pragma H2.5
      </div>
    </div>
  )
}