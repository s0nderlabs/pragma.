'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/useThemeStore'

interface TabNavigationProps {
  activeTab: 'activity' | 'sessions' | 'tools'
  onTabChange: (tab: 'activity' | 'sessions' | 'tools') => void
}

/**
 * TabNavigation - iOS-inspired Segmented Control
 *
 * Clean tab switcher with sliding background
 * 32px outer radius, 24px inner for active state
 * Smooth transitions between tabs
 */
export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const { theme } = useThemeStore()
  const isDark = theme === 'pragma-dark'

  const tabs = [
    { id: 'activity' as const, label: 'Activity', icon: '↗' },
    { id: 'sessions' as const, label: 'Sessions', icon: '💬' },
    { id: 'tools' as const, label: 'Tools', icon: '⚙' },
  ]

  const activeIndex = tabs.findIndex(tab => tab.id === activeTab)

  return (
    <div
      className={cn(
        "relative flex p-1 rounded-[32px]",
        isDark
          ? "bg-white/5"
          : "bg-black/5"
      )}
    >
      {/* Sliding Background */}
      <motion.div
        className={cn(
          "absolute inset-y-1 rounded-[24px]",
          isDark
            ? "bg-white/10"
            : "bg-black/10"
        )}
        animate={{
          x: `${activeIndex * 100}%`,
          width: `${100 / tabs.length}%`,
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30,
        }}
      />

      {/* Tab Buttons */}
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "relative z-10 flex-1",
            "flex items-center justify-center gap-1.5",
            "py-2 px-3",
            "rounded-[24px]",
            "transition-colors duration-200",
            "text-sm font-medium",
            activeTab === tab.id
              ? isDark
                ? "text-white"
                : "text-black"
              : isDark
              ? "text-white/60 hover:text-white/80"
              : "text-black/60 hover:text-black/80"
          )}
        >
          <span className="text-base">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  )
}