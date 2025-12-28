'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Keyboard, Compass, Zap, MessageSquare, HelpCircle, MousePointer, Lightbulb, Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useShortcutPanelStore } from '@/stores/useShortcutPanelStore'
import { useIsMobile } from '@/hooks/useIsMobile'

interface ShortcutItem {
  winKey: string
  macKey: string
  description: string
}

interface ShortcutCategory {
  title: string
  icon: React.ReactNode
  shortcuts: ShortcutItem[]
}

const shortcutCategories: ShortcutCategory[] = [
  {
    title: 'Navigation',
    icon: <Compass className="w-4 h-4" />,
    shortcuts: [
      { winKey: 'Alt + \\', macKey: '⌥ \\', description: 'Toggle sidebar' },
      { winKey: 'Alt + ←', macKey: '⌥ ←', description: 'Previous tab' },
      { winKey: 'Alt + →', macKey: '⌥ →', description: 'Next tab' },
      { winKey: 'Alt + A', macKey: '⌥ A', description: 'Activity tab' },
      { winKey: 'Alt + B', macKey: '⌥ B', description: 'Balances tab' },
      { winKey: 'Alt + N', macKey: '⌥ N', description: 'NFTs tab' },
      { winKey: 'Alt + ,', macKey: '⌥ ,', description: 'Settings tab' },
    ],
  },
  {
    title: 'Actions',
    icon: <Zap className="w-4 h-4" />,
    shortcuts: [
      { winKey: 'Alt + C', macKey: '⌥ C', description: 'Copy wallet address' },
      { winKey: 'Alt + H', macKey: '⌥ H', description: 'Toggle balance visibility' },
      { winKey: 'Alt + T', macKey: '⌥ T', description: 'Toggle theme' },
      { winKey: 'Alt + M', macKey: '⌥ M', description: 'Toggle Quick Mode' },
    ],
  },
  {
    title: 'Chat',
    icon: <MessageSquare className="w-4 h-4" />,
    shortcuts: [
      { winKey: 'Alt + /', macKey: '⌥ /', description: 'Focus chat input' },
      { winKey: 'Enter', macKey: 'Return', description: 'Send message' },
    ],
  },
  {
    title: 'Voice',
    icon: <Mic className="w-4 h-4" />,
    shortcuts: [
      { winKey: 'Alt + V', macKey: '⌥ V', description: 'Toggle voice recording' },
      { winKey: 'Alt + V (hold)', macKey: '⌥ V (hold)', description: 'Push-to-talk' },
      { winKey: 'Esc', macKey: 'Esc', description: 'Cancel recording' },
    ],
  },
  {
    title: 'Help',
    icon: <HelpCircle className="w-4 h-4" />,
    shortcuts: [
      { winKey: 'Alt + K', macKey: '⌥ K', description: 'Show keyboard shortcuts' },
    ],
  },
]

const tips = [
  { icon: <MousePointer className="w-4 h-4" />, text: 'Move mouse to left edge to open sidebar' },
  { icon: <Keyboard className="w-4 h-4" />, text: 'Press Esc to close this panel' },
]

// Stagger animation for list items
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0 },
}

/**
 * ShortcutPanel - Slide-out keyboard shortcuts guide
 *
 * Apple × Dieter Rams Design
 * Slides in from the right edge
 * Semi-transparent backdrop with glass morphism
 */
export function ShortcutPanel() {
  const { isOpen, close } = useShortcutPanelStore()
  const [platform, setPlatform] = useState<'mac' | 'win'>('mac')
  const isMobile = useIsMobile()

  // Detect platform on mount
  useEffect(() => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    setPlatform(isMac ? 'mac' : 'win')
  }, [])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        close()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, close])

  // Don't render on mobile - keyboard shortcuts are desktop-only
  if (isMobile) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={close}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{
              type: 'spring',
              damping: 30,
              stiffness: 300,
            }}
            className={cn(
              'fixed right-0 top-0 bottom-0 z-50',
              'w-[320px]',
              'flex flex-col',
              'overflow-hidden'
            )}
          >
            {/* Glass background */}
            <div
              className={cn(
                'absolute inset-0',
                'bg-[#1a1a1a]/95 dark:bg-[#0a0a0a]/95',
                'backdrop-blur-xl',
                'border-l border-white/10'
              )}
            />

            {/* Content */}
            <div className="relative flex flex-col h-full">
              {/* Scrollable content - header scrolls with content */}
              <div className="flex-1 overflow-y-auto">
                {/* Header */}
                <div className="p-6 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="p-2 rounded-xl bg-accent/20"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Keyboard className="w-5 h-5 text-accent" />
                      </motion.div>
                      <h2 className="text-lg font-semibold text-white">
                        Shortcuts
                      </h2>
                    </div>

                    {/* Platform Toggle */}
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-white/5">
                      <button
                        onClick={() => setPlatform('mac')}
                        className={cn(
                          'px-2 py-1 rounded-md text-xs font-medium transition-all duration-200',
                          platform === 'mac'
                            ? 'bg-white/10 text-white'
                            : 'text-white/40 hover:text-white/60'
                        )}
                      >
                        Mac
                      </button>
                      <button
                        onClick={() => setPlatform('win')}
                        className={cn(
                          'px-2 py-1 rounded-md text-xs font-medium transition-all duration-200',
                          platform === 'win'
                            ? 'bg-white/10 text-white'
                            : 'text-white/40 hover:text-white/60'
                        )}
                      >
                        Win
                      </button>
                    </div>
                  </div>
                </div>

                {/* Categories */}
                <motion.div
                  className="px-6 pb-6 space-y-6"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {/* Shortcut categories */}
                  {shortcutCategories.map((category, categoryIndex) => (
                    <motion.div
                      key={category.title}
                      variants={itemVariants}
                      transition={{ delay: categoryIndex * 0.05 }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-white/40">{category.icon}</span>
                        <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">
                          {category.title}
                        </h3>
                      </div>
                      <div className="space-y-2">
                        {category.shortcuts.map((shortcut) => (
                          <motion.div
                            key={shortcut.winKey}
                            className={cn(
                              'flex items-center justify-between',
                              'p-3 rounded-xl',
                              'bg-white/5',
                              'cursor-default',
                              'transition-colors duration-200'
                            )}
                            whileHover={{
                              backgroundColor: 'rgba(255, 255, 255, 0.1)',
                              scale: 1.01,
                            }}
                            transition={{ duration: 0.15 }}
                          >
                            <span className="text-sm text-white/80">
                              {shortcut.description}
                            </span>
                            <motion.kbd
                              key={platform}
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.15 }}
                              className={cn(
                                'px-2 py-1 rounded-lg',
                                'text-xs font-mono',
                                'bg-white/10',
                                'text-white/60',
                                'border border-white/10'
                              )}
                            >
                              {platform === 'mac' ? shortcut.macKey : shortcut.winKey}
                            </motion.kbd>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  ))}

                  {/* Tips section */}
                  <motion.div
                    className="pt-4 border-t border-white/10"
                    variants={itemVariants}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-white/40"><Lightbulb className="w-4 h-4" /></span>
                      <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">
                        Tips
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {tips.map((tip, index) => (
                        <motion.div
                          key={index}
                          className={cn(
                            'flex items-center gap-3',
                            'p-3 rounded-xl',
                            'bg-white/5',
                            'transition-colors duration-200'
                          )}
                          whileHover={{
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            scale: 1.01,
                          }}
                          transition={{ duration: 0.15 }}
                        >
                          <span className="text-white/40">{tip.icon}</span>
                          <span className="text-sm text-white/80">{tip.text}</span>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
