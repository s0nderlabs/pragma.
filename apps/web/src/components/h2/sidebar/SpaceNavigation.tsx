'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/useThemeStore'
import { useEffect, useRef } from 'react'

interface SpaceNavigationProps {
  activeTab: 'activity' | 'sessions' | 'tools'
  onTabChange: (tab: 'activity' | 'sessions' | 'tools') => void
}

/**
 * SpaceNavigation - Arc Browser Inspired Navigation
 *
 * Minimal dot indicators with arrow navigation
 * Swipe gesture support for mobile
 * Clean, grayscale design with subtle terracotta accent
 */
export function SpaceNavigation({ activeTab, onTabChange }: SpaceNavigationProps) {
  const { theme } = useThemeStore()
  const isDark = theme === 'pragma-dark'
  const containerRef = useRef<HTMLDivElement>(null)

  const spaces = [
    { id: 'activity' as const, name: 'Activity' },
    { id: 'sessions' as const, name: 'Sessions' },
    { id: 'tools' as const, name: 'Tools' },
  ]

  const currentIndex = spaces.findIndex(space => space.id === activeTab)

  const handlePrevious = () => {
    const newIndex = currentIndex > 0 ? currentIndex - 1 : spaces.length - 1
    onTabChange(spaces[newIndex].id)
  }

  const handleNext = () => {
    const newIndex = currentIndex < spaces.length - 1 ? currentIndex + 1 : 0
    onTabChange(spaces[newIndex].id)
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && e.altKey) {
        e.preventDefault()
        handlePrevious()
      } else if (e.key === 'ArrowRight' && e.altKey) {
        e.preventDefault()
        handleNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex])

  // Touch/swipe support
  useEffect(() => {
    if (!containerRef.current) return

    let startX = 0
    let startY = 0

    const handleTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }

    const handleTouchEnd = (e: TouchEvent) => {
      const endX = e.changedTouches[0].clientX
      const endY = e.changedTouches[0].clientY
      const diffX = endX - startX
      const diffY = endY - startY

      // Only trigger if horizontal swipe is dominant
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
        if (diffX > 0) {
          handlePrevious()
        } else {
          handleNext()
        }
      }
    }

    const container = containerRef.current
    container.addEventListener('touchstart', handleTouchStart)
    container.addEventListener('touchend', handleTouchEnd)

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchend', handleTouchEnd)
    }
  }, [currentIndex])

  return (
    <div ref={containerRef} className="relative">
      {/* Navigation Container */}
      <div className="flex items-center justify-between">
        {/* Previous Arrow */}
        <button
          onClick={handlePrevious}
          className={cn(
            "p-1.5 rounded-lg",
            "transition-all duration-200",
            isDark
              ? "hover:bg-white/10 text-white/40 hover:text-white/60"
              : "hover:bg-black/5 text-black/40 hover:text-black/60"
          )}
          aria-label="Previous space"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Center Content */}
        <div className="flex-1 text-center">
          {/* Dot Indicators */}
          <div className="flex items-center justify-center gap-2 mb-2">
            {spaces.map((space, index) => (
              <button
                key={space.id}
                onClick={() => onTabChange(space.id)}
                className={cn(
                  "h-2 rounded-full",
                  "transition-all duration-300",
                  index === currentIndex
                    ? "w-6 bg-accent"
                    : cn(
                        "w-2",
                        isDark
                          ? "bg-white/20 hover:bg-white/30"
                          : "bg-black/30 hover:bg-black/40"
                      )
                )}
                aria-label={`Go to ${space.name}`}
              />
            ))}
          </div>

          {/* Space Name */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "text-sm font-medium",
                isDark ? "text-white" : "text-black"
              )}
            >
              {spaces[currentIndex].name}
            </motion.div>
          </AnimatePresence>

          {/* Keyboard Hint */}
          <div className={cn(
            "text-xs mt-1",
            isDark ? "text-white/20" : "text-black/20"
          )}>
            Alt + ← →
          </div>
        </div>

        {/* Next Arrow */}
        <button
          onClick={handleNext}
          className={cn(
            "p-1.5 rounded-lg",
            "transition-all duration-200",
            isDark
              ? "hover:bg-white/10 text-white/40 hover:text-white/60"
              : "hover:bg-black/5 text-black/40 hover:text-black/60"
          )}
          aria-label="Next space"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}