'use client'

import { useState, useEffect } from 'react'
import { MinimalSidebar } from '../sidebar/MinimalSidebar'
import { MessageList } from '../chat/MessageList'
import { ChatInput } from '../chat/ChatInput'
import { SettingsMenu } from '../chat/SettingsMenu'
import { useSidebarStore } from '@/stores/useSidebarStore'
import { motion } from 'framer-motion'

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
            {/* Message List */}
            <MessageList />

            {/* Settings Menu */}
            <SettingsMenu
              isOpen={settingsMenuOpen}
              onClose={() => setSettingsMenuOpen(false)}
            />

            {/* Chat Input - Overlay at bottom */}
            <div className="absolute bottom-0 left-0 right-0 z-30">
              <ChatInput />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
