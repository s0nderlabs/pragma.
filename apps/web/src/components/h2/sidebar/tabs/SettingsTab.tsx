'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/useThemeStore'
import { useH2Session } from '@/hooks/useH2Session'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { ExportSessionKeyModal } from '@/components/h2/session/ExportSessionKeyModal'
import { Moon, Sun, LogOut, Loader2, Key, Keyboard, ExternalLink } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useShortcutPanelStore } from '@/stores/useShortcutPanelStore'
import { useIsMobile } from '@/hooks/useIsMobile'

interface SettingsTabProps {
  status: string
  wallet: { address?: string } | null
  connect: () => Promise<void>
  disconnect: () => Promise<void>
}

/**
 * SettingsTab - Dieter Rams × Jony Ive Design
 *
 * "Less, but better" - Reduced to 2 cards + footer
 * Card 1: Wallet (Disconnect + Export Session Key)
 * Card 2: Preferences (Theme + Shortcuts)
 * Footer: Legal (subtle, de-emphasized)
 */
export function SettingsTab({ status, wallet, connect, disconnect }: SettingsTabProps) {
  const { theme: pragmaTheme, setTheme: setZustandTheme } = useThemeStore()
  const { sessionData, clearSession } = useH2Session()
  const openShortcutPanel = useShortcutPanelStore((state) => state.open)
  const [mounted, setMounted] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && pragmaTheme === 'pragma-dark'
  const isConnecting = status === 'connecting' || status === 'initializing'
  const isConnected = status === 'connected' && wallet?.address

  const handleWalletAction = async () => {
    if (isConnected) {
      useH2ChatStore.getState().clearMessages()
      clearSession()
      await disconnect()
    } else {
      await connect()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Main content */}
      <div className="space-y-3">
        {/* Card 1: Wallet */}
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

          <div className="mt-4 space-y-3">
            {isConnected && wallet?.address ? (
              <>
                {/* Disconnect - Primary action */}
                <button
                  onClick={handleWalletAction}
                  disabled={isConnecting}
                  className={cn(
                    "w-full py-3 rounded-[12px]",
                    "flex items-center justify-center gap-2",
                    "text-sm font-medium",
                    "transition-all duration-200",
                    "bg-white/10 hover:bg-white/15",
                    "border border-white/15",
                    "text-white"
                  )}
                >
                  <LogOut className="w-4 h-4" />
                  <span>Disconnect</span>
                </button>

                {/* Export Session Key - Subtle secondary */}
                {sessionData?.sessionKeyAddress && (
                  <button
                    onClick={() => setShowExportModal(true)}
                    className={cn(
                      "w-full py-2 px-3 rounded-[10px]",
                      "flex items-center justify-center gap-1.5",
                      "text-xs",
                      "transition-all duration-200",
                      "text-red-400/70 hover:text-red-400",
                      "hover:bg-red-500/5"
                    )}
                  >
                    <Key className="w-3 h-3" />
                    Export Session Key
                  </button>
                )}
              </>
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

        {/* Card 2: Preferences (Theme + Shortcuts) */}
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
            Preferences
          </div>

          {/* Theme row */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-white/60">Theme</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZustandTheme('pragma-light')}
                className={cn(
                  "w-9 h-9 rounded-full",
                  "flex items-center justify-center",
                  "transition-all duration-200",
                  !isDark
                    ? "bg-accent text-white"
                    : "bg-white/10 text-white/40 hover:text-white/60"
                )}
              >
                <Sun className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZustandTheme('pragma-dark')}
                className={cn(
                  "w-9 h-9 rounded-full",
                  "flex items-center justify-center",
                  "transition-all duration-200",
                  isDark
                    ? "bg-accent text-white"
                    : "bg-white/10 text-white/40 hover:text-white/60"
                )}
              >
                <Moon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Shortcuts row - Desktop only */}
          {!isMobile && (
            <button
              onClick={openShortcutPanel}
              className={cn(
                "w-full py-2.5 px-4 rounded-[12px]",
                "flex items-center justify-between",
                "text-sm",
                "transition-all duration-200",
                "bg-white/5 hover:bg-white/10",
                "border border-white/10",
                "text-white/80 hover:text-white"
              )}
            >
              <div className="flex items-center gap-2">
                <Keyboard className="w-4 h-4" />
                <span>Shortcuts</span>
              </div>
              <kbd
                className={cn(
                  "px-2 py-0.5 rounded-md",
                  "text-xs font-mono",
                  "bg-white/10",
                  "text-white/60"
                )}
              >
                Alt+K
              </kbd>
            </button>
          )}
        </motion.div>
      </div>

      {/* Footer: Legal (subtle, de-emphasized) - pushed to bottom */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mt-auto pt-6"
      >
        <div className="flex items-center justify-center gap-3 text-xs text-white/30">
          <a
            href="https://pr4gma.xyz/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white/50 transition-colors flex items-center gap-1"
          >
            Terms
            <ExternalLink className="w-3 h-3" />
          </a>
          <span>·</span>
          <span>Beta Horizon 2</span>
        </div>
      </motion.div>

      {/* Export Session Key Modal */}
      <ExportSessionKeyModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        privateKey={sessionData?.sessionKeyPrivateKey ?? null}
      />
    </div>
  )
}
