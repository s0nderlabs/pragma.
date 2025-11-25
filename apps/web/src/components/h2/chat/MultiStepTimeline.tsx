/**
 * MultiStepTimeline Component
 *
 * Displays sequential multi-step operations with visual timeline.
 * Shows progress as steps complete (e.g., "swap then stake").
 */

'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/stores/useThemeStore'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { Check, Loader2, XCircle, Circle } from 'lucide-react'

export interface TimelineStep {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'error'
  error?: string
  startTime?: number
  endTime?: number
}

interface MultiStepTimelineProps {
  steps: TimelineStep[]
  title?: string
}

export function MultiStepTimeline({ steps, title = 'Multi-Step Operation' }: MultiStepTimelineProps) {
  const { theme: pragmaTheme } = useThemeStore()

  // Calculate overall progress
  const completedSteps = steps.filter(s => s.status === 'completed').length
  const progress = (completedSteps / steps.length) * 100

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
          <h3 className="text-lg font-semibold mb-2">{title}</h3>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#E07A5F] to-[#6E54FF]"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className="text-sm font-medium opacity-60">
              {completedSteps}/{steps.length}
            </span>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={step.id} className="relative">
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="absolute left-[15px] top-[40px] w-[2px] h-[calc(100%+16px)] bg-white/10" />
              )}

              {/* Step Card */}
              <div className="flex gap-4">
                {/* Status Icon */}
                <div className="relative flex-shrink-0">
                  <div
                    className={`
                      w-8 h-8 rounded-full flex items-center justify-center relative z-10
                      ${step.status === 'completed' ? 'bg-green-500/20 border-2 border-green-500' : ''}
                      ${step.status === 'in_progress' ? 'bg-[#E07A5F]/20 border-2 border-[#E07A5F]' : ''}
                      ${step.status === 'error' ? 'bg-red-500/20 border-2 border-red-500' : ''}
                      ${step.status === 'pending' ? 'bg-white/5 border-2 border-white/20' : ''}
                    `}
                  >
                    {step.status === 'completed' && (
                      <Check className="w-4 h-4 text-green-400" />
                    )}
                    {step.status === 'in_progress' && (
                      <Loader2 className="w-4 h-4 text-[#F2A694] animate-spin" />
                    )}
                    {step.status === 'error' && (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    {step.status === 'pending' && (
                      <Circle className="w-3 h-3 opacity-40" />
                    )}
                  </div>
                </div>

                {/* Step Content */}
                <div className="flex-1 pb-4">
                  <div className="mb-1">
                    <h4 className="font-medium">{step.title}</h4>
                    <p className="text-sm opacity-60">{step.description}</p>
                  </div>

                  {/* Error Message */}
                  {step.error && (
                    <div className="mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                      <p className="text-xs text-red-400">{step.error}</p>
                    </div>
                  )}

                  {/* Duration */}
                  {step.startTime && step.endTime && (
                    <div className="mt-2 text-xs opacity-40">
                      Completed in {((step.endTime - step.startTime) / 1000).toFixed(1)}s
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </LiquidGlassPanel>
    </div>
  )
}
