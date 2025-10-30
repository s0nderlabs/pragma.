'use client'

/**
 * Balance Header - Simple Text Display
 * Shows realtime MON balance at top of sidebar
 * Placeholder for Phase 1 - will integrate with wallet in Phase 2+
 */
export function BalanceHeader() {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider opacity-60 mb-1">
        Balance
      </div>
      <div className="text-2xl font-semibold font-mono">
        --- <span className="text-sm opacity-60">MON</span>
      </div>
    </div>
  )
}
