'use client'

import { useState, useEffect, useRef } from 'react'
import { useThemeStore } from '@/stores/useThemeStore'
import { useYoloStore } from '@/stores/useYoloStore'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { X, Zap } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface SettingsMenuProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * SettingsMenu Component
 *
 * Dropdown menu from settings gear in chat input.
 * Features: Yolo mode toggle
 */
export function SettingsMenu({ isOpen, onClose }: SettingsMenuProps) {
  const { theme } = useThemeStore()
  const { enabled: yoloEnabled, toggle: toggleYolo } = useYoloStore()
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="absolute bottom-full left-4 mb-2 z-50 w-64"
        >
          <LiquidGlassPanel
            theme={theme}
            className="rounded-[20px] p-4"
            blurAmount={8}
            displacementScale={0.4}
            stdDeviation={0.04}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Chat Settings</h3>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Close settings"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Yolo Mode Toggle */}
            <div className="space-y-3">
              <div
                onClick={toggleYolo}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${yoloEnabled ? 'bg-yellow-500/20' : 'bg-white/5'}`}>
                    <Zap className={`w-4 h-4 ${yoloEnabled ? 'text-yellow-400' : 'opacity-60'}`} />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Yolo Mode</div>
                    <div className="text-xs opacity-60">Skip confirmation, execute immediately</div>
                  </div>
                </div>

                {/* Toggle Switch */}
                <div
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    yoloEnabled ? 'bg-yellow-500/30' : 'bg-white/10'
                  }`}
                >
                  <motion.div
                    initial={false}
                    animate={{ x: yoloEnabled ? 20 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className={`absolute top-1 w-4 h-4 rounded-full ${
                      yoloEnabled ? 'bg-yellow-400' : 'bg-white/40'
                    }`}
                  />
                </div>
              </div>
            </div>
          </LiquidGlassPanel>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
