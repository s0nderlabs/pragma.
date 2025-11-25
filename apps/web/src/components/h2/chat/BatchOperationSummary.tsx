/**
 * BatchOperationSummary Component
 *
 * Displays parallel batch operations in a table/grid view.
 * Shows status for operations executing simultaneously.
 */

'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/stores/useThemeStore'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { Check, Loader2, XCircle, Clock } from 'lucide-react'

export interface BatchOperation {
  id: string
  type: 'swap' | 'transfer' | 'stake' | 'unstake' | 'wrap' | 'unwrap' | 'nft_buy' | 'nft_sell' | 'nft_transfer'
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'error'
  error?: string
  startTime?: number
  endTime?: number
  txHash?: string
}

interface BatchOperationSummaryProps {
  operations: BatchOperation[]
  title?: string
}

export function BatchOperationSummary({ operations, title = 'Batch Operations' }: BatchOperationSummaryProps) {
  const { theme: pragmaTheme } = useThemeStore()

  // Calculate stats
  const completed = operations.filter(op => op.status === 'completed').length
  const inProgress = operations.filter(op => op.status === 'in_progress').length
  const failed = operations.filter(op => op.status === 'error').length
  const pending = operations.filter(op => op.status === 'pending').length

  const totalProgress = (completed / operations.length) * 100

  return (
    <div className="mb-6">
      <LiquidGlassPanel
        theme={pragmaTheme === 'pragma-dark' ? 'dark' : 'light'}
        className="rounded-2xl p-6"
        blurAmount={6}
        displacementScale={0.3}
        stdDeviation={0.03}
      >
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">{title}</h3>
            <span className="text-sm opacity-60">{completed}/{operations.length} completed</span>
          </div>

          {/* Progress Bar */}
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-[#E07A5F] to-[#6E54FF]"
              initial={{ width: 0 }}
              animate={{ width: `${totalProgress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>

          {/* Stats */}
          <div className="flex gap-4 mt-3 text-xs">
            {inProgress > 0 && (
              <div className="flex items-center gap-1 text-[#F2A694]">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{inProgress} running</span>
              </div>
            )}
            {pending > 0 && (
              <div className="flex items-center gap-1 opacity-60">
                <Clock className="w-3 h-3" />
                <span>{pending} pending</span>
              </div>
            )}
            {failed > 0 && (
              <div className="flex items-center gap-1 text-red-400">
                <XCircle className="w-3 h-3" />
                <span>{failed} failed</span>
              </div>
            )}
          </div>
        </div>

        {/* Operations Grid */}
        <div className="space-y-2">
          {operations.map((op, index) => (
            <motion.div
              key={op.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`
                p-3 rounded-lg border flex items-center gap-3
                ${op.status === 'completed' ? 'bg-green-500/5 border-green-500/20' : ''}
                ${op.status === 'in_progress' ? 'bg-[#E07A5F]/5 border-[#E07A5F]/20' : ''}
                ${op.status === 'error' ? 'bg-red-500/5 border-red-500/20' : ''}
                ${op.status === 'pending' ? 'bg-white/5 border-white/10' : ''}
              `}
            >
              {/* Status Icon */}
              <div className="flex-shrink-0">
                {op.status === 'completed' && (
                  <Check className="w-5 h-5 text-green-400" />
                )}
                {op.status === 'in_progress' && (
                  <Loader2 className="w-5 h-5 text-[#F2A694] animate-spin" />
                )}
                {op.status === 'error' && (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
                {op.status === 'pending' && (
                  <Clock className="w-5 h-5 opacity-40" />
                )}
              </div>

              {/* Operation Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium truncate">{op.description}</span>
                  <span className="text-xs opacity-40 uppercase flex-shrink-0">{op.type}</span>
                </div>

                {/* Error Message */}
                {op.error && (
                  <p className="text-xs text-red-400 mt-1">{op.error}</p>
                )}

                {/* Duration */}
                {op.startTime && op.endTime && (
                  <p className="text-xs opacity-40 mt-1">
                    ✓ {((op.endTime - op.startTime) / 1000).toFixed(1)}s
                  </p>
                )}

                {/* Transaction Hash */}
                {op.txHash && (
                  <a
                    href={`https://testnet.monadexplorer.com/tx/${op.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-cyan-400 hover:underline mt-1 inline-block"
                  >
                    View tx: {op.txHash.slice(0, 6)}...{op.txHash.slice(-4)}
                  </a>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </LiquidGlassPanel>
    </div>
  )
}
