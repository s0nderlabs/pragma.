'use client'

import { useState } from 'react'
import { MinimalSidebar } from '../sidebar/MinimalSidebar'
import { MessageList } from '../chat/MessageList'
import { ChatInput } from '../chat/ChatInput'
import { SettingsMenu } from '../chat/SettingsMenu'
import { useSidebarStore } from '@/stores/useSidebarStore'
import { motion } from 'framer-motion'

/**
 * ChatContainer Component
 *
 * Main chat interface with Apple × Dieter Rams minimal sidebar.
 * Chat area adjusts position based on sidebar state.
 *
 * This is the main H2 UI surface.
 */
export function ChatContainer() {
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const { isOpen } = useSidebarStore()

  return (
    <div className="w-full h-full relative">
      {/* Minimal Sidebar with drawer slide collapse */}
      <MinimalSidebar />

      {/* Main Chat Area - adjusts position based on sidebar state */}
      <motion.div
        className="h-full relative overflow-hidden"
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
          <div className="flex-1 flex flex-col relative">
            {/* Message List */}
            <MessageList />

            {/* Settings Menu */}
            <SettingsMenu
              isOpen={settingsMenuOpen}
              onClose={() => setSettingsMenuOpen(false)}
            />

            {/* Chat Input */}
            <ChatInput />
          </div>
        </div>
      </motion.div>
    </div>
  )
}
