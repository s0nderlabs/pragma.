'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/useThemeStore'
import { useH2Session } from '@/hooks/useH2Session'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { ExportSessionKeyModal } from '@/components/h2/session/ExportSessionKeyModal'
import { RotateSessionKeyModal } from '@/components/h2/session/RotateSessionKeyModal'
import { NuclearRevokeModal } from '@/components/h2/session/NuclearRevokeModal'
import { useSessionKeyBalance } from '@/hooks/useSessionKeyBalance'
import { Moon, Sun, LogOut, Loader2, Key, Keyboard, ExternalLink, RefreshCw, ShieldAlert } from 'lucide-react'
import { OdometerNumber } from '@/components/h2/ui/OdometerNumber'
import { useState, useEffect, useCallback } from 'react'
import { useShortcutPanelStore } from '@/stores/useShortcutPanelStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { Address } from 'viem'

interface SettingsTabProps {
  status: string
  wallet: { address?: string } | null
  connect: () => Promise<void>
  disconnect: () => Promise<void>
}

/**
 * SettingsTab - Icon Action Grid Design
 *
 * Control center style with prominent balance card,
 * icon action grid, and slide toggle for theme.
 */
export function SettingsTab({ status, wallet, connect, disconnect }: SettingsTabProps) {
  const { theme: pragmaTheme, setTheme: setZustandTheme } = useThemeStore()
  const { sessionData, clearSession } = useH2Session()
  const openShortcutPanel = useShortcutPanelStore((state) => state.open)
  const [mounted, setMounted] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showRotateModal, setShowRotateModal] = useState(false)
  const [showNuclearRevokeModal, setShowNuclearRevokeModal] = useState(false)
  const isMobile = useIsMobile()

  const { balanceFormatted } = useSessionKeyBalance(
    sessionData?.sessionKeyAddress as Address | undefined
  )

  // Memoized format function to prevent OdometerNumber re-renders
  const formatSessionKeyBalance = useCallback((value: number) => {
    if (value < 1) return value.toFixed(4)
    if (value < 100) return value.toFixed(2)
    return value.toFixed(1)
  }, [])

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

  const toggleTheme = () => {
    setZustandTheme(isDark ? 'pragma-light' : 'pragma-dark')
  }

  // Action button component
  const ActionButton = ({
    icon: Icon,
    label,
    onClick,
    variant = 'default'
  }: {
    icon: React.ElementType
    label: string
    onClick: () => void
    variant?: 'default' | 'danger'
  }) => (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-2 p-4 rounded-2xl",
        "transition-all duration-200",
        "border border-transparent",
        variant === 'default' && [
          "bg-white/[0.03] hover:bg-white/[0.06]",
          "hover:border-white/[0.08]",
        ],
        variant === 'danger' && [
          "bg-red-500/[0.05] hover:bg-red-500/[0.1]",
          "hover:border-red-500/20",
        ]
      )}
    >
      <Icon className={cn(
        "w-5 h-5",
        variant === 'default' && "text-white/50",
        variant === 'danger' && "text-red-400/70"
      )} />
      <span className={cn(
        "text-[11px] font-medium",
        variant === 'default' && "text-white/50",
        variant === 'danger' && "text-red-400/70"
      )}>
        {label}
      </span>
    </motion.button>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Connect Button (only when not connected) */}
      {!isConnected && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <button
            onClick={handleWalletAction}
            disabled={isConnecting}
            className={cn(
              "w-full py-3 rounded-xl",
              "text-sm font-medium",
              "bg-accent text-white",
              "hover:bg-accent/90",
              "transition-all duration-200",
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
        </motion.div>
      )}

      {/* Balance Card */}
      {isConnected && sessionData?.sessionKeyAddress && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className={cn(
            "relative overflow-hidden rounded-2xl p-5 mb-5",
            "bg-gradient-to-br from-white/[0.06] to-white/[0.02]",
            "border border-white/[0.06]"
          )}
        >
          {/* Subtle glow effect */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-accent/10 rounded-full blur-3xl" />

          <div className="relative">
            <div className="text-[11px] text-white/40 mb-1">
              Session Key Balance
            </div>
            <div className="flex items-baseline gap-2">
              <OdometerNumber
                value={parseFloat(balanceFormatted ?? '0') || 0}
                format={formatSessionKeyBalance}
                className="text-3xl font-light text-white tracking-tight"
                duration={0.5}
              />
              <span className="text-sm font-medium text-white/40">MON</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Action Grid */}
      {isConnected && sessionData?.sessionKeyAddress && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-2 mb-8"
        >
          <ActionButton
            icon={RefreshCw}
            label="Rotate"
            onClick={() => setShowRotateModal(true)}
          />
          <ActionButton
            icon={Key}
            label="Export"
            onClick={() => setShowExportModal(true)}
          />
          <ActionButton
            icon={ShieldAlert}
            label="Revoke"
            onClick={() => setShowNuclearRevokeModal(true)}
            variant="danger"
          />
        </motion.div>
      )}

      {/* Preferences Section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="space-y-4"
      >
        {/* Theme Toggle */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/40">Theme</span>
          <button
            onClick={toggleTheme}
            className={cn(
              "relative w-14 h-7 rounded-full",
              "bg-white/[0.08]",
              "transition-colors duration-200"
            )}
          >
            {/* Sliding pill */}
            <motion.div
              layout
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className={cn(
                "absolute top-0.5 w-6 h-6 rounded-full",
                "bg-accent",
                "flex items-center justify-center",
                "shadow-sm",
                isDark ? "left-[calc(100%-26px)]" : "left-0.5"
              )}
            >
              {isDark ? (
                <Moon className="w-3 h-3 text-white" />
              ) : (
                <Sun className="w-3 h-3 text-white" />
              )}
            </motion.div>
          </button>
        </div>

        {/* Shortcuts */}
        {!isMobile && (
          <button
            onClick={openShortcutPanel}
            className={cn(
              "w-full flex items-center justify-between py-2",
              "text-sm text-white/40 hover:text-white/60",
              "transition-colors duration-150",
              "group"
            )}
          >
            <div className="flex items-center gap-2">
              <Keyboard className="w-4 h-4" />
              <span>Shortcuts</span>
            </div>
            <kbd className={cn(
              "px-2 py-0.5 rounded-md",
              "text-[10px] font-mono",
              "bg-white/[0.04] border border-white/[0.06]",
              "text-white/30 group-hover:text-white/50",
              "transition-colors"
            )}>
              Alt+K
            </kbd>
          </button>
        )}

        {/* Disconnect */}
        {isConnected && (
          <button
            onClick={handleWalletAction}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2 mt-2",
              "text-sm text-white/30 hover:text-white/60",
              "transition-colors duration-150"
            )}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Disconnect</span>
          </button>
        )}
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mt-auto pt-8"
      >
        <div className="flex items-center justify-center gap-2 text-xs text-white/30">
          <a
            href="https://docs.pr4gma.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white/50 transition-colors flex items-center gap-1"
          >
            Docs
            <ExternalLink className="w-3 h-3" />
          </a>
          <span>·</span>
          <span>Beta Horizon 2</span>
        </div>
      </motion.div>

      {/* Modals */}
      <ExportSessionKeyModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        privateKey={sessionData?.sessionKeyPrivateKey ?? null}
      />

      <RotateSessionKeyModal
        isOpen={showRotateModal}
        onClose={() => setShowRotateModal(false)}
        smartAccountAddress={(sessionData?.delegator ?? '0x0') as Address}
      />

      <NuclearRevokeModal
        isOpen={showNuclearRevokeModal}
        onClose={() => setShowNuclearRevokeModal(false)}
      />
    </div>
  )
}
