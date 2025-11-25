/**
 * ActiveTools Component
 *
 * Shows active tool executions with status indicators.
 * Displays running, completed, and error states for tools.
 */

'use client'

import { useState, useEffect } from 'react'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { useThemeStore } from '@/stores/useThemeStore'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'

export function ActiveTools() {
  const { theme: pragmaTheme } = useThemeStore()
  const activeTools = useH2ChatStore((state) => state.activeTools)

  // Convert Map to array for rendering
  const toolsArray = Array.from(activeTools.values())

  if (toolsArray.length === 0) {
    return null
  }

  return (
    <div className="mb-4 space-y-2">
      {toolsArray.map((tool) => {
        const isRunning = tool.status === 'running'
        const isCompleted = tool.status === 'completed'
        const isError = tool.status === 'error'

        return (
          <div key={tool.toolName} className="flex items-start gap-3">
            {/* Status Icon */}
            <div className="flex-shrink-0 mt-1">
              {isRunning && (
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
              )}
              {isCompleted && (
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              )}
              {isError && (
                <XCircle className="w-5 h-5 text-red-400" />
              )}
            </div>

            {/* Tool Info */}
            <LiquidGlassPanel
              theme={pragmaTheme === 'pragma-dark' ? 'dark' : 'light'}
              className="flex-1 rounded-2xl p-3"
              blurAmount={6}
              displacementScale={0.3}
              stdDeviation={0.03}
            >
              <div className="text-sm font-medium">
                <span className={
                  isRunning ? 'text-blue-300' :
                  isCompleted ? 'text-green-300' :
                  'text-red-300'
                }>
                  {tool.toolName}
                </span>
              </div>
              <div className="text-xs opacity-60 mt-1">
                {isRunning && 'Running...'}
                {isCompleted && `Completed in ${
                  tool.endTime && tool.startTime
                    ? Math.round((tool.endTime - tool.startTime) / 1000)
                    : '?'
                }s`}
                {isError && tool.error}
              </div>
            </LiquidGlassPanel>
          </div>
        )
      })}
    </div>
  )
}
