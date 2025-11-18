'use client'

import { useSidebarStore } from '@/stores/useSidebarStore'

/**
 * Balance Terminal - Terminal-style Balance Display
 * Shows address + balance with ASCII art and terminal styling
 */
export function BalanceTerminal() {
  const { balanceVisible, toggleBalance } = useSidebarStore()

  // Placeholder data - will integrate with wallet later
  const address = '0x1234...5678'
  const balance = '1,234.56'
  const balanceUSD = '2,145.32'
  const change24h = '+5.2'

  return (
    <div className="p-4 bg-card font-mono">
      {/* Terminal Header */}
      <div className="mb-3">
        <div className="text-xs text-muted mb-1">
          ┌─ WALLET ──────────────────┐
        </div>
        <div className="text-xs flex justify-between items-center px-1">
          <span className="text-accent">{address}</span>
          <button
            onClick={toggleBalance}
            className="text-muted hover:text-accent transition-colors"
            aria-label={balanceVisible ? 'Hide balance' : 'Show balance'}
          >
            [{balanceVisible ? 'HIDE' : 'SHOW'}]
          </button>
        </div>
        <div className="text-xs text-muted mt-1">
          └───────────────────────────┘
        </div>
      </div>

      {/* Balance Display */}
      <div className="space-y-2">
        {/* Main Balance */}
        <div className="flex items-baseline justify-between">
          <span className="text-muted text-xs">MON:</span>
          <span className="text-xl font-semibold tabular-nums text-foreground">
            {balanceVisible ? balance : '****.**'}
          </span>
        </div>

        {/* USD Value */}
        <div className="flex items-baseline justify-between">
          <span className="text-muted text-xs">USD:</span>
          <span className="text-sm tabular-nums text-muted">
            ${balanceVisible ? balanceUSD : '****.**'}
          </span>
        </div>

        {/* 24h Change */}
        {balanceVisible && (
          <div className="flex items-center justify-between">
            <span className="text-muted text-xs">24H:</span>
            <span className={`text-sm tabular-nums ${change24h.startsWith('+') ? 'text-accent' : 'text-destructive'}`}>
              {change24h}%
            </span>
          </div>
        )}

        {/* ASCII Progress Bar */}
        {balanceVisible && (
          <div className="pt-3 mt-3 border-t border-border/10">
            <div className="text-xs text-muted mb-2">SYSTEM://HEALTH</div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-accent font-mono">
                [████████░░░░░░░░]
              </span>
              <span className="text-xs text-muted">67%</span>
            </div>
          </div>
        )}
      </div>

      {/* ASCII Chart */}
      {balanceVisible && (
        <div className="mt-4">
          <div className="text-xs text-muted mb-2">7D://TREND</div>
          <div className="font-mono text-xs text-accent">
            <div>│</div>
            <div>│    ╱╲    ╱╲</div>
            <div>│   ╱  ╲__╱  ╲</div>
            <div>│__╱          ╲</div>
            <div>└──────────────</div>
          </div>
        </div>
      )}

      {/* Status Indicators */}
      <div className="mt-4 pt-3 border-t border-border/10 flex justify-between text-xs font-mono">
        <span className="text-accent">
          [●] ONLINE
        </span>
        <span className="text-muted">GAS: 0.0012</span>
      </div>
    </div>
  )
}