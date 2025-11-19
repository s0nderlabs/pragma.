'use client'

import { useState, useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { Toggle } from '@/components/ui/Toggle'
import { motion, AnimatePresence } from 'framer-motion'

interface ModePopoverProps {
  isOpen: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
}

/**
 * ModePopover Component
 *
 * Glass popover displaying Quick mode toggle for H2.
 * Appears above the gear icon in ChatInput.
 *
 * Quick Mode: Auto-execute operations without asking for confirmation.
 */
export function ModePopover({ isOpen, onClose, anchorRef }: ModePopoverProps) {
  const { resolvedTheme } = useTheme()
  const { quickMode, setQuickMode } = useH2ChatStore()
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose, anchorRef])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="absolute bottom-full left-0 mb-2 z-50"
        >
          <LiquidGlassPanel
            theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
            className="rounded-[20px] p-4 min-w-[280px] shadow-2xl"
            blurAmount={8}
            displacementScale={0.4}
            stdDeviation={0.03}
          >
            <div className="space-y-4">
              {/* Quick Mode */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="font-medium text-sm mb-1">Quick Mode</div>
                  <div className="text-xs opacity-60 leading-relaxed">
                    Auto-execute without confirmation. Faster, but skips review step.
                  </div>
                </div>
                <Toggle
                  enabled={quickMode}
                  onChange={setQuickMode}
                  label="Toggle Quick Mode"
                />
              </div>
            </div>
          </LiquidGlassPanel>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
