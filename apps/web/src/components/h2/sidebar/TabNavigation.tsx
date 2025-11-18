'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

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

  const tabs = [
    { id: 'activity' as const, label: 'Activity', icon: '↗' },
    { id: 'sessions' as const, label: 'Sessions', icon: '💬' },
    { id: 'tools' as const, label: 'Tools', icon: '⚙' },
  ]

  const activeIndex = tabs.findIndex(tab => tab.id === activeTab)

  return (
    <div className="relative flex p-1 rounded-[32px] bg-black/5 dark:bg-white/5">
      {/* Sliding Background */}
      <motion.div
        className="absolute inset-y-1 rounded-[24px] bg-black/10 dark:bg-white/10"
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
              ? "text-black dark:text-white"
              : "text-black/60 dark:text-white/60 hover:text-black/80 dark:hover:text-white/80"
          )}
        >
          <span className="text-base">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  )
}