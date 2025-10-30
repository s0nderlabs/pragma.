'use client'

import { Receipt } from 'lucide-react'

/**
 * Receipt Archive accordion section
 * Shows list of past transactions with icons, amounts, timestamps
 * Placeholder for Phase 1 - will integrate with localStorage in Phase 2+
 */
export function ReceiptArchive() {
  return (
    <div className="py-6 px-2 text-center opacity-60">
      <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p className="text-sm">No receipts yet</p>
      <p className="text-xs mt-1 opacity-60">
        Execute an intent to see receipts here
      </p>
    </div>
  )
}
