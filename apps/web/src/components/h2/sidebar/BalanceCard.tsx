'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useSidebarStore } from '@/stores/useSidebarStore'
import { useTheme } from 'next-themes'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'

interface BalanceCardProps {
  status?: string
  wallet?: any
}

/**
 * Balance Card - Compact Glass Card
 * Shows address + balance with toggle visibility
 * Always rendered at top-left of sidebar
 */
export function BalanceCard({ status, wallet }: BalanceCardProps) {
  const { balanceVisible, toggleBalance } = useSidebarStore()
  const { resolvedTheme } = useTheme()

  // Format address for display
  const address = wallet?.address
    ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
    : status === 'connecting' || status === 'initializing'
    ? 'Connecting...'
    : 'Not connected'

  // TODO: Fetch real balance from blockchain
  const balance = wallet?.address ? '1,234.56' : '0.00'

  return (
    <LiquidGlassPanel
      theme={resolvedTheme === 'dark' ? 'pragma-dark' : 'pragma-light'}
      className="rounded-[32px] p-8 w-full min-h-[160px]"
      blurAmount={4}
      displacementScale={0.2}
      stdDeviation={0.02}
    >
      <div className="flex flex-col h-full justify-between">
        <div className="flex items-start justify-between gap-3 mb-4">
          {/* Address */}
          <div className="text-sm opacity-60 font-mono truncate flex-1">
            {address}
          </div>

          {/* Toggle Button */}
          <button
            onClick={toggleBalance}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
            aria-label={balanceVisible ? 'Hide balance' : 'Show balance'}
          >
            {balanceVisible ? (
              <Eye className="w-5 h-5 opacity-60" />
            ) : (
              <EyeOff className="w-5 h-5 opacity-60" />
            )}
          </button>
        </div>

        {/* Balance */}
        <div className="text-3xl font-semibold font-mono">
          {wallet?.address ? (
            balanceVisible ? (
              <>
                {balance} <span className="text-base opacity-60">MON</span>
              </>
            ) : (
              <>
                ****.**<span className="text-base opacity-60"> MON</span>
              </>
            )
          ) : (
            <span className="text-lg opacity-60">
              {status === 'connecting' || status === 'initializing'
                ? 'Loading...'
                : 'No wallet'}
            </span>
          )}
        </div>
      </div>
    </LiquidGlassPanel>
  )
}
