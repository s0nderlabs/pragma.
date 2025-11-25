'use client'

import { useState, useEffect } from 'react'
import { MinimalSidebar } from '../sidebar/MinimalSidebar'
import { MessageList } from '../chat/MessageList'
import { ChatInput } from '../chat/ChatInput'
import { EmptyState } from '../chat/EmptyState'
import { SettingsMenu } from '../chat/SettingsMenu'
import { ShortcutPanel } from '../ui/ShortcutPanel'
import { useSidebarStore } from '@/stores/useSidebarStore'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'

interface ChatContainerProps {
  status: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connect: () => Promise<any>
  disconnect: () => Promise<void>
}

/**
 * ChatContainer Component
 *
 * Main chat interface with Apple × Dieter Rams minimal sidebar.
 * Chat area adjusts position based on sidebar state.
 *
 * This is the main H2 UI surface.
 */
export function ChatContainer({ status, wallet, connect, disconnect }: ChatContainerProps) {
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { isOpen } = useSidebarStore()
  const messages = useH2ChatStore((state) => state.messages)
  const isStreaming = useH2ChatStore((state) => state.isStreaming)

  const isEmpty = messages.length === 0 && !isStreaming

  // Track mounted state to skip initial animation on page load
  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="w-full h-full relative">
      {/* Minimal Sidebar with drawer slide collapse */}
      <MinimalSidebar
        status={status}
        wallet={wallet}
        connect={connect}
        disconnect={disconnect}
      />

      {/* Main Chat Area - adjusts position based on sidebar state */}
      <motion.div
        className="h-full relative overflow-hidden"
        // Skip initial animation on page load to prevent slide glitch
        initial={mounted ? undefined : { marginLeft: isOpen ? 380 : 0 }}
        animate={{
          marginLeft: isOpen ? 380 : 0,
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30,
        }}
      >
        <div className="flex h-full relative">
          {/* Messages Section */}
          <div className="flex-1 relative">
            <LayoutGroup>
              <AnimatePresence mode="wait">
                {isEmpty ? (
                  /* Empty State - Centered greeting with morphing input */
                  <motion.div
                    key="empty-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="h-full"
                  >
                    <EmptyState>
                      {/* Input with layoutId for smooth position morph */}
                      <motion.div
                        layoutId="chat-input"
                        layout
                        className="w-full max-w-2xl"
                        transition={{
                          layout: {
                            type: "spring",
                            stiffness: 200,
                            damping: 25,
                          }
                        }}
                      >
                        <ChatInput />
                      </motion.div>
                    </EmptyState>
                  </motion.div>
                ) : (
                  /* Chat Mode - Messages with morphing bottom input */
                  <motion.div
                    key="chat-mode"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="h-full"
                  >
                    {/* Message List */}
                    <MessageList />

                    {/* Chat Input - Same layoutId morphs from center to bottom */}
                    <motion.div
                      layoutId="chat-input"
                      layout
                      className="absolute bottom-0 left-0 right-0 z-30"
                      transition={{
                        layout: {
                          type: "spring",
                          stiffness: 200,
                          damping: 25,
                        }
                      }}
                    >
                      <ChatInput />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </LayoutGroup>

            {/* Settings Menu */}
            <SettingsMenu
              isOpen={settingsMenuOpen}
              onClose={() => setSettingsMenuOpen(false)}
            />
          </div>
        </div>
      </motion.div>

      {/* Keyboard Shortcuts Panel */}
      <ShortcutPanel />
    </div>
  )
}
