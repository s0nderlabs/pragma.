'use client'

import { useThemeStore } from '@/stores/useThemeStore'
import { Sun, Moon, Wallet, Key } from 'lucide-react'

/**
 * Settings Panel accordion section
 * Contains:
 * - Theme toggle (functional)
 * - Wallet info (placeholder)
 * - Session key status (placeholder)
 */
export function SettingsPanel() {
  const { theme, toggleTheme } = useThemeStore()

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

      {/* Wallet (Placeholder) */}
      <div className="px-4 py-2 opacity-50">
        <div className="flex items-center gap-2 text-sm">
          <Wallet className="w-4 h-4" />
          <span>Wallet: Not connected</span>
        </div>
      </div>

      {/* Session Key (Placeholder) */}
      <div className="px-4 py-2 opacity-50">
        <div className="flex items-center gap-2 text-sm">
          <Key className="w-4 h-4" />
          <span>Session Key: Not initialized</span>
        </div>
      </div>
    </div>
  )
}
