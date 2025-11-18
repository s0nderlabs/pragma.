/**
 * ProgressIndicator Component
 *
 * Shows real-time progress updates during tool execution.
 * Mirrors CLI's ⚡ progress messages with smooth animations.
 */

'use client'

import { useState, useEffect } from 'react'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { useTheme } from 'next-themes'
import { Zap } from 'lucide-react'

export function ProgressIndicator() {
  const { resolvedTheme } = useTheme()
  const progress = useH2ChatStore((state) => state.progress)

  if (!progress.isVisible) {
    return null
  }

  return (
    <div className="mb-4 flex items-start gap-3">
      {/* Icon */}
      <div className="flex-shrink-0 mt-1">
        <Zap className="w-5 h-5 text-cyan-400 animate-pulse" />
      </div>

      {/* Progress Message */}
      <LiquidGlassPanel
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
        className="flex-1 rounded-2xl p-4"
        blurAmount={6}
        displacementScale={0.3}
        stdDeviation={0.03}
      >
        <div className="text-sm text-cyan-300 font-medium animate-pulse">
          {progress.message}
        </div>
        {progress.toolName && (
          <div className="text-xs opacity-50 mt-1">
            Tool: {progress.toolName}
          </div>
        )}
      </LiquidGlassPanel>
    </div>
  )
}
