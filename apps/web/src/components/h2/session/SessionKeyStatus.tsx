/**
 * SessionKeyStatus Component
 *
 * Displays session key information in the settings sidebar.
 * Shows balance, address, and funding controls.
 */

'use client'

import { useState, useEffect } from 'react'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { useH2Session } from '@/hooks/useH2Session'
import { useThemeStore } from '@/stores/useThemeStore'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { Wallet, ArrowDownToLine, ArrowUpFromLine, Key, Copy, Check, ExternalLink } from 'lucide-react'
import { formatEther, type Address } from 'viem'
import { MONAD_BLOCK_EXPLORER_URL } from '@/lib/config'

interface SessionKeyStatusProps {
  onFund?: () => void
  onWithdraw?: () => void
  onExportKey?: () => void
}

export function SessionKeyStatus({ onFund, onWithdraw, onExportKey }: SessionKeyStatusProps) {
  const { theme: pragmaTheme } = useThemeStore()
  const { sessionData } = useH2Session()
  const [balance, setBalance] = useState<bigint | null>(null)
  const [isLoadingBalance, setIsLoadingBalance] = useState(false)
  const [copied, setCopied] = useState(false)

  const sessionKeyAddress = sessionData?.sessionKeyAddress

  // Copy address to clipboard
  const handleCopyAddress = async () => {
    if (!sessionKeyAddress) return

    try {
      await navigator.clipboard.writeText(sessionKeyAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy address:', error)
    }
  }

  // Format address for display
  const formatAddress = (address: Address) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // If no session key, show placeholder
  if (!sessionKeyAddress) {
    return (
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="text-center opacity-60">
          <Wallet className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No session key active</p>
          <p className="text-xs mt-1 opacity-60">Connect wallet to continue</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Session Key Info */}
      <LiquidGlassPanel
        theme={pragmaTheme === 'pragma-dark' ? 'dark' : 'light'}
        className="p-4 rounded-xl"
        blurAmount={4}
        displacementScale={0.2}
        stdDeviation={0.02}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <Key className="w-4 h-4 text-cyan-400" />
          <h4 className="text-sm font-semibold">Session Key</h4>
        </div>

        {/* Address */}
        <div className="mb-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs opacity-60">Address</span>
            <button
              onClick={handleCopyAddress}
              className="flex items-center gap-1 text-xs hover:text-cyan-400 transition-colors"
            >
              <span className="font-mono">{formatAddress(sessionKeyAddress)}</span>
              {copied ? (
                <Check className="w-3 h-3 text-green-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
          <a
            href={`${MONAD_BLOCK_EXPLORER_URL}/address/${sessionKeyAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-cyan-400 hover:underline flex items-center gap-1 mt-1"
          >
            View on explorer
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Balance */}
        <div className="mb-3 pb-3 border-b border-white/10">
          <div className="flex items-baseline justify-between">
            <span className="text-xs opacity-60">Balance</span>
            <div className="text-right">
              {balance !== null ? (
                <>
                  <div className="text-lg font-semibold">
                    {parseFloat(formatEther(balance)).toFixed(4)} MON
                  </div>
                  <div className="text-xs opacity-40">
                    Used for gas & transaction fees
                  </div>
                </>
              ) : (
                <div className="text-sm opacity-60">
                  {isLoadingBalance ? 'Loading...' : 'Unknown'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onFund}
            className="px-3 py-2 rounded-lg bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <ArrowDownToLine className="w-4 h-4" />
            Fund
          </button>
          <button
            onClick={onWithdraw}
            className="px-3 py-2 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <ArrowUpFromLine className="w-4 h-4" />
            Withdraw
          </button>
        </div>

        {/* Export Key Button */}
        {onExportKey && (
          <button
            onClick={onExportKey}
            className="w-full mt-2 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors flex items-center justify-center gap-2 text-sm text-red-400"
          >
            <Key className="w-4 h-4" />
            Export Private Key
          </button>
        )}
      </LiquidGlassPanel>

      {/* Security Notice */}
      <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
        <p className="text-xs opacity-70">
          <span className="font-medium">Security:</span> Session keys are ephemeral and limited by caveats. Never share your private key.
        </p>
      </div>
    </div>
  )
}
