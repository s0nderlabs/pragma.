'use client'

import { useEffect, useRef } from 'react'
import { useThemeStore } from '@/stores/useThemeStore'
import { useChatStore } from '@/stores/useChatStore'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { Toggle } from '@/components/ui/Toggle'
import { motion, AnimatePresence } from 'framer-motion'

interface ModePopoverProps {
  isOpen: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement>
}

/**
 * ModePopover Component
 *
 * Glass popover displaying Yolo and Quick mode toggles.
 * Appears above the gear icon in ChatInput.
 */
export function ModePopover({ isOpen, onClose, anchorRef }: ModePopoverProps) {
  const { theme } = useThemeStore()
  const { yoloMode, quickMode, toggleYoloMode, toggleQuickMode } = useChatStore()
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
            theme={theme}
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
                  onChange={toggleQuickMode}
                  label="Toggle Quick Mode"
                />
              </div>

              {/* Divider */}
              <div className="h-px bg-white/10" />

              {/* Yolo Mode */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="font-medium text-sm mb-1">Yolo Mode</div>
                  <div className="text-xs opacity-60 leading-relaxed">
                    Allow unverified tokens and risky actions without warnings.
                  </div>
                </div>
                <Toggle
                  enabled={yoloMode}
                  onChange={toggleYoloMode}
                  label="Toggle Yolo Mode"
                />
              </div>
            </div>
          </LiquidGlassPanel>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
