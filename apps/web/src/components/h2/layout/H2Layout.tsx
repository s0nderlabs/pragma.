'use client'

import { useThemeStore } from '@/stores/useThemeStore'
import Background from '../Background'
import { MobileHeader } from './MobileHeader'
import { ChatContainer } from './ChatContainer'

/**
 * H2Layout Component
 *
 * Main layout orchestrator for H2 UI.
 * NOW: Single unified glass panel (ChatContainer) containing sidebar + messages.
 *
 * Components:
 * - Background: Iridescence shader (z-0)
 * - MobileHeader: Hamburger menu (z-40, mobile only)
 * - ChatContainer: Fullscreen glass panel with sidebar + chat (z-20)
 *
 * Layout Evolution:
 * - Phase 1 (before): Two separate glass panels (sidebar + chat)
 * - Phase 1 (now): Single unified glass panel (better space utilization)
 */
export function H2Layout() {
  const { theme } = useThemeStore()

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      data-theme={theme}
      style={{
        color: theme === 'pragma-light' ? '#224' : '#e1e1e1',
      }}
    >
      {/* Background - Iridescence shader (z-0) */}
      <Background />

      {/* Mobile Header (z-40, mobile only) */}
      <MobileHeader />

      {/* Main Content Area (z-20) */}
      <div className="relative z-20 h-screen pt-16 lg:pt-0">
        {/* Single unified chat container with sidebar inside */}
        <ChatContainer />
      </div>
    </div>
  )
}
