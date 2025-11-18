'use client'

import { useThemeStore } from '@/stores/useThemeStore'
import { useIdentity } from '@/hooks/useIdentity'
import { useH2Session } from '@/hooks/useH2Session'
import { Sun, Moon, Wallet, Key, LogOut, LogIn, Loader2 } from 'lucide-react'

/**
 * Settings Panel accordion section
 * Contains:
 * - Theme toggle
 * - Wallet connection controls
 * - Session key status
 */
export function SettingsPanel() {
  const { theme, toggleTheme } = useThemeStore()
  const { status, wallet, connect, disconnect } = useIdentity()
  const { sessionData, clearSession } = useH2Session()

  const handleDisconnect = async () => {
    // Clear both Web3Auth and H2 session
    await disconnect()
    clearSession()
  }

  return (
    <div className="py-4 space-y-4">
      {/* Theme Toggle */}
      <div className="px-4">
        <div className="flex items-center justify-between py-2">
          <span className="text-sm font-medium">Theme</span>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--liquid-glass-color)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--liquid-glass-color)_18%,transparent)] transition-colors"
          >
            {theme === 'pragma-light' ? (
              <>
                <Sun className="w-4 h-4" />
                <span className="text-xs">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4" />
                <span className="text-xs">Dark</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Wallet Connection */}
      <div className="px-4">
        {status === 'connected' && wallet ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Wallet className="w-4 h-4" />
              <span className="font-mono text-xs">
                {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
              </span>
            </div>
            <button
              onClick={handleDisconnect}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--liquid-glass-color)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--liquid-glass-color)_18%,transparent)] transition-colors text-sm"
            >
              <LogOut className="w-4 h-4" />
              <span>Disconnect</span>
            </button>
          </div>
        ) : status === 'connecting' || status === 'initializing' ? (
          <button
            disabled
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--liquid-glass-color)_12%,transparent)] transition-colors text-sm opacity-50 cursor-not-allowed"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{status === 'initializing' ? 'Initializing...' : 'Connecting...'}</span>
          </button>
        ) : status === 'error' ? (
          <div className="space-y-2">
            <div className="text-xs text-red-500">Connection failed</div>
            <button
              onClick={connect}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--liquid-glass-color)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--liquid-glass-color)_18%,transparent)] transition-colors text-sm"
            >
              <LogIn className="w-4 h-4" />
              <span>Retry Connection</span>
            </button>
          </div>
        ) : (
          <button
            onClick={connect}
            disabled={status === 'idle'}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--liquid-glass-color)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--liquid-glass-color)_18%,transparent)] transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <LogIn className="w-4 h-4" />
            <span>{status === 'idle' ? 'Preparing...' : 'Connect Wallet'}</span>
          </button>
        )}
      </div>

      {/* Session Key Status */}
      <div className="px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Key className="w-4 h-4" />
          {sessionData?.sessionKeyAddress ? (
            <span className="font-mono text-xs">
              Session: {sessionData.sessionKeyAddress.slice(0, 6)}...
              {sessionData.sessionKeyAddress.slice(-4)}
            </span>
          ) : (
            <span className="opacity-50">No session key</span>
          )}
        </div>
      </div>
    </div>
  )
}
