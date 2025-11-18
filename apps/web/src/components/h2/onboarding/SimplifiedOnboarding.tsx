'use client'

import { useState, useEffect } from 'react'
import { useIdentity } from '@/hooks/useIdentity'
import { useTheme } from 'next-themes'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { Loader2 } from 'lucide-react'

/**
 * SimplifiedOnboarding Component (H2)
 *
 * Minimal onboarding for H2 - just connect wallet, no delegation modal.
 *
 * Key Differences from H1:
 * - NO delegation issuance UI
 * - NO mode selection (Safe/Normal)
 * - NO token allowlist configuration
 * - User goes straight to chat after connecting
 *
 * Flow:
 * 1. User clicks "Connect Wallet"
 * 2. Web3Auth modal opens
 * 3. HybridDelegator automatically deployed (if needed)
 * 4. User immediately redirected to chat
 *
 * Ephemeral delegations created later (after quote confirmation).
 */
export function SimplifiedOnboarding() {
  const { connect, status } = useIdentity()
  const { resolvedTheme } = useTheme()
  const [error, setError] = useState<string | null>(null)

  const isConnecting = status === 'connecting' || status === 'initializing'
  const isError = status === 'error'

  const handleConnect = async () => {
    setError(null)
    try {
      await connect()
      // On success, useIdentity hook will automatically update status to 'connected'
      // H2Layout will detect this and show ChatContainer
    } catch (err) {
      // Check if user cancelled
      const errorMessage = err instanceof Error ? err.message : String(err)
      const isCancelled = errorMessage.toLowerCase().includes('user closed') ||
                         errorMessage.toLowerCase().includes('user cancelled')

      if (!isCancelled) {
        setError('Failed to connect. Please try again.')
        console.error('Connection failed:', err)
      }
      // If cancelled, just do nothing (user intentionally closed modal)
    }
  }

  return (
    <div className="w-full h-screen flex items-center justify-center p-4">
      {/* Center Card */}
      <LiquidGlassPanel
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
        className="w-full max-w-md p-8"
        blurAmount={6}
        displacementScale={0.5}
        stdDeviation={0.05}
      >
        <div className="text-center space-y-6">
          {/* Logo/Title */}
          <div>
            <h1 className="text-3xl font-bold mb-2">
              Pragma H2
            </h1>
            <p className="text-sm opacity-60">
              Your AI-powered blockchain assistant
            </p>
          </div>

          {/* Connect Button */}
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className={`
              w-full py-3 px-6 rounded-lg font-medium
              transition-all duration-200
              ${isConnecting
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:scale-105 active:scale-95'
              }
            `}
            style={{
              background: resolvedTheme === 'light'
                ? 'linear-gradient(135deg, #E07A5F 0%, #7D3F2B 100%)'
                : 'linear-gradient(135deg, #F2A694 0%, #E07A5F 100%)',
              color: '#FFFFFF',
            }}
          >
            {isConnecting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Connecting...
              </span>
            ) : (
              'Connect Wallet'
            )}
          </button>

          {/* Error Message */}
          {(error || isError) && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-sm text-red-500">
                {error || 'Connection error. Please try again.'}
              </p>
            </div>
          )}

          {/* Info Text */}
          <div className="pt-4 border-t border-white/10">
            <p className="text-xs opacity-40">
              Connect with Web3Auth to start chatting with your AI assistant.
              <br />
              No delegation setup required.
            </p>
          </div>
        </div>
      </LiquidGlassPanel>
    </div>
  )
}
